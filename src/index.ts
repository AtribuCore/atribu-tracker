// ---------------------------------------------------------------------------
// @atribu/tracker — Main entry point
// ---------------------------------------------------------------------------
// Thick SDK: bundles the full tracker runtime. No external <script> needed.
//
// Usage:
//   import { init, track, trackRevenue, getTracker } from '@atribu/tracker';
//   const atribu = init({ trackingKey: 'trk_live_...' });
//   atribu.track('signup', { plan: 'pro' });

import type {
  AtribuConfig,
  AtribuClient,
  TrackOptions,
  IdentifyInput,
  ConsentPayload,
  SelfDescribingEventInput,
  ImpressionOptions,
  TrackerAttribution,
  PurchaseInput,
} from "./types";
import { createNoopClient } from "./noop";

// Re-export all types
export type {
  AtribuConfig,
  AtribuClient,
  TrackOptions,
  IdentifyInput,
  IdentifyIdentifier,
  LegacyIdentifyIdentifier,
  ConsentPayload,
  TrackingEvent,
  CustomPropertiesContext,
  ContextEntity,
  SelfDescribingEventInput,
  ImpressionOptions,
  TrackerAttribution,
  PurchaseInput,
} from "./types";

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let _client: AtribuClient | null = null;

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// init — the primary entry point
// ---------------------------------------------------------------------------

/**
 * Initialize the Atribu tracker.
 *
 * Bundles the full tracker runtime — no external `<script>` tag needed.
 * Auto-captures page views, sessions, engagement (scroll depth + time on page),
 * outbound link clicks, file downloads, form submissions, bookings, and
 * Meta Pixel bridge events.
 *
 * @returns An `AtribuClient` instance. In SSR environments (no `window`),
 *          returns a silent no-op client.
 *
 * @example
 * ```ts
 * import { init } from '@atribu/tracker';
 *
 * const atribu = init({
 *   trackingKey: 'trk_live_...',   // from Tracking Settings → Ingest Keys
 *   apiHost: 'https://www.atribu.app',
 * });
 *
 * atribu.track('signup', { plan: 'pro' });
 * ```
 */
export function init(config: AtribuConfig): AtribuClient {
  // SSR guard — return silent no-op client
  if (typeof window === "undefined") {
    return createNoopClient();
  }

  // Singleton — return existing client on re-init
  if (_client) {
    return _client;
  }

  // Step 1: Set window config vars BEFORE the tracker modules read them.
  // The tracker's config.js uses lazy getters, so these are read at call time.
  const trackingKey = config.trackingKey.trim();
  if (!trackingKey) {
    throw new Error("Atribu: init() requires a non-empty trackingKey.");
  }

  const w = window as unknown as Record<string, unknown>;
  w.ATRIBU_TRACKING_KEY = trackingKey;

  if (config.trackingEndpoint?.trim()) {
    w.ATRIBU_TRACKING_ENDPOINT = config.trackingEndpoint.trim();
  } else if (config.apiHost) {
    w.ATRIBU_TRACKING_ENDPOINT =
      normalizeOrigin(config.apiHost) + "/api/tracking/collect";
  }

  if (config.appId?.trim()) {
    w.ATRIBU_APP_ID = config.appId.trim();
  }
  if (config.websiteId?.trim()) {
    w.ATRIBU_WEBSITE_ID = config.websiteId.trim();
  }
  if (config.pixelId?.trim()) {
    w.ATRIBU_PIXEL_ID = config.pixelId.trim();
  }

  if (config.interceptMetaFbq !== undefined) {
    w.ATRIBU_INTERCEPT_FBQ = config.interceptMetaFbq;
  }
  if (config.metaBridgePageview !== undefined) {
    w.ATRIBU_META_BRIDGE_PAGEVIEW = config.metaBridgePageview;
  }
  if (config.customProperties !== undefined) {
    w.ATRIBU_CUSTOM_PROPERTIES = config.customProperties;
  }
  if (config.transformRequest !== undefined) {
    w.ATRIBU_TRANSFORM_REQUEST = config.transformRequest;
  }
  if (config.ignoredPages !== undefined) {
    w.ATRIBU_IGNORED_PAGES = config.ignoredPages;
  }
  if (config.heartbeatIntervalSeconds !== undefined) {
    w.ATRIBU_HEARTBEAT_INTERVAL_SECONDS = config.heartbeatIntervalSeconds;
  }
  if (
    config.sessionTimeoutMinutes !== undefined &&
    typeof config.sessionTimeoutMinutes === "number" &&
    config.sessionTimeoutMinutes >= 1 &&
    config.sessionTimeoutMinutes <= 120
  ) {
    w.ATRIBU_SESSION_TIMEOUT_MINUTES = config.sessionTimeoutMinutes;
  }
  if (
    config.sessionMode === "inactivity_only" ||
    config.sessionMode === "inactivity_or_source_change"
  ) {
    w.ATRIBU_SESSION_MODE = config.sessionMode;
  }
  if (config.enableEngagement !== undefined) {
    w.ATRIBU_ENABLE_ENGAGEMENT = config.enableEngagement;
  }
  if (config.enableClickQuality !== undefined) {
    w.ATRIBU_ENABLE_CLICK_QUALITY = config.enableClickQuality;
  }
  if (config.enableWebVitals !== undefined) {
    w.ATRIBU_ENABLE_WEB_VITALS = config.enableWebVitals;
  }
  if (config.enableCtaTracking !== undefined) {
    w.ATRIBU_ENABLE_CTA_TRACKING = config.enableCtaTracking;
  }
  if (config.enableVideoTracking !== undefined) {
    w.ATRIBU_ENABLE_VIDEO_TRACKING = config.enableVideoTracking;
  }

  // Step 2: Create client (calls initRuntime which bootstraps everything)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("./client") as {
    createClient: () => AtribuClient;
  };
  _client = createClient();
  return _client;
}

// ---------------------------------------------------------------------------
// getTracker — singleton accessor
// ---------------------------------------------------------------------------

/**
 * Retrieve the tracker client from anywhere.
 * Throws if `init()` has not been called.
 */
export function getTracker(): AtribuClient {
  if (!_client) {
    throw new Error("Atribu: call init() before getTracker().");
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Standalone convenience exports (delegate to singleton)
// ---------------------------------------------------------------------------

/** Track a custom event. Requires `init()` to have been called. */
export function track(
  eventName: string,
  data?: Record<string, unknown>,
  options?: TrackOptions
): void {
  getTracker().track(eventName, data, options);
}

/** Track a self-describing event with an explicit schema. */
export function trackSelfDescribing(
  event: SelfDescribingEventInput,
  options?: TrackOptions
): void {
  getTracker().trackSelfDescribing(event, options);
}

/** Identify a visitor with PII. Requires `init()` to have been called. */
export function identify(input: IdentifyInput): void {
  getTracker().identify(input);
}

/** Manually fire a page view. Requires `init()` to have been called. */
export function page(): void {
  getTracker().page();
}

/** Set consent state. Requires `init()` to have been called. */
export function setConsent(consent: ConsentPayload): void {
  getTracker().setConsent(consent);
}

/** Track an event with revenue data. Requires `init()` to have been called. */
export function trackRevenue(
  eventName: string,
  amount: number,
  currency: string,
  data?: Record<string, unknown>
): void {
  getTracker().trackRevenue(eventName, amount, currency, data);
}

/** Emit a heartbeat/page-activity event immediately. */
export function heartbeat(
  data?: Record<string, unknown>,
  options?: TrackOptions
): void {
  getTracker().heartbeat(data, options);
}

/**
 * Fire a confirmation-page `purchase` (#114) — same-device capture so the
 * payment provider's cash event stitches to this session. Requires `init()`.
 */
export function purchase(input: PurchaseInput): void {
  getTracker().purchase(input);
}

/** Observe an element and emit a one-time impression when visible. */
export function observeImpression(
  target: string | Element,
  data?: Record<string, unknown>,
  options?: ImpressionOptions
): () => void {
  return getTracker().observeImpression(target, data, options);
}

/** Force-send all queued events immediately. Requires `init()` to have been called. */
export function flush(): void {
  getTracker().flush();
}

/** Clear visitor/session state (e.g. on logout). Requires `init()` to have been called. */
export function reset(): void {
  getTracker().reset();
}

/**
 * The current identity + ad signal, for handing to a checkout (#109).
 * Requires `init()` to have been called.
 */
export function getAttribution(): TrackerAttribution {
  return getTracker().getAttribution();
}

/**
 * The same signal as one compact `atb1.` token for a hidden field / Stripe
 * `metadata` / `client_reference_id`. Decode server-side with
 * `parseAttributionToken` from `@atribu/analytics-enrichment/attribution-token`.
 * Requires `init()` to have been called.
 */
export function getAttributionToken(): string {
  return getTracker().getAttributionToken();
}
