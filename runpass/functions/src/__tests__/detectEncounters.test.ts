import { haversineMeters } from '../geo';
import { PROXIMITY_METERS, TIME_WINDOW_SEC } from '../constants';

describe('haversineMeters', () => {
  test('同一地点は0mを返す', () => {
    const d = haversineMeters(35.6812, 139.7671, 35.6812, 139.7671);
    expect(d).toBe(0);
  });

  test('50m以内: 隣接する点（約45m）', () => {
    // 緯度0.0004度 ≈ 44m
    const d = haversineMeters(35.6812, 139.7671, 35.6816, 139.7671);
    expect(d).toBeLessThan(PROXIMITY_METERS);
    expect(d).toBeGreaterThan(0);
  });

  test('50m超: 離れた点（約111m）', () => {
    // 緯度0.001度 ≈ 111m
    const d = haversineMeters(35.6812, 139.7671, 35.6822, 139.7671);
    expect(d).toBeGreaterThan(PROXIMITY_METERS);
  });

  test('東京〜大阪の距離は約400km', () => {
    const d = haversineMeters(35.6812, 139.7671, 34.6937, 135.5023);
    expect(d).toBeGreaterThan(400_000);
    expect(d).toBeLessThan(420_000);
  });

  test('境界値: ちょうど50m付近', () => {
    // 緯度0.00045度 ≈ 50m
    const d = haversineMeters(35.6812, 139.7671, 35.68165, 139.7671);
    expect(Math.abs(d - PROXIMITY_METERS)).toBeLessThan(5);
  });
});

describe('TIME_WINDOW_SEC', () => {
  test('TIME_WINDOW_SECは30秒', () => {
    expect(TIME_WINDOW_SEC).toBe(30);
  });
});

describe('すれ違い判定ロジック（ユニット）', () => {
  function isEncounter(
    myLat: number, myLng: number, myTimeSec: number,
    otherLat: number, otherLng: number, otherTimeSec: number
  ): boolean {
    const dist = haversineMeters(myLat, myLng, otherLat, otherLng);
    const timeDiff = Math.abs(myTimeSec - otherTimeSec);
    return dist < PROXIMITY_METERS && timeDiff <= TIME_WINDOW_SEC;
  }

  test('近距離・同時刻 → すれ違い', () => {
    expect(isEncounter(35.6812, 139.7671, 1000, 35.6814, 139.7671, 1000)).toBe(true);
  });

  test('近距離・30秒差 → すれ違い（境界）', () => {
    expect(isEncounter(35.6812, 139.7671, 1000, 35.6814, 139.7671, 1030)).toBe(true);
  });

  test('近距離・31秒差 → すれ違いなし', () => {
    expect(isEncounter(35.6812, 139.7671, 1000, 35.6814, 139.7671, 1031)).toBe(false);
  });

  test('遠距離・同時刻 → すれ違いなし', () => {
    expect(isEncounter(35.6812, 139.7671, 1000, 35.6822, 139.7671, 1000)).toBe(false);
  });

  test('遠距離・遠時刻 → すれ違いなし', () => {
    expect(isEncounter(35.6812, 139.7671, 1000, 35.6822, 139.7671, 2000)).toBe(false);
  });
});

describe('dedup（同一runペアは1回）', () => {
  test('同じrunIdペアは重複しない', () => {
    const encounteredRunIds = new Set<string>();
    const otherRunId = 'run_other_123';

    // 1回目 → 追加
    encounteredRunIds.add(otherRunId);
    expect(encounteredRunIds.size).toBe(1);

    // 2回目 → 重複しない
    encounteredRunIds.add(otherRunId);
    expect(encounteredRunIds.size).toBe(1);
  });

  test('異なるrunIdは別々に記録', () => {
    const encounteredRunIds = new Set<string>();
    encounteredRunIds.add('run_A');
    encounteredRunIds.add('run_B');
    expect(encounteredRunIds.size).toBe(2);
  });
});
