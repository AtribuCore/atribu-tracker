// ---------------------------------------------------------------------------
// @atribu/tracker — Type definitions
// ---------------------------------------------------------------------------

/**
 * Configuration for the Atribu tracker SDK.
 *
 * `trackingKey` is your **Ingest Key** from the Atribu dashboard
 * (Tracking Settings → Ingest Keys). Format: `trk_live_...`
 */
export interface AtribuConfig {
  /** Required. Your Ingest Key (find it in Tracking Settings → Ingest Keys). */
  trackingKey: string;

  /**
   * The origin where events are sent.
   * If you use a custom tracking domain, pass it here.
   * Defaults to `window.location.origin`.
   */
  apiHost?: string;

  /**
   * Override the full collect endpoint URL.
   * Defaults to `${apiHost}/api/tracking/collect`.
   */
  trackingEndpoint?: string;

  /**
   * Logical application identifier attached to every event.
   * Defaults to `websiteId`, then `trackingKey` when omitted.
   */
  appId?: string;

  /**
   * Logical website identifier attached to every event.
   * Defaults to `trackingKey` when omitted.
   */
  websiteId?: string;

  /**
   * Pixel / collector identifier attached to every event.
   * Defaults to `trackingKey` when omitted.
   */
  pixelId?: string;

  /**
   * Intercept Meta Pixel (`fbq`) calls and mirror them server-side.
   * Defaults to `true`.
   */
  interceptMetaFbq?: boolean;

  /**
   * Also mirror Meta Pixel PageView events (in addition to conversions).
   * Defaults to `false`.
   */
  metaBridgePageview?: boolean;

  /**
   * Static custom properties or a function that returns them.
   * Merged into every event's `payload`.
   */
  customProperties?:
    | Record<string, string | number | boolean>
    | ((ctx: CustomPropertiesContext) => Record<string, string | number | boolean>);

  /**
   * Event middleware. Receives the built tracking event before dispatch.
   * Return `null` or `false` to suppress the event.
   * Return a modified event object to transform it.
   * Errors inside the function are caught — the event sends unchanged.
   */
  transformRequest?: (event: TrackingEvent) => TrackingEvent | null | false;

  /**
   * URL pathname patterns (with `*` wildcards) to suppress tracking on.
   * Example: `['/admin/*', '/internal']`
   */
  ignoredPages?: string[];

  /**
   * Heartbeat interval for periodic page-activity events (seconds).
   * Heartbeats serve as crash-recovery checkpoints for engagement data.
   * Set to `0` or `false` to disable heartbeats.
   * Defaults to `60`.
   */
  heartbeatIntervalSeconds?: number | false;

  /**
   * Session timeout in minutes. A visitor who is inactive for this
   * duration starts a new session on their next interaction.
   *
   * Lower values (e.g. 15) give more granular attribution but split
   * sessions on brief breaks. Higher values (e.g. 60) keep sessions
   * together longer. Industry standard: 30 minutes.
   *
   * Range: 1-120. Defaults to `30`.
   */
  sessionTimeoutMinutes?: number;

  /**
   * Session boundary policy.
   *
   * - `inactivity_only`: only inactivity starts a new session
   * - `inactivity_or_source_change`: also starts a new session when
   *   a new paid/UTM source fingerprint appears mid-session
   *
   * Defaults to `inactivity_only`.
   */
  sessionMode?: "inactivity_only" | "inactivity_or_source_change";

  /**
   * Scroll depth, time on page, and a per-minute heartbeat.
   * Defaults to `false` — these emit display-only `engagement` events that carry
   * no attribution credit.
   */
  enableEngagement?: boolean;

  /**
   * Track rage clicks (3+ rapid clicks) and dead clicks (no DOM response).
   * Defaults to `false`.
   */
  enableClickQuality?: boolean;

  /**
   * Capture Core Web Vitals (LCP, FCP, CLS, INP, TTFB) once per page load.
   * Defaults to `false`.
   */
  enableWebVitals?: boolean;

  /**
   * Auto-detect CTA buttons/links and track when they become visible.
   * Defaults to `false`.
   */
  enableCtaTracking?: boolean;

  /**
   * Auto-detect `<video>` elements and track play/pause/milestones.
   * Defaults to `false`.
   */
  enableVideoTracking?: boolean;
}

/** Context passed to the `customProperties` function variant. */
export interface CustomPropertiesContext {
  url: string;
  path: string;
  referrer: string;
  title: string;
}

/** Options for individual `track()` calls. */
export interface TrackOptions {
  /** Callback invoked when the event is dispatched or permanently dropped. */
  callback?: (error: Error | null) => void;

  /** Override the event contract schema attached to this event. */
  eventSchema?: string;

  /** Override the event contract schema version attached to this event. */
  schemaVersion?: number;

  /** Attach Snowplow-style context entities to this event. */
  contextEntities?: ContextEntity[];

  /** Override the source type/platform when emitting non-browser events. */
  sourceType?: string;
  sourcePlatform?: string;
}

/**
 * Context entity attached to a tracking event.
 *
 * Preferred format (Snowplow-compatible):
 * ```
 * { schema: "atribu.context.web_page", data: { title: "...", url: "..." } }
 * ```
 *
 * Legacy flat format (backward-compatible):
 * ```
 * { schema: "atribu.context.web_page", title: "...", url: "..." }
 * ```
 * The collector normalizes flat entities into `{ schema, data }` form.
 *
 * Entities without a `schema` field are accepted but will not be validated
 * against the schema registry.
 */
export interface ContextEntity {
  /** Schema identifier for this context entity (e.g. "atribu.context.web_page") */
  schema?: string;
  /** Structured data for the preferred `{ schema, data }` format */
  data?: Record<string, unknown>;
  /** @deprecated Use `schema` instead */
  type?: string;
  [key: string]: unknown;
}

/** Input for `identify()` — links visitor to a known user. */
export interface IdentifyIdentifier {
  idType: string;
  idValue: string;
  source?: string;
}

/** Backwards-compatible alias accepted by the SDK and normalized on send. */
export interface LegacyIdentifyIdentifier {
  type: string;
  value: string;
  source?: string;
}

export interface IdentifyInput {
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  identifiers?: Array<IdentifyIdentifier | LegacyIdentifyIdentifier>;
}

/** Consent state stored in localStorage and attached to every event. */
export interface ConsentPayload {
  analytics?: boolean;
  marketing?: boolean;
  [key: string]: boolean | undefined;
}

/** Shape of the tracking event object passed to `transformRequest`. */
export interface TrackingEvent {
  eventId?: string;
  eventName: string;
  eventSchema?: string;
  schemaVersion?: number;
  eventTimeClient?: string;
  eventTimeServer?: string;
  anonymousId: string;
  userId?: string;
  sessionId: string;
  appId?: string;
  websiteId?: string;
  pixelId?: string;
  dedupeKey?: string;
  previousSessionId?: string;
  sessionIndex?: number;
  eventIndex?: number;
  firstEventId?: string;
  firstEventTimestamp?: string;
  pageViewId?: string;
  sourceType?: string;
  pageUrl: string;
  path?: string;
  host?: string;
  referrer: string;
  locale?: string;
  timezone?: string;
  utm: Record<string, string | undefined>;
  firstTouchUtm?: Record<string, string | undefined>;
  clickIds: Record<string, string | undefined>;
  firstTouchClickIds?: Record<string, string | undefined>;
  fbp?: string;
  fbc?: string;
  consent?: ConsentPayload;
  sourcePlatform: string;
  contextEntities?: ContextEntity[];
  payload: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SelfDescribingEventInput {
  eventSchema: string;
  schemaVersion?: number;
  eventName?: string;
  payload?: Record<string, unknown>;
  contextEntities?: ContextEntity[];
}

export interface ImpressionOptions extends TrackOptions {
  threshold?: number;
}

/** The Atribu tracker client returned by `init()`. */
/**
 * The identity + ad signal the tracker currently holds, flattened for handoff
 * to a checkout (#109). Every field is optional — a fresh direct visit carries
 * only `anonymous_id` + `session_id`.
 */
export interface TrackerAttribution {
  anonymous_id?: string;
  session_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_id?: string;
  fbclid?: string;
  gclid?: string;
  msclkid?: string;
  ttclid?: string;
  first_touch?: {
    utm?: Record<string, string>;
    click_ids?: Record<string, string>;
    captured_at?: string;
  };
}

/** Input for the confirmation-page `purchase()` event (#114). */
export interface PurchaseInput {
  /** Cash value of the sale. */
  value?: number;
  /** ISO currency code (e.g. "USD", "CLP"). */
  currency?: string;
  /** Your order / transaction id — the key that ties this to the payment. */
  orderId?: string | number;
  /** Any extra properties to attach to the event. */
  [key: string]: unknown;
}

export interface AtribuClient {
  /** Track a custom event with optional properties. */
  track(
    eventName: string,
    data?: Record<string, unknown>,
    options?: TrackOptions
  ): void;

  /** Track a self-describing event with an explicit schema contract. */
  trackSelfDescribing(
    event: SelfDescribingEventInput,
    options?: TrackOptions
  ): void;

  /** Identify a visitor with PII for server-side identity resolution. */
  identify(input: IdentifyInput): void;

  /** Set or clear the authenticated user identifier attached to future events. */
  setUserId(userId: string | null): void;

  /** Manually fire a page view (auto-fired on init and SPA navigation). */
  page(data?: Record<string, unknown>): void;

  /** Manually fire a session start (auto-fired on init). */
  sessionStart(): void;

  /** Set consent state (persisted to localStorage, attached to every event). */
  setConsent(consent: ConsentPayload): void;

  /** Track an event with revenue data. */
  trackRevenue(
    eventName: string,
    amount: number,
    currency: string,
    data?: Record<string, unknown>
  ): void;

  /**
   * Fire a confirmation-page `purchase` (#114). Same-device capture: the sale is
   * recorded with its ad-click lineage so the payment provider's cash event can
   * stitch to this session. Accepts `{ value, currency, orderId }` (+ extras).
   */
  purchase(input: PurchaseInput): void;

  /** Emit a periodic page-activity heartbeat event. */
  heartbeat(data?: Record<string, unknown>, options?: TrackOptions): void;

  /** Observe an element and emit a one-time impression when it becomes visible. */
  observeImpression(
    target: string | Element,
    data?: Record<string, unknown>,
    options?: ImpressionOptions
  ): () => void;

  /** Force-send all queued events immediately. */
  flush(): void;

  /** Clear visitor ID, session, and all stored state (e.g. on logout). */
  reset(): void;

  /**
   * The current identity + ad signal, for handing to a checkout so the payment
   * ties to the exact ad. Synchronous — safe to call any time after `init()`.
   */
  getAttribution(): TrackerAttribution;

  /**
   * The same signal packed into one compact `atb1.` token for a hidden form
   * field, a Stripe/MercadoPago `metadata` value, or a `client_reference_id`.
   * Decode server-side with `parseAttributionToken` from
   * `@atribu/analytics-enrichment/attribution-token`.
   */
  getAttributionToken(): string;
}
