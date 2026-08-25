// ---------------------------------------------------------------------------
// Configuration: endpoint, keys, constants
// ---------------------------------------------------------------------------

// #411 — GTM Custom HTML tags re-create <script> elements copying only
// id/text/charset/type/src: every data-* attribute is dropped. A bare
// single-tag paste (`<script src=".../tracker.js?key=trk_xxx">`) is what
// people naturally drop into GTM, and it has no window-var config at all.
//
// `document.currentScript` is only valid synchronously while THIS script is
// executing — it is already null by the time a deferred-init callback
// (background tab / prerendering, see lifecycle.js `shouldDeferInit`) or any
// other async path calls getTrackingKey()/getEndpoint(). So index.js's IIFE
// captures it once at module-load time via `setLoaderScript`, and everything
// below reads that cached reference instead of `document.currentScript`
// directly.
var _loaderScript = null;
export function setLoaderScript(script) {
  _loaderScript = script || null;
}

function loaderScriptQueryParam(name) {
  var src = _loaderScript && typeof _loaderScript.src === "string" ? _loaderScript.src : "";
  if (!src) return null;
  try {
    var value = new URL(src, window.location.href).searchParams.get(name);
    return value && value.trim() ? value.trim() : null;
  } catch (_) {
    return null;
  }
}

function loaderScriptAttribute(name) {
  if (!_loaderScript || typeof _loaderScript.getAttribute !== "function") return null;
  var value = _loaderScript.getAttribute(name);
  return value && value.trim() ? value.trim() : null;
}

// Lazy getters — read window vars at call time, not at module load.
// This allows the npm SDK to set window config before the first call.
//
// Fallback chain (#411): window var (unchanged, always wins) -> the loader
// script's `src` query param -> a `data-*` attribute on the loader script
// (works everywhere except GTM, which strips data-* attributes -- cheap to
// keep as a fallback for every other embed method).
export function getEndpoint() {
  return (
    window.ATRIBU_TRACKING_ENDPOINT ||
    loaderScriptQueryParam("endpoint") ||
    window.location.origin + "/api/tracking/collect"
  );
}
export function getTrackingKey() {
  return (
    window.ATRIBU_TRACKING_KEY ||
    loaderScriptQueryParam("key") ||
    loaderScriptAttribute("data-tracking-key") ||
    null
  );
}

// Canonical (www.atribu.app) endpoint, emitted by the snippet alongside the
// first-party primary whenever the primary is a real custom domain (#415).
// null when unset — most sites (already on the canonical origin, or the npm
// SDK without an explicit fallback) have nothing to fail over to.
export function getFallbackEndpoint() {
  var fallback = window.ATRIBU_TRACKING_FALLBACK_ENDPOINT;
  return typeof fallback === "string" && fallback.trim()
    ? fallback.trim()
    : null;
}

// #413 — early identity signal endpoint. Deliberately NOT the collect
// endpoint: this must never flow through the events pipeline (no
// touches/sessions/facts writes). Derived from the SAME origin as
// getEndpoint() (including a configured custom tracking domain) by swapping
// the path suffix, so a custom domain stays the single source of truth for
// "which origin does this tracker report to" — an explicit
// ATRIBU_IDENTITY_SIGNAL_ENDPOINT override is available for the rare case
// where that swap doesn't apply.
export function getIdentitySignalEndpoint() {
  if (window.ATRIBU_IDENTITY_SIGNAL_ENDPOINT) {
    return window.ATRIBU_IDENTITY_SIGNAL_ENDPOINT;
  }
  var collectEndpoint = getEndpoint();
  if (collectEndpoint.indexOf("/api/tracking/collect") !== -1) {
    return collectEndpoint.replace(
      "/api/tracking/collect",
      "/api/tracking/identity-signal"
    );
  }
  return window.location.origin + "/api/tracking/identity-signal";
}

// #410 — the install-verification beacon endpoint. Same origin as the
// collect endpoint (a custom tracking domain proxies the whole
// /api/tracking/* prefix, not just /collect), so derive it by swapping the
// trailing path segment rather than introducing a second origin config.
export function getVerifyEndpoint() {
  var collectEndpoint = getEndpoint();
  try {
    var url = new URL(collectEndpoint);
    url.pathname = url.pathname.replace(
      /\/collect\/?$/,
      "/verification/beacon"
    );
    return url.toString();
  } catch (_) {
    return collectEndpoint;
  }
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

// Consecutive primary-endpoint network failures (DNS/TLS/connection — never
// a real HTTP response) before we probe the fallback origin (#415).
export var FAILOVER_THRESHOLD = 3;
// Minimum gap between reachability probes, so a primary that's dead
// alongside a fallback that's ALSO briefly unreachable doesn't fire an
// OPTIONS request on every single subsequent outbox item.
export var FAILOVER_PROBE_COOLDOWN_MS = 15000;

export var FIRST_TOUCH_KEY = "atribu_first_touch";
export var LATEST_TOUCH_KEY = "atribu_latest_touch";
