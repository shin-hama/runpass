import { View, Text, StyleSheet } from 'react-native';
import type { RunStats } from '../hooks/useRunTracking';

interface Props {
  stats: RunStats;
}

function formatTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(secPerKm: number): string {
  if (secPerKm <= 0 || !isFinite(secPerKm)) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RunStatsDisplay({ stats }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.primaryStat}>
        <Text style={styles.timerText}>{formatTime(stats.elapsedSec)}</Text>
        <Text style={styles.timerLabel}>経過時間</Text>
      </View>
      <View style={styles.secondaryStats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.distanceKm.toFixed(2)}</Text>
          <Text style={styles.statLabel}>km</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{formatPace(stats.paceSecPerKm)}</Text>
          <Text style={styles.statLabel}>/km ペース</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 32,
  },
  primaryStat: {
    alignItems: 'center',
  },
  timerText: {
    fontSize: 64,
    fontWeight: '200',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  secondaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '600',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
});
