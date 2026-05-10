import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import type { EncounterSummary } from '../types';

interface Props {
  summary: EncounterSummary;
  lastPaceSecPerKm: number;
}

function paceCategory(secPerKm: number): string {
  if (secPerKm <= 0) return '不明';
  const minPerKm = secPerKm / 60;
  if (minPerKm < 4.5) return '早め';
  if (minPerKm < 6.0) return 'ふつう';
  return 'ゆっくり';
}

function relativeTime(ts: { seconds: number } | null): string {
  if (!ts) return '不明';
  const diffSec = Math.floor(Date.now() / 1000) - ts.seconds;
  if (diffSec < 60) return 'たった今';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`;
  return `${Math.floor(diffSec / 86400)}日前`;
}

export default function RunnerCard({ summary, lastPaceSecPerKm }: Props) {
  function handleStamp() {
    Alert.alert('準備中', 'スタンプ機能は近日公開予定です！');
  }

  const pace = paceCategory(lastPaceSecPerKm);
  const lastSeen = relativeTime(summary.lastEncounteredAt as any);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.anonymousId}>ランナー #{summary.otherAnonymousId}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{summary.totalCount}回</Text>
        </View>
      </View>

      <View style={styles.infoGrid}>
        <InfoRow label="ペース帯" value={pace} />
        <InfoRow label="よくすれ違うエリア" value={summary.commonArea || '---'} />
        <InfoRow label="最後にすれ違った" value={lastSeen} />
      </View>

      <TouchableOpacity style={styles.stampButton} onPress={handleStamp}>
        <Text style={styles.stampButtonText}>スタンプを送る</Text>
      </TouchableOpacity>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  anonymousId: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  countBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  countBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  infoGrid: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  stampButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  stampButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
});
