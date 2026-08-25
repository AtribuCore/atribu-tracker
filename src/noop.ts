// ---------------------------------------------------------------------------
// SSR no-op client — all methods are silent no-ops.
// Returned by init() when typeof window === "undefined" (Node.js, SSR).
// ---------------------------------------------------------------------------

import type { AtribuClient } from "./types";

const noop = () => {};
const noopCleanup = () => () => {};

export function createNoopClient(): AtribuClient {
  return {
    track: noop,
    trackSelfDescribing: noop,
    identify: noop,
    setUserId: noop,
    page: noop,
    sessionStart: noop,
    setConsent: noop,
    trackRevenue: noop,
    heartbeat: noop,
    observeImpression: noopCleanup,
    flush: noop,
    reset: noop,
    purchase: noop,
    getAttribution: () => ({}),
    getAttributionToken: () => "",
  };
}
