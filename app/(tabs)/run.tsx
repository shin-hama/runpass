import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { useRunTracking } from '../../hooks/useRunTracking';
import RunStatsDisplay from '../../components/RunStats';

export default function RunScreen() {
  const { isRunning, stats, startRun, stopRun } = useRunTracking();

  async function handleStart() {
    try {
      await startRun();
    } catch (e: any) {
      Alert.alert('エラー', e.message || 'ランを開始できませんでした');
    }
  }

  async function handleStop() {
    try {
      await stopRun();
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('エラー', e.message || 'ランを終了できませんでした');
    }
  }

  if (!isRunning) {
    return (
      <View style={styles.container}>
        <Text style={styles.readyText}>走る準備はいいですか？</Text>
        <TouchableOpacity style={styles.startButton} onPress={handleStart}>
          <Text style={styles.startButtonText}>ランを開始</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RunStatsDisplay stats={stats} />
      <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
        <Text style={styles.stopButtonText}>ランを終了</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>集計中は少しお待ちください</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    padding: 24,
    gap: 40,
  },
  readyText: {
    fontSize: 18,
    color: '#6B7280',
  },
  startButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 20,
    paddingHorizontal: 60,
    borderRadius: 50,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  stopButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 20,
    paddingHorizontal: 60,
    borderRadius: 50,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
