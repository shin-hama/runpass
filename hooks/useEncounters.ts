import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { Encounter, EncounterSummary } from '../types';

export interface EncounterWithSummary extends Encounter {
  totalCount: number;
}

export function useEncounters() {
  const [encounters, setEncounters] = useState<EncounterWithSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    fetchEncounters(uid);
  }, []);

  async function fetchEncounters(uid: string) {
    try {
      const sevenDaysAgo = Timestamp.fromDate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );

      const q = query(
        collection(db, 'encounters'),
        where('userId', '==', uid),
        where('encounteredAt', '>=', sevenDaysAgo),
        orderBy('encounteredAt', 'desc')
      );

      const snap = await getDocs(q);
      const rawEncounters = snap.docs.map((d) => d.data() as Encounter);

      // encounterSummariesから累計カウントをマージ
      const enriched: EncounterWithSummary[] = await Promise.all(
        rawEncounters.map(async (enc) => {
          const summaryId = `${uid}_${enc.otherUserId}`;
          const summarySnap = await getDoc(doc(db, 'encounterSummaries', summaryId));
          const totalCount = summarySnap.exists()
            ? (summarySnap.data() as EncounterSummary).totalCount
            : enc.count;
          return { ...enc, totalCount };
        })
      );

      setEncounters(enriched);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return { encounters, loading, error };
}
