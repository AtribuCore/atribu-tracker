// ---------------------------------------------------------------------------
// Public API: window.atribuTracker
// ---------------------------------------------------------------------------

import { track, buildTrackingEvent } from "./track.js";
import { setConsent } from "./consent.js";
import { rotatePageViewId, resetAnonymousId, resetSessionState } from "./session.js";
import { broadcastIdentify } from "./identity-sync.js";
import { patchRecentOutboxEvent, resetOutbox } from "./networking.js";
import { storage } from "./storage.js";
import { getAttribution, getAttributionToken } from "./attribution.js";

var STORAGE_KEYS = [
  "atribu_session_id",
  "atribu_session_state",
  "atribu_session_ts",
  "atribu_session_source_fp",
  "atribu_first_touch",
  "atribu_latest_touch",
  "atribu_consent",
];

function clearCookie(name) {
  try {
    document.cookie =
      name + "=;path=/;max-age=0;samesite=lax";
  } catch {}
}

function resetTrackerState() {
  resetOutbox();
  for (var i = 0; i < STORAGE_KEYS.length; i++) {
    try {
      storage.removeItem(STORAGE_KEYS[i]);
    } catch {}
  }
  clearCookie("atribu_visitor_id");
  clearCookie("atribu_session_id");
  resetAnonymousId();
  resetSessionState();
}

window.atribuTracker = {
  track: track,
  trackSelfDescribing: function (event, options) {
    var input = event || {};
    var eventName =
      typeof input.eventName === "string" && input.eventName.trim()
        ? input.eventName.trim()
        : "custom_event";
    return track(
      eventName,
      {
        payload: input.payload || {},
        contextEntities: Array.isArray(input.contextEntities)
          ? input.contextEntities
          : undefined,
      },
      Object.assign({}, options || {}, {
        eventSchema: input.eventSchema,
        schemaVersion: input.schemaVersion,
      })
    );
  },
  identify: function (identifyInput) {
    var identify = identifyInput || {};
    if (typeof identify.userId === "string" && identify.userId.trim()) {
      window.ATRIBU_USER_ID = identify.userId.trim();
    }
    // Broadcast identity to other tabs
    broadcastIdentify(identify);
    return track("identify", { identify: identify });
  },
  page: function (data) {
    rotatePageViewId();
    var result = track("page_view", data);
    // SPA frameworks (Nuxt.js, React) set document.title asynchronously.
    // If the title was empty at fire time, retry before the outbox flushes.
    if (!document.title) {
      setTimeout(function () {
        var newTitle = document.title;
        if (newTitle) {
          patchRecentOutboxEvent("page_view", function (payload) {
            if (payload.payload && !payload.payload.title) {
              payload.payload.title = newTitle;
            }
          });
        }
      }, 200);
    }
    return result;
  },
  sessionStart: function () {
    return track("session_start");
  },
  setConsent: setConsent,
  reset: resetTrackerState,
  setUserId: function (userId) {
    if (typeof userId === "string" && userId.trim()) {
      window.ATRIBU_USER_ID = userId.trim();
    } else {
      delete window.ATRIBU_USER_ID;
    }
  },

  // Track an event with revenue data
  trackRevenue: function (eventName, amount, currency, data) {
    return track(
      eventName,
      Object.assign({}, data || {}, {
        valueAmount: typeof amount === "number" ? amount : undefined,
        currency:
          typeof currency === "string"
            ? currency.trim().toUpperCase()
            : undefined,
      })
    );
  },

  // #114 — confirmation/thank-you page purchase. Fires on the same device with
  // the live anonymous_id/session_id, so the sale is captured with its ad-click
  // lineage and the payment provider's cash event can stitch to that session
  // (the same-device backstop for when the provider can't carry the token).
  // Accepts { value, currency, orderId } (aliases: valueAmount, order_id).
  purchase: function (data) {
    var input = data || {};
    var value =
      typeof input.value === "number"
        ? input.value
        : typeof input.valueAmount === "number"
          ? input.valueAmount
          : undefined;
    var orderId =
      input.orderId != null
        ? input.orderId
        : input.order_id != null
          ? input.order_id
          : input.transactionId != null
            ? input.transactionId
            : undefined;
    var extra = Object.assign({}, input);
    delete extra.value;
    delete extra.valueAmount;
    delete extra.currency;
    delete extra.orderId;
    delete extra.order_id;
    delete extra.transactionId;
    return track(
      "purchase",
      Object.assign(extra, {
        valueAmount: value,
        currency:
          typeof input.currency === "string"
            ? input.currency.trim().toUpperCase()
            : undefined,
        order_id: orderId != null ? String(orderId) : undefined,
      })
    );
  },

  heartbeat: function (data, options) {
    var payload = Object.assign({}, data && data.payload ? data.payload : {}, data || {});
    delete payload.payload;
    payload.engagement_type = payload.engagement_type || "heartbeat";
    return track(
      "engagement",
      {
        payload: payload,
        contextEntities: data && Array.isArray(data.contextEntities)
          ? data.contextEntities
          : undefined,
      },
      options
    );
  },

  observeImpression: function (target, data, options) {
    var element =
      typeof target === "string" ? document.querySelector(target) : target;
    if (!element || typeof IntersectionObserver !== "function") {
      return function () {};
    }

    var impressionOptions = options || {};
    var threshold =
      typeof impressionOptions.threshold === "number"
        ? impressionOptions.threshold
        : 0.5;
    var fired = false;
    var observer = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (fired || !entry.isIntersecting || entry.intersectionRatio < threshold) {
            continue;
          }
          fired = true;
          observer.disconnect();

          var payload = Object.assign(
            {
              impression_id:
                element.getAttribute("data-atribu-impression") ||
                element.id ||
                "impression",
              visible_ratio: entry.intersectionRatio,
            },
            data && data.payload ? data.payload : {},
            data || {}
          );
          delete payload.payload;

          track(
            "view_content",
            {
              payload: payload,
              contextEntities:
                data && Array.isArray(data.contextEntities)
                  ? data.contextEntities
                  : undefined,
            },
            options
          );
        }
      },
      { threshold: [threshold] }
    );

    observer.observe(element);
    return function () {
      observer.disconnect();
    };
  },

  // #109 — hand the current identity + ad signal to a checkout.
  // getAttribution() returns the fields object; getAttributionToken() a single
  // compact string for a hidden field / Stripe `metadata` / client_reference_id.
  getAttribution: getAttribution,
  getAttributionToken: getAttributionToken,

  // Pre-init async form. By the time this method exists the tracker has loaded,
  // so `cb` fires on the next tick. Callers that must read attribution before
  // the bundle loads queue it on the stub instead — `atribuTracker.q.push(
  // ["ready", cb])` — which the runtime drain calls with the live tracker.
  ready: function (cb) {
    if (typeof cb === "function") {
      setTimeout(function () {
        cb(window.atribuTracker);
      }, 0);
    }
  },
  getAttributionAsync: function () {
    return Promise.resolve(getAttribution());
  },

  // Internal: used by engagement beacon (not part of public contract)
  _buildEvent: buildTrackingEvent,
};
