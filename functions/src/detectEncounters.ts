import * as admin from 'firebase-admin';
import { haversineMeters } from './geo';
import { PROXIMITY_METERS, TIME_WINDOW_SEC, MIN_RUN_DURATION_SEC } from './constants';

interface LocationPoint {
  lat: number;
  lng: number;
  recordedAt: admin.firestore.Timestamp;
}

interface RunDoc {
  runId: string;
  userId: string;
  startedAt: admin.firestore.Timestamp;
  endedAt: admin.firestore.Timestamp | null;
  distanceKm: number;
  avgPaceSecPerKm: number;
  status: 'active' | 'completed';
  processed: boolean;
}

interface UserDoc {
  nickname: string;
  anonymousId: string;
  expoPushToken?: string;
}

interface EncounterMatch {
  otherRunId: string;
  otherUserId: string;
  encounteredAt: admin.firestore.Timestamp;
  locationLat: number;
  locationLng: number;
}

// 時間スロットキー（TIME_WINDOW_SEC単位のバケツ）
function timeSlotKey(ts: admin.firestore.Timestamp): string {
  const slotSec = Math.floor(ts.seconds / TIME_WINDOW_SEC);
  return String(slotSec);
}

export async function detectEncounters(
  db: admin.firestore.Firestore,
  runId: string
): Promise<void> {
  const runRef = db.doc(`runs/${runId}`);
  const runSnap = await runRef.get();
  if (!runSnap.exists) return;

  const run = runSnap.data() as RunDoc;

  // 2分未満のrunは判定しない
  if (!run.endedAt) return;
  const durationSec = run.endedAt.seconds - run.startedAt.seconds;
  if (durationSec < MIN_RUN_DURATION_SEC) {
    await runRef.update({ processed: true });
    return;
  }

  // 自分のlocation点を全取得
  const myLocsSnap = await db.collection(`runs/${runId}/locations`).get();
  const myLocs: LocationPoint[] = myLocsSnap.docs.map((d) => d.data() as LocationPoint);
  if (myLocs.length === 0) {
    await runRef.update({ processed: true });
    return;
  }

  // 時間帯でバケツ分けして計算量を削減
  const myLocsBySlot = new Map<string, LocationPoint[]>();
  for (const loc of myLocs) {
    const key = timeSlotKey(loc.recordedAt);
    if (!myLocsBySlot.has(key)) myLocsBySlot.set(key, []);
    myLocsBySlot.get(key)!.push(loc);
    // 隣接スロットにも入れる（境界のすれ違いを捕捉）
    const adjKey = String(Number(key) + 1);
    if (!myLocsBySlot.has(adjKey)) myLocsBySlot.set(adjKey, []);
    myLocsBySlot.get(adjKey)!.push(loc);
  }

  // 同時間帯の他ユーザーのrunを検索
  const overlappingRunsSnap = await db
    .collection('runs')
    .where('status', 'in', ['active', 'completed'])
    .where('startedAt', '<=', run.endedAt)
    .get();

  const encounters: EncounterMatch[] = [];
  const encounteredRunIds = new Set<string>();

  for (const otherRunDoc of overlappingRunsSnap.docs) {
    const otherRun = otherRunDoc.data() as RunDoc;

    // 自分自身をスキップ
    if (otherRun.userId === run.userId) continue;
    if (otherRunDoc.id === runId) continue;

    // 時間帯の重複チェック
    const otherEndedAt = otherRun.endedAt ?? admin.firestore.Timestamp.now();
    if (otherEndedAt.seconds < run.startedAt.seconds) continue;

    // 相手のlocation点を取得
    const otherLocsSnap = await db.collection(`runs/${otherRunDoc.id}/locations`).get();
    const otherLocs: LocationPoint[] = otherLocsSnap.docs.map((d) => d.data() as LocationPoint);

    // 相手の位置点をスロット別にグループ化
    for (const otherLoc of otherLocs) {
      const slot = timeSlotKey(otherLoc.recordedAt);
      const myLocsInSlot = myLocsBySlot.get(slot) ?? [];

      for (const myLoc of myLocsInSlot) {
        const timeDiffSec = Math.abs(myLoc.recordedAt.seconds - otherLoc.recordedAt.seconds);
        if (timeDiffSec > TIME_WINDOW_SEC) continue;

        const distM = haversineMeters(myLoc.lat, myLoc.lng, otherLoc.lat, otherLoc.lng);
        if (distM < PROXIMITY_METERS) {
          encounters.push({
            otherRunId: otherRunDoc.id,
            otherUserId: otherRun.userId,
            encounteredAt: myLoc.recordedAt,
            locationLat: (myLoc.lat + otherLoc.lat) / 2,
            locationLng: (myLoc.lng + otherLoc.lng) / 2,
          });
          encounteredRunIds.add(otherRunDoc.id);
          break; // 同一runIdペアで1回だけ（dedup）
        }
      }

      if (encounteredRunIds.has(otherRunDoc.id)) break;
    }
  }

  // ユーザー情報を取得
  const myUserSnap = await db.doc(`users/${run.userId}`).get();
  const myUser = myUserSnap.data() as UserDoc;

  const batch = db.batch();
  const expoPushTargets: { token: string; count: number; userId: string }[] = [];

  for (const enc of encounters) {
    const otherUserSnap = await db.doc(`users/${enc.otherUserId}`).get();
    const otherUser = otherUserSnap.data() as UserDoc;

    const summaryId = `${run.userId}_${enc.otherUserId}`;
    const summaryRef = db.doc(`encounterSummaries/${summaryId}`);
    const summarySnap = await summaryRef.get();
    const prevCount = summarySnap.exists ? (summarySnap.data()?.totalCount ?? 0) : 0;
    const newCount = prevCount + 1;

    // encounters: 自分視点
    const myEncRef = db.collection('encounters').doc();
    batch.set(myEncRef, {
      encounterId: myEncRef.id,
      userId: run.userId,
      otherUserId: enc.otherUserId,
      otherNickname: otherUser?.nickname ?? `ランナー #${otherUser?.anonymousId}`,
      otherAnonymousId: otherUser?.anonymousId ?? enc.otherUserId.slice(0, 4).toUpperCase(),
      encounteredAt: enc.encounteredAt,
      runId,
      otherRunId: enc.otherRunId,
      locationLat: enc.locationLat,
      locationLng: enc.locationLng,
      otherPaceSecPerKm: 0,
      count: newCount,
      notified: false,
    });

    // encounters: 相手視点
    const reverseSummaryId = `${enc.otherUserId}_${run.userId}`;
    const reverseSummaryRef = db.doc(`encounterSummaries/${reverseSummaryId}`);
    const reverseSummarySnap = await reverseSummaryRef.get();
    const reversePrevCount = reverseSummarySnap.exists
      ? (reverseSummarySnap.data()?.totalCount ?? 0)
      : 0;
    const reverseNewCount = reversePrevCount + 1;

    const otherEncRef = db.collection('encounters').doc();
    batch.set(otherEncRef, {
      encounterId: otherEncRef.id,
      userId: enc.otherUserId,
      otherUserId: run.userId,
      otherNickname: myUser?.nickname ?? `ランナー #${myUser?.anonymousId}`,
      otherAnonymousId: myUser?.anonymousId ?? run.userId.slice(0, 4).toUpperCase(),
      encounteredAt: enc.encounteredAt,
      runId: enc.otherRunId,
      otherRunId: runId,
      locationLat: enc.locationLat,
      locationLng: enc.locationLng,
      otherPaceSecPerKm: 0,
      count: reverseNewCount,
      notified: false,
    });

    // encounterSummaries upsert（自分視点）
    batch.set(
      summaryRef,
      {
        userId: run.userId,
        otherUserId: enc.otherUserId,
        otherAnonymousId: otherUser?.anonymousId ?? enc.otherUserId.slice(0, 4).toUpperCase(),
        totalCount: newCount,
        lastEncounteredAt: enc.encounteredAt,
        commonArea: '',
      },
      { merge: true }
    );

    // encounterSummaries upsert（相手視点）
    batch.set(
      reverseSummaryRef,
      {
        userId: enc.otherUserId,
        otherUserId: run.userId,
        otherAnonymousId: myUser?.anonymousId ?? run.userId.slice(0, 4).toUpperCase(),
        totalCount: reverseNewCount,
        lastEncounteredAt: enc.encounteredAt,
        commonArea: '',
      },
      { merge: true }
    );

    if (otherUser?.expoPushToken) {
      expoPushTargets.push({
        token: otherUser.expoPushToken,
        count: reverseNewCount,
        userId: enc.otherUserId,
      });
    }
  }

  batch.update(runRef, { processed: true });
  await batch.commit();

  // Push通知送信
  if (myUser?.expoPushToken && encounters.length > 0) {
    await sendExpoPushNotification(myUser.expoPushToken, encounters.length);
  }
  for (const target of expoPushTargets) {
    await sendExpoPushNotification(target.token, target.count);
  }
}

async function sendExpoPushNotification(token: string, count: number): Promise<void> {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title: 'ランパス',
        body: `今日 ${count}人のランナーとすれ違いました！`,
        data: { screen: 'home' },
      }),
    });
  } catch (e) {
    console.error('Push notification failed:', e);
  }
}
