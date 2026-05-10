import { useEffect, useState } from 'react';
import { signInAnonymously, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../lib/firebase';
import { ASYNC_STORAGE_KEYS } from '../lib/constants';
import type { User } from '../types';

function generateAnonymousId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await ensureUserDocument(firebaseUser);
      } else {
        await signInAnonymously(auth);
      }
    });
    return unsubscribe;
  }, []);

  async function ensureUserDocument(firebaseUser: FirebaseUser) {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      setUser(snap.data() as User);
    } else {
      const anonymousId = generateAnonymousId();
      const newUser: Omit<User, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
        uid: firebaseUser.uid,
        nickname: `ランナー #${anonymousId}`,
        anonymousId,
        createdAt: serverTimestamp(),
        totalRuns: 0,
        totalDistance: 0,
      };
      await setDoc(userRef, newUser);
      setUser({ ...newUser, createdAt: null as any });
    }

    await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.USER_ID, firebaseUser.uid);
    setLoading(false);
  }

  return { user, loading };
}
