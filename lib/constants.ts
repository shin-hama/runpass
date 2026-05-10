export const PROXIMITY_METERS = 50;
export const TIME_WINDOW_SEC = 30;
export const GPS_INTERVAL_SEC = 15;
export const MIN_RUN_DURATION_SEC = 120;

export const ASYNC_STORAGE_KEYS = {
  USER_ID: 'runpass_uid',
  RUN_ID: 'runpass_current_run_id',
  PENDING_LOCATIONS: 'runpass_pending_locations',
} as const;
