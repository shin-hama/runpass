import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useEncounters } from '../../hooks/useEncounters';
import EncounterCard from '../../components/EncounterCard';

export default function HomeScreen() {
  const { encounters, loading, error } = useEncounters();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    // 再マウントで再fetch（簡易実装）
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>データを取得できませんでした</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={encounters}
      keyExtractor={(item) => item.encounterId}
      renderItem={({ item }) => (
        <EncounterCard
          encounter={item}
          onPress={() => router.push(`/encounter/${item.encounterId}`)}
        />
      )}
      contentContainerStyle={
        encounters.length === 0 ? styles.emptyContainer : styles.listContent
      }
      ListEmptyComponent={
        <View style={styles.emptyInner}>
          <Text style={styles.emptyText}>まだすれ違いがありません。{'\n'}走ってみましょう！</Text>
        </View>
      }
      ListHeaderComponent={
        <Text style={styles.header}>今週のすれ違い</Text>
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyContainer: {
    flex: 1,
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  emptyInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 26,
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
  },
});
