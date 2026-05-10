import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function RunScreen() {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.startButton}>
        <Text style={styles.startButtonText}>ランを開始</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
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
});
