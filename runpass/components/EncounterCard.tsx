import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { EncounterWithSummary } from '../hooks/useEncounters';

interface Props {
  encounter: EncounterWithSummary;
  onPress: () => void;
}

function formatPaceBand(secPerKm: number): string {
  if (secPerKm <= 0) return '-- /km';
  const minPerKm = secPerKm / 60;
  const lower = Math.floor(minPerKm);
  const upper = lower + 1;
  return `${lower}:00〜${upper}:00/km`;
}

function formatLocation(lat: number, lng: number): string {
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

export default function EncounterCard({ encounter, onPress }: Props) {
  const isFrequent = encounter.totalCount >= 3;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.left}>
        <Text style={styles.nickname}>ランナー #{encounter.otherAnonymousId}</Text>
        <Text style={styles.pace}>{formatPaceBand(encounter.otherPaceSecPerKm)}</Text>
        <Text style={styles.location}>{formatLocation(encounter.locationLat, encounter.locationLng)}</Text>
      </View>
      <View style={[styles.badge, isFrequent && styles.badgeFrequent]}>
        <Text style={[styles.badgeText, isFrequent && styles.badgeTextFrequent]}>
          {encounter.totalCount}回
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  left: {
    flex: 1,
    gap: 4,
  },
  nickname: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  pace: {
    fontSize: 13,
    color: '#6B7280',
  },
  location: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  badge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 12,
  },
  badgeFrequent: {
    backgroundColor: '#2563EB',
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },
  badgeTextFrequent: {
    color: '#fff',
  },
});
