import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import type { Encounter, EncounterSummary } from '../../types';
import RunnerCard from '../../components/RunnerCard';

export default function EncounterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [summary, setSummary] = useState<EncounterSummary | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchData(id);
  }, [id]);

  async function fetchData(encounterId: string) {
    try {
      const encSnap = await getDoc(doc(db, 'encounters', encounterId));
      if (!encSnap.exists()) {
        setLoading(false);
        return;
      }
      const enc = encSnap.data() as Encounter;
      setEncounter(enc);

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const summaryId = `${uid}_${enc.otherUserId}`;
      const summarySnap = await getDoc(doc(db, 'encounterSummaries', summaryId));
      if (summarySnap.exists()) {
        setSummary(summarySnap.data() as EncounterSummary);
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!encounter || !summary) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFound}>データが見つかりませんでした</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RunnerCard summary={summary} lastPaceSecPerKm={encounter.otherPaceSecPerKm} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  notFound: {
    fontSize: 16,
    color: '#6B7280',
  },
});
