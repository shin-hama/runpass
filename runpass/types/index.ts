import { Timestamp } from 'firebase/firestore';

export interface User {
  uid: string;
  nickname: string;
  anonymousId: string;
  createdAt: Timestamp;
  totalRuns: number;
  totalDistance: number;
  expoPushToken?: string;
}

export interface Run {
  runId: string;
  userId: string;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  distanceKm: number;
  avgPaceSecPerKm: number;
  status: 'active' | 'completed';
  processed: boolean;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  recordedAt: Timestamp;
}

export interface Encounter {
  encounterId: string;
  userId: string;
  otherUserId: string;
  otherNickname: string;
  otherAnonymousId: string;
  encounteredAt: Timestamp;
  runId: string;
  otherRunId: string;
  locationLat: number;
  locationLng: number;
  otherPaceSecPerKm: number;
  count: number;
  notified: boolean;
}

export interface EncounterSummary {
  userId: string;
  otherUserId: string;
  otherAnonymousId: string;
  totalCount: number;
  lastEncounteredAt: Timestamp;
  commonArea: string;
}
