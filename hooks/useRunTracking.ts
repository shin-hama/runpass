import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { ASYNC_STORAGE_KEYS, GPS_INTERVAL_SEC } from '../lib/constants';
import { haversineMeters } from '../lib/geo';

export const LOCATION_TASK = 'runpass-location-task';

// バックグラウンドタスク定義（モジュールトップレベル）
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[LocationTask] error:', error);
    return;
  }
  const { locations } = data as { locations: Location.LocationObject[] };
  const uid = await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.USER_ID);
  const runId = await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.RUN_ID);
  if (!uid || !runId || !locations?.length) return;

  const locationsRef = collection(db, 'runs', runId, 'locations');
  for (const loc of locations) {
    const point = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      recordedAt: Timestamp.fromMillis(loc.timestamp),
    };

    // オフライン時のバッファリング
    try {
      await addDoc(locationsRef, point);
    } catch {
      // Firestoreのオフラインキャッシュがキューイングを処理する
    }

    // AsyncStorageにも直近の位置を保存（ペース計算用）
    await AsyncStorage.setItem(
      ASYNC_STORAGE_KEYS.PENDING_LOCATIONS,
      JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude, ts: loc.timestamp })
    );
  }
});

export interface RunStats {
  elapsedSec: number;
  distanceKm: number;
  paceSecPerKm: number;
}

export function useRunTracking() {
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<RunStats>({ elapsedSec: 0, distanceKm: 0, paceSecPerKm: 0 });
  const runIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const distanceRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRun() {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');

    // Firestoreにrunドキュメント作成
    const runRef = doc(collection(db, 'runs'));
    await setDoc(runRef, {
      runId: runRef.id,
      userId: uid,
      startedAt: serverTimestamp(),
      endedAt: null,
      distanceKm: 0,
      avgPaceSecPerKm: 0,
      status: 'active',
      processed: false,
    });

    runIdRef.current = runRef.id;
    await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.RUN_ID, runRef.id);

    await startTracking();

    startTimeRef.current = Date.now();
    distanceRef.current = 0;
    lastPositionRef.current = null;

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setStats((prev) => ({
        elapsedSec: elapsed,
        distanceKm: prev.distanceKm,
        paceSecPerKm: prev.distanceKm > 0 ? elapsed / prev.distanceKm : 0,
      }));
    }, 1000);

    setIsRunning(true);
  }

  async function stopRun() {
    if (!runIdRef.current) return;

    await stopTracking();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const elapsedSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const distanceKm = distanceRef.current;
    const avgPaceSecPerKm = distanceKm > 0 ? elapsedSec / distanceKm : 0;

    await updateDoc(doc(db, 'runs', runIdRef.current), {
      endedAt: serverTimestamp(),
      distanceKm,
      avgPaceSecPerKm,
      status: 'completed',
    });

    await AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.RUN_ID);
    runIdRef.current = null;
    setIsRunning(false);
    setStats({ elapsedSec: 0, distanceKm: 0, paceSecPerKm: 0 });
  }

  function updateDistance(lat: number, lng: number) {
    if (lastPositionRef.current) {
      const meters = haversineMeters(
        lastPositionRef.current.lat,
        lastPositionRef.current.lng,
        lat,
        lng
      );
      distanceRef.current += meters / 1000;
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setStats({
        elapsedSec: elapsed,
        distanceKm: distanceRef.current,
        paceSecPerKm: distanceRef.current > 0 ? elapsed / distanceRef.current : 0,
      });
    }
    lastPositionRef.current = { lat, lng };
  }

  return { isRunning, stats, startRun, stopRun, updateDistance };
}

async function startTracking() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission denied');

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') {
    console.warn('Background location permission not granted');
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: GPS_INTERVAL_SEC * 1000,
    distanceInterval: 20,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'ランパス 記録中',
      notificationBody: '走行を記録しています',
    },
  });
}

async function stopTracking() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
