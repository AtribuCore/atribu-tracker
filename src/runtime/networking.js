// ---------------------------------------------------------------------------
// HTTP transport: fetch, XHR, sendBeacon, outbox queue with retry
// ---------------------------------------------------------------------------

import {
  getEndpoint,
  getFallbackEndpoint,
  getTrackingKey,
  OUTBOX_KEY,
  OUTBOX_MAX_ITEMS,
  OUTBOX_FLUSH_INTERVAL_MS,
  OUTBOX_MAX_RETRIES,
  OUTBOX_MAX_RETRY_DELAY_MS,
  KEEPALIVE_BYTES_LIMIT,
  FAILOVER_THRESHOLD,
  FAILOVER_PROBE_COOLDOWN_MS,
} from "./config.js";
import {
  createFailoverState,
  recordPrimaryAttempt,
  shouldProbeFailover,
  decideFailover,
} from "./failover.js";
import { genId } from "./util.js";
import { storage } from "./storage.js";

var NON_RETRY_STATUS = {
  400: true,
  401: true,
  403: true,
  410: true,
  422: true,
};
export var outbox = [];
var outboxFlushTimer = null;
var outboxFlushing = false;
var flushEpoch = 0;

// ---------------------------------------------------------------------------
// Endpoint failover (#415)
//
// Session-scoped, in-memory only — never persisted (localStorage/
// sessionStorage) and never sent through the outbox's own JSON. A page
// reload gives the tracker a fresh module instance, which is exactly the
// re-probe policy: the primary is retried automatically on the next page
// load, with no background timer needed to "come back" to it. Within one
// page's lifetime a failover latches for the rest of that session — the
// design explicitly rejects flapping back and forth on partial recovery.
// ---------------------------------------------------------------------------

var failoverState = createFailoverState();
var failoverProbeInFlight = false;
var failoverLastProbeAt = 0;

// Which endpoint a send should target right now.
export function activeEndpoint() {
  if (failoverState.active) {
    var fallback = getFallbackEndpoint();
    if (fallback) return fallback;
  }
  return getEndpoint();
}

function runFailoverProbe() {
  if (failoverProbeInFlight) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  var fallback = getFallbackEndpoint();
  if (!fallback || typeof fetch !== "function") return;
  var now = Date.now();
  if (now - failoverLastProbeAt < FAILOVER_PROBE_COOLDOWN_MS) return;
  failoverLastProbeAt = now;
  failoverProbeInFlight = true;

  // A bare OPTIONS is the cheapest true reachability check: the collect
  // route answers it unconditionally (no tracking-key lookup, no DB work),
  // so a response — any response — proves DNS + TLS + the app are all up on
  // the fallback origin, without shipping a real event during the probe.
  fetch(fallback, { method: "OPTIONS" })
    .then(function () {
      return true;
    })
    .catch(function () {
      return false;
    })
    .then(function (reachable) {
      failoverProbeInFlight = false;
      var isOnline =
        typeof navigator !== "undefined" ? navigator.onLine : true;
      if (decideFailover(isOnline, reachable)) {
        failoverState.active = true;
        failoverState.consecutiveFailures = 0;
      } else {
        // Stay on the primary, but leave the counter at the threshold so
        // the very next failure re-probes instead of waiting for N more.
        failoverState.consecutiveFailures = FAILOVER_THRESHOLD;
      }
    });
}

// Feed the outcome of a primary-endpoint delivery attempt into the failover
// decision. A no-op once already failed over, or when no fallback is
// configured (most sites: nothing to fail over to).
function noteDeliveryOutcome(result) {
  if (failoverState.active) return;
  if (!getFallbackEndpoint()) return;
  recordPrimaryAttempt(failoverState, result.status === 0);
  if (shouldProbeFailover(failoverState, FAILOVER_THRESHOLD)) {
    runFailoverProbe();
  }
}

// ---------------------------------------------------------------------------
// Outbox persistence
// ---------------------------------------------------------------------------

export function loadOutbox() {
  try {
    var raw = storage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    var normalized = [];
    for (var i = 0; i < parsed.length; i++) {
      var item = parsed[i];
      if (!item || typeof item !== "object") continue;
      var payload =
        item.payload && typeof item.payload === "object"
          ? item.payload
          : null;
      if (!payload) continue;

      if (typeof payload.eventId === "string" && payload.eventId.trim()) {
        payload.eventId = payload.eventId.trim().slice(0, 128);
      } else {
        payload.eventId = genId("evt");
      }

      normalized.push({
        id: typeof item.id === "string" ? item.id : genId("q"),
        payload: payload,
        attempts: typeof item.attempts === "number" ? item.attempts : 0,
        retryAt: typeof item.retryAt === "number" ? item.retryAt : Date.now(),
      });
    }

    return normalized;
  } catch (_) {
    return [];
  }
}

function saveOutbox() {
  try {
    storage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  } catch (_) {}
}

function clampOutbox() {
  if (outbox.length <= OUTBOX_MAX_ITEMS) return;
  outbox = outbox.slice(outbox.length - OUTBOX_MAX_ITEMS);
}

function pickNextRetryDelay(attempt) {
  var raw = 3000 * Math.pow(2, attempt);
  var capped = Math.min(OUTBOX_MAX_RETRY_DELAY_MS, raw);
  var min = Math.max(1000, Math.floor(capped / 2));
  var jitter = Math.floor(Math.random() * (capped - min + 1));
  return min + jitter;
}

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

// In-memory callback map (not serialized to localStorage)
var outboxCallbacks = {};

function queueEvent(event, callback) {
  var id = genId("q");
  outbox.push({
    id: id,
    payload: event,
    attempts: 0,
    retryAt: Date.now(),
  });
  if (typeof callback === "function") {
    outboxCallbacks[id] = callback;
  }
  clampOutbox();
  saveOutbox();
  scheduleOutboxFlush(50);
}

function invokeCallback(id, error) {
  var cb = outboxCallbacks[id];
  if (cb) {
    delete outboxCallbacks[id];
    try { cb(error || null); } catch (_) {}
  }
}

export function scheduleOutboxFlush(delayMs) {
  if (outboxFlushTimer) return;
  outboxFlushTimer = setTimeout(function () {
    outboxFlushTimer = null;
    flushOutbox();
  }, typeof delayMs === "number" ? delayMs : OUTBOX_FLUSH_INTERVAL_MS);
}

export function flushOutboxNow() {
  if (outboxFlushTimer) {
    clearTimeout(outboxFlushTimer);
    outboxFlushTimer = null;
  }
  flushOutbox();
}

export function resetOutbox() {
  flushEpoch++;
  if (outboxFlushTimer) {
    clearTimeout(outboxFlushTimer);
    outboxFlushTimer = null;
  }
  outboxFlushing = false;
  outbox.length = 0;
  outboxCallbacks = {};
  saveOutbox();
}

// ---------------------------------------------------------------------------
// HTTP senders
// ---------------------------------------------------------------------------

function sendWithFetch(payload, keepalive) {
  if (typeof fetch !== "function") {
    return Promise.resolve({ ok: false, status: 0 });
  }
  var body = JSON.stringify(payload);
  return fetch(activeEndpoint(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-atribu-tracking-key": getTrackingKey(),
    },
    body: body,
    keepalive: !!keepalive && body.length < KEEPALIVE_BYTES_LIMIT,
  })
    .then(function (res) {
      return { ok: res.ok, status: res.status };
    })
    .catch(function () {
      return { ok: false, status: 0 };
    });
}

function sendWithXhr(payload) {
  return new Promise(function (resolve) {
    if (typeof XMLHttpRequest === "undefined") {
      resolve({ ok: false, status: 0 });
      return;
    }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", activeEndpoint(), true);
      xhr.setRequestHeader("content-type", "application/json");
      xhr.setRequestHeader("x-atribu-tracking-key", getTrackingKey());
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
        });
      };
      xhr.onerror = function () {
        resolve({ ok: false, status: 0 });
      };
      xhr.send(JSON.stringify(payload));
    } catch (_) {
      resolve({ ok: false, status: 0 });
    }
  });
}

function sendEventPayload(payload, keepalive) {
  return sendWithFetch(payload, keepalive).then(function (result) {
    if (
      result.ok ||
      result.status > 0 ||
      typeof XMLHttpRequest === "undefined"
    ) {
      return result;
    }
    return sendWithXhr(payload);
  });
}

// ---------------------------------------------------------------------------
// Outbox flush
// ---------------------------------------------------------------------------

function flushOutbox() {
  if (outboxFlushing) return;
  if (!getTrackingKey()) return;
  if (!outbox.length) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    scheduleOutboxFlush(OUTBOX_FLUSH_INTERVAL_MS);
    return;
  }

  outboxFlushing = true;
  var epoch = ++flushEpoch;
  var index = 0;

  function next() {
    if (epoch !== flushEpoch) {
      outboxFlushing = false;
      return;
    }

    if (index >= outbox.length) {
      outboxFlushing = false;
      saveOutbox();
      if (outbox.length > 0) scheduleOutboxFlush(OUTBOX_FLUSH_INTERVAL_MS);
      return;
    }

    var item = outbox[index];
    if (!item) {
      index++;
      next();
      return;
    }

    if (item.retryAt && item.retryAt > Date.now()) {
      index++;
      next();
      return;
    }

    sendEventPayload(item.payload, false)
      .then(function (result) {
        noteDeliveryOutcome(result);
        if (result.ok) {
          invokeCallback(item.id, null);
          outbox.splice(index, 1);
        } else {
          var attempts = (item.attempts || 0) + 1;
          item.attempts = attempts;
          if (
            NON_RETRY_STATUS[result.status] ||
            attempts > OUTBOX_MAX_RETRIES
          ) {
            invokeCallback(item.id, new Error("HTTP " + result.status));
            outbox.splice(index, 1);
          } else {
            item.retryAt = Date.now() + pickNextRetryDelay(attempts);
            index++;
          }
        }
        next();
      })
      .catch(function () {
        noteDeliveryOutcome({ ok: false, status: 0 });
        var attempts = (item.attempts || 0) + 1;
        item.attempts = attempts;
        if (attempts > OUTBOX_MAX_RETRIES) {
          invokeCallback(item.id, new Error("Network error"));
          outbox.splice(index, 1);
        } else {
          item.retryAt = Date.now() + pickNextRetryDelay(attempts);
          index++;
        }
        next();
      });
  }

  next();
}

// ---------------------------------------------------------------------------
// Beacon flush (pagehide / visibilitychange)
// ---------------------------------------------------------------------------

export function flushOutboxWithBeacon() {
  if (!getTrackingKey()) return;
  if (!outbox.length) return;
  if (!navigator || typeof navigator.sendBeacon !== "function") return;
  var now = Date.now();
  var nextQueue = [];
  for (var i = 0; i < outbox.length; i++) {
    var item = outbox[i];
    if (!item || !item.payload) continue;
    if (item.retryAt && item.retryAt > now) {
      nextQueue.push(item);
      continue;
    }
    try {
      var body = JSON.stringify(item.payload);
      if (!body || body.length > KEEPALIVE_BYTES_LIMIT) {
        nextQueue.push(item);
        continue;
      }
      var beaconBody = new Blob([body], { type: "application/json" });
      var ok = navigator.sendBeacon(activeEndpoint(), beaconBody);
      if (!ok) nextQueue.push(item);
    } catch (_) {
      nextQueue.push(item);
    }
  }
  outbox = nextQueue;
  saveOutbox();
}

// ---------------------------------------------------------------------------
// Dispatch helpers
// ---------------------------------------------------------------------------

export function createDispatchPayload(event) {
  var key = getTrackingKey();
  if (!key) return null;
  var payload = Object.assign({ trackingKey: key }, event);
  if (typeof payload.eventId === "string" && payload.eventId.trim()) {
    payload.eventId = payload.eventId.trim().slice(0, 128);
  } else {
    payload.eventId = genId("evt");
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Outbox patching: update a field on the most recent unflushed event
// ---------------------------------------------------------------------------

export function patchRecentOutboxEvent(eventName, patchFn) {
  for (var i = outbox.length - 1; i >= 0; i--) {
    var item = outbox[i];
    if (!item || !item.payload) continue;
    if (item.payload.eventName === eventName) {
      try { patchFn(item.payload); } catch (_) {}
      saveOutbox();
      return true;
    }
  }
  return false;
}

export function post(event, callback) {
  if (!getTrackingKey()) {
    if (typeof callback === "function") callback(new Error("Missing tracking key"));
    return Promise.resolve(false);
  }
  var payload = createDispatchPayload(event);
  if (!payload) {
    if (typeof callback === "function") callback(new Error("Invalid payload"));
    return Promise.resolve(false);
  }
  queueEvent(payload, callback);
  return Promise.resolve(true);
}
