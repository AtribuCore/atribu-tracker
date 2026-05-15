// ---------------------------------------------------------------------------
// Session management (30-min inactivity timeout)
// ---------------------------------------------------------------------------

import { getSessionMode, getSessionTimeoutMs } from "./config.js";
import { genId, cleanObject } from "./util.js";
import { storage, readOrCreate, readJson, writeJson } from "./storage.js";
import { collectClickIdsFromLocation, collectUtmFromLocation } from "./utm.js";

var SESSION_STATE_KEY = "atribu_session_state";
var SESSION_SOURCE_FP_KEY = "atribu_session_source_fp";

export var anonymousId = readOrCreate("atribu_anon_id", "anon");

function computeCurrentSourceFingerprint() {
  var clickIds = cleanObject(collectClickIdsFromLocation());
  if (Object.keys(clickIds).length > 0) {
    return "click:" + JSON.stringify(clickIds);
  }

  var utm = cleanObject(collectUtmFromLocation());
  if (utm.source || utm.medium || utm.campaign || utm.id) {
    return (
      "utm:" +
      [
        utm.source || "",
        utm.medium || "",
        utm.campaign || "",
        utm.id || "",
      ].join("|")
    );
  }

  return null;
}

function createSessionState(previousState, sourceFingerprint) {
  return {
    sessionId: genId("sess"),
    previousSessionId: previousState ? previousState.sessionId : null,
    sessionIndex: previousState ? (previousState.sessionIndex || 0) + 1 : 1,
    eventIndex: 0,
    firstEventId: null,
    firstEventTimestamp: null,
    lastMarketingFingerprint: sourceFingerprint || null,
    lastSeenAt: Date.now(),
    currentPageViewId: genId("pv"),
  };
}

function loadSessionState() {
  var now = Date.now();
  var existing = readJson(SESSION_STATE_KEY);
  var currentSourceFingerprint = computeCurrentSourceFingerprint();
  if (
    existing &&
    typeof existing.sessionId === "string" &&
    typeof existing.lastSeenAt === "number" &&
    now - existing.lastSeenAt < getSessionTimeoutMs()
  ) {
    existing.currentPageViewId = existing.currentPageViewId || genId("pv");
    existing.sessionIndex = existing.sessionIndex || 1;
    existing.eventIndex = existing.eventIndex || 0;
    existing.lastMarketingFingerprint =
      existing.lastMarketingFingerprint ||
      storage.getItem(SESSION_SOURCE_FP_KEY) ||
      null;

    if (
      getSessionMode() === "inactivity_or_source_change" &&
      currentSourceFingerprint &&
      existing.lastMarketingFingerprint &&
      currentSourceFingerprint !== existing.lastMarketingFingerprint
    ) {
      return createSessionState(existing, currentSourceFingerprint);
    }

    if (currentSourceFingerprint) {
      existing.lastMarketingFingerprint = currentSourceFingerprint;
    }
    return existing;
  }
  return createSessionState(existing, currentSourceFingerprint);
}

function setCookie(name, value, maxAge) {
  try {
    document.cookie =
      name + "=" + encodeURIComponent(value) +
      ";path=/;max-age=" + maxAge +
      ";samesite=lax";
  } catch (_) {}
}

function persistSessionState(state) {
  writeJson(SESSION_STATE_KEY, state);
  try {
    storage.setItem("atribu_session_id", state.sessionId);
    storage.setItem("atribu_session_ts", String(state.lastSeenAt));
    if (state.lastMarketingFingerprint) {
      storage.setItem(SESSION_SOURCE_FP_KEY, state.lastMarketingFingerprint);
    } else {
      storage.removeItem(SESSION_SOURCE_FP_KEY);
    }
  } catch (_) {}

  // Write tracking IDs as first-party cookies so server-side code (e.g.
  // checkout routes) can read them and pass to payment provider metadata.
  setCookie("atribu_visitor_id", anonymousId, 31536000); // 1 year
  setCookie("atribu_session_id", state.sessionId, 1800);  // 30 min
}

function ensureSessionState() {
  var state = loadSessionState();
  state.lastSeenAt = Date.now();
  persistSessionState(state);
  return state;
}

export function resetAnonymousId() {
  anonymousId = genId("anon");
  try {
    storage.setItem("atribu_anon_id", anonymousId);
  } catch (_) {}
  return anonymousId;
}

export function resetSessionState() {
  var state = createSessionState(null, computeCurrentSourceFingerprint());
  persistSessionState(state);
  return state;
}

export function getSessionId() {
  return ensureSessionState().sessionId;
}

export function getCurrentPageViewId() {
  return ensureSessionState().currentPageViewId;
}

export function rotatePageViewId() {
  var state = ensureSessionState();
  state.currentPageViewId = genId("pv");
  persistSessionState(state);
  return state.currentPageViewId;
}

export function consumeEventContext(eventId, eventTimestamp) {
  var state = ensureSessionState();

  if (!state.firstEventId) {
    state.firstEventId = eventId;
  }
  if (!state.firstEventTimestamp) {
    state.firstEventTimestamp = eventTimestamp;
  }

  state.eventIndex = (state.eventIndex || 0) + 1;
  state.lastSeenAt = Date.now();
  persistSessionState(state);

  return {
    sessionId: state.sessionId,
    previousSessionId: state.previousSessionId,
    sessionIndex: state.sessionIndex,
    eventIndex: state.eventIndex,
    firstEventId: state.firstEventId,
    firstEventTimestamp: state.firstEventTimestamp,
    pageViewId: state.currentPageViewId,
  };
}
