// ---------------------------------------------------------------------------
// Endpoint failover: pure decision logic (#415)
//
// First-party tracking domains (trk.<merchant-domain>) proxy to
// www.atribu.app. If the merchant's CNAME breaks (DNS change, expired
// domain, registrar mishap), the primary endpoint is dead and every event
// silently dies — the outbox in networking.js only retries the SAME dead
// endpoint forever.
//
// This module holds only the decision logic and is deliberately free of
// fetch/window/timers so it is unit-testable without mocking the network.
// The orchestration (counting real attempts, running the reachability
// probe, picking the active endpoint, session-scoped state) lives in
// networking.js.
// ---------------------------------------------------------------------------

export function createFailoverState() {
  return {
    consecutiveFailures: 0,
    active: false,
  };
}

// Call after every delivery attempt against the PRIMARY endpoint.
//
// `isNetworkFailure` must be true ONLY for an attempt the browser could not
// complete at all (status 0 — fetch rejected, DNS/TLS/connection failure).
// Never pass true for a real HTTP response (4xx/5xx): any response at all
// proves the endpoint is reachable, and that failure class is already
// handled correctly by the outbox's own retry/backoff.
//
// Mutates and returns `state` (matches the outbox's own in-place style).
export function recordPrimaryAttempt(state, isNetworkFailure) {
  if (!state || state.active) return state;
  state.consecutiveFailures = isNetworkFailure
    ? state.consecutiveFailures + 1
    : 0;
  return state;
}

// True once consecutive primary network failures cross `threshold` and we
// aren't already failed over — i.e. it's time to run a reachability probe
// against the fallback origin.
export function shouldProbeFailover(state, threshold) {
  if (!state || state.active) return false;
  return state.consecutiveFailures >= threshold;
}

// The actual failover decision, given what's known once a probe has run.
//
// `isOnline` is `navigator.onLine`: `false` means the browser believes it
// has no network at all, which the outbox already handles correctly — every
// endpoint is equally unreachable, so failing over would only add a second
// dead target and churn state for nothing. Anything else (`true`, or
// `undefined` where the signal isn't available) proceeds to the probe
// result.
//
// `fallbackReachable` is the probe's verdict: did the fallback origin
// answer at all? Only "network is fine, but the primary specifically is
// dead" (online AND fallback reachable) should trigger failover.
export function decideFailover(isOnline, fallbackReachable) {
  if (isOnline === false) return false;
  return !!fallbackReachable;
}
