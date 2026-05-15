// ---------------------------------------------------------------------------
// Configuration: endpoint, keys, constants
// ---------------------------------------------------------------------------

// Lazy getters — read window vars at call time, not at module load.
// This allows the npm SDK to set window config before the first call.
export function getEndpoint() {
  return (
    window.ATRIBU_TRACKING_ENDPOINT ||
    window.location.origin + "/api/tracking/collect"
  );
}
export function getTrackingKey() {
  return window.ATRIBU_TRACKING_KEY || null;
}

export function getSessionTimeoutMs() {
  var custom = window.ATRIBU_SESSION_TIMEOUT_MS;
  if (typeof custom === "number" && custom >= 60000 && custom <= 7200000) {
    return custom;
  }
  var customMinutes = window.ATRIBU_SESSION_TIMEOUT_MINUTES;
  if (typeof customMinutes === "number" && customMinutes >= 1 && customMinutes <= 120) {
    return customMinutes * 60 * 1000;
  }
  return 30 * 60 * 1000;
}

export function getSessionMode() {
  return window.ATRIBU_SESSION_MODE === "inactivity_or_source_change"
    ? "inactivity_or_source_change"
    : "inactivity_only";
}
export var SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export var OUTBOX_KEY = "atribu_event_outbox_v1";
export var OUTBOX_MAX_ITEMS = 200;
export var OUTBOX_FLUSH_INTERVAL_MS = 3000;
export var OUTBOX_MAX_RETRIES = 6;
export var OUTBOX_MAX_RETRY_DELAY_MS = 30 * 60 * 1000;
export var KEEPALIVE_BYTES_LIMIT = 60 * 1024;
export var FBQ_MIRROR_DEDUP_MS = 5 * 60 * 1000;

export var FIRST_TOUCH_KEY = "atribu_first_touch";
export var LATEST_TOUCH_KEY = "atribu_latest_touch";
