// ---------------------------------------------------------------------------
// Real Atribu client — wraps the tracker runtime that's bundled into this SDK.
// ---------------------------------------------------------------------------

import type {
  AtribuClient,
  IdentifyInput,
  ConsentPayload,
  TrackOptions,
  SelfDescribingEventInput,
  ImpressionOptions,
} from "./types";

// Import tracker runtime (bundled by tsup into this package)
import { initRuntime } from "../../src/runtime.js";
import {
  flushOutboxNow,
  resetOutbox,
} from "../../src/networking.js";
import { storage } from "../../src/storage.js";
import { resetAnonymousId, resetSessionState } from "../../src/session.js";

// Type augmentation for the window.atribuTracker global
interface AtribuTrackerGlobal {
  track(
    eventName: string,
    data?: Record<string, unknown>,
    options?: TrackOptions
  ): void;
  trackSelfDescribing(
    event: SelfDescribingEventInput | Record<string, unknown>,
    options?: TrackOptions
  ): void;
  identify(input: IdentifyInput | Record<string, unknown>): void;
  setUserId(userId: string | null): void;
  page(data?: Record<string, unknown>): void;
  sessionStart(): void;
  setConsent(consent: ConsentPayload | Record<string, unknown>): void;
  trackRevenue(
    eventName: string,
    amount: number,
    currency: string,
    data?: Record<string, unknown>
  ): void;
  heartbeat(data?: Record<string, unknown>, options?: TrackOptions): void;
  observeImpression(
    target: string | Element,
    data?: Record<string, unknown>,
    options?: ImpressionOptions
  ): () => void;
  _buildEvent(
    eventName: string,
    data?: Record<string, unknown>,
    options?: TrackOptions
  ): Record<string, unknown> | null;
  q?: unknown[];
}

declare global {
  interface Window {
    atribuTracker: AtribuTrackerGlobal;
    __ATRIBU_TRACKER_LOADED__?: boolean;
  }
}

const STORAGE_KEYS = [
  "atribu_session_id",
  "atribu_session_state",
  "atribu_session_ts",
  "atribu_first_touch",
  "atribu_latest_touch",
  "atribu_consent",
];

function normalizeIdentifyInput(input: IdentifyInput): IdentifyInput {
  if (!Array.isArray(input.identifiers)) {
    return input;
  }

  const normalizedIdentifiers = [];
  for (const identifier of input.identifiers) {
    if (!identifier || typeof identifier !== "object") {
      continue;
    }

    const idType =
      "idType" in identifier && typeof identifier.idType === "string"
        ? identifier.idType
        : "type" in identifier && typeof identifier.type === "string"
          ? identifier.type
          : "";
    const idValue =
      "idValue" in identifier && typeof identifier.idValue === "string"
        ? identifier.idValue
        : "value" in identifier && typeof identifier.value === "string"
          ? identifier.value
          : "";

    if (!idType.trim() || !idValue.trim()) {
      continue;
    }

    normalizedIdentifiers.push({
      idType: idType.trim(),
      idValue: idValue.trim(),
      ...("source" in identifier && typeof identifier.source === "string"
        ? { source: identifier.source.trim() }
        : {}),
    });
  }

  return {
    ...input,
    identifiers: normalizedIdentifiers,
  };
}

export function createClient(): AtribuClient {
  // Run the full tracker init sequence (bot filtering, outbox load,
  // engagement, meta bridge, auto-capture, queue drain, auto page_view)
  initRuntime();

  return {
    track(
      eventName: string,
      data?: Record<string, unknown>,
      options?: TrackOptions
    ) {
      window.atribuTracker?.track(eventName, data, options);
    },

    trackSelfDescribing(event: SelfDescribingEventInput, options?: TrackOptions) {
      window.atribuTracker?.trackSelfDescribing(event, options);
    },

    identify(input: IdentifyInput) {
      window.atribuTracker?.identify(normalizeIdentifyInput(input));
    },

    setUserId(userId: string | null) {
      window.atribuTracker?.setUserId(userId);
    },

    page() {
      window.atribuTracker?.page();
    },

    sessionStart() {
      window.atribuTracker?.sessionStart();
    },

    setConsent(consent: ConsentPayload) {
      window.atribuTracker?.setConsent(consent);
    },

    trackRevenue(
      eventName: string,
      amount: number,
      currency: string,
      data?: Record<string, unknown>
    ) {
      window.atribuTracker?.trackRevenue(eventName, amount, currency, data);
    },

    heartbeat(data?: Record<string, unknown>, options?: TrackOptions) {
      window.atribuTracker?.heartbeat(data, options);
    },

    observeImpression(
      target: string | Element,
      data?: Record<string, unknown>,
      options?: ImpressionOptions
    ) {
      return window.atribuTracker?.observeImpression(target, data, options) ?? (() => {});
    },

    flush() {
      flushOutboxNow();
    },

    reset() {
      resetOutbox();
      for (let i = 0; i < STORAGE_KEYS.length; i++) {
        try {
          storage.removeItem(STORAGE_KEYS[i]);
        } catch {
          // localStorage may be unavailable
        }
      }
      resetAnonymousId();
      resetSessionState();
    },
  };
}
