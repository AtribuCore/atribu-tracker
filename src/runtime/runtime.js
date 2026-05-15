// ---------------------------------------------------------------------------
// Atribu Tracker v3 — Runtime initialisation (callable, not auto-executing)
// ---------------------------------------------------------------------------
// Called by index.js (IIFE) and by the npm SDK after setting window config.

import { isTraditionalBot, detectAiAgent } from "./filtering.js";
import { shouldDeferInit, initBfcacheListener } from "./lifecycle.js";
import {
  outbox,
  loadOutbox,
  scheduleOutboxFlush,
  flushOutboxWithBeacon,
  post,
} from "./networking.js";

// api.js registers window.atribuTracker (must come before meta-bridge + auto-capture)
import "./api.js";

import { initEngagement, collectEngagementPayload } from "./engagement.js";
import { initMetaBridge } from "./meta-bridge.js";
import { initFormCapture } from "./auto-capture/forms.js";
import { initBookingCapture } from "./auto-capture/bookings.js";
import { initSpaCapture } from "./auto-capture/spa.js";
import { initOutboundLinkCapture } from "./auto-capture/outbound-links.js";
import { initFileDownloadCapture } from "./auto-capture/file-downloads.js";
import { initTaggedEventCapture } from "./auto-capture/tagged-events.js";
import { initStripeCheckoutCapture } from "./auto-capture/stripe-checkout.js";
import { initGhlFormCapture } from "./auto-capture/ghl-forms.js";
import { initFormInteractionCapture } from "./auto-capture/form-interactions.js";
import { initClickQualityCapture } from "./auto-capture/click-quality.js";
import { initWebVitalsCapture } from "./auto-capture/web-vitals.js";
import { initCtaVisibilityCapture } from "./auto-capture/cta-visibility.js";
import { initVideoCapture } from "./auto-capture/video.js";
import { initErrorCapture } from "./auto-capture/errors.js";
import { initIdentitySync } from "./identity-sync.js";

// ---------------------------------------------------------------------------
// initRuntime — the full tracker bootstrap
// ---------------------------------------------------------------------------

export function initRuntime() {
  if (
    typeof window === "undefined" ||
    window.__ATRIBU_TRACKER_LOADED__ ||
    isTraditionalBot()
  ) {
    return;
  }
  window.__ATRIBU_TRACKER_LOADED__ = true;

  // Cache AI agent detection at init (result used in every track() call)
  detectAiAgent();

  // Load persisted outbox and schedule first flush
  var loaded = loadOutbox();
  for (var i = 0; i < loaded.length; i++) {
    outbox.push(loaded[i]);
  }
  scheduleOutboxFlush(250);

  // Global event listeners for offline/online and page lifecycle
  window.addEventListener("online", function () {
    scheduleOutboxFlush(50);
  });

  // Send engagement beacon + flush outbox on page exit.
  // Guard flag prevents double-send: pagehide, beforeunload, and
  // visibilitychange=hidden can all fire on the same tab close.
  // The first call captures and resets engagement state; subsequent
  // calls would see zeros. Reset the flag on SPA navigation (below).
  var _exitBeaconSent = false;

  function emitEngagementEvent(kind) {
    var engagement = collectEngagementPayload();
    if (engagement.time_on_page_s <= 0 && engagement.scroll_depth_pct <= 0) {
      return null;
    }

    return window.atribuTracker._buildEvent(
      "engagement",
      {
        payload: Object.assign({}, engagement, {
          engagement_type: kind || "exit",
        }),
      },
      {
        eventSchema: "atribu.custom_event",
        schemaVersion: 1,
      }
    );
  }

  function sendEngagementBeacon() {
    if (_exitBeaconSent) {
      // Still flush outbox even if engagement already sent
      flushOutboxWithBeacon();
      return;
    }
    _exitBeaconSent = true;

    var trackingEvent = emitEngagementEvent("exit");
    if (trackingEvent) {
      // Add to outbox so it persists in localStorage and retries via fetch
      // on the next page load if sendBeacon fails. Direct sendBeacon without
      // outbox was unreliable — only ~1% of exit events were reaching the server.
      post(trackingEvent);
    }
    flushOutboxWithBeacon();
  }

  // Reset exit beacon guard on SPA navigation so each page gets its
  // own exit event. The SPA handler in spa.js calls collectEngagementPayload()
  // which resets engagement state; this flag must reset in sync.
  window.__atribuResetExitBeacon = function () {
    _exitBeaconSent = false;
  };

  window.addEventListener(
    "pagehide",
    function () {
      sendEngagementBeacon();
    },
    false
  );
  window.addEventListener(
    "beforeunload",
    function () {
      sendEngagementBeacon();
    },
    false
  );
  document.addEventListener(
    "visibilitychange",
    function () {
      if (document.visibilityState === "hidden") sendEngagementBeacon();
      else {
        // Reset exit beacon guard so returning to the tab allows a
        // fresh exit event for engagement accumulated after return
        _exitBeaconSent = false;
        scheduleOutboxFlush(200);
      }
    },
    false
  );

  // bfcache restoration listener (fires page_view when page restored)
  initBfcacheListener();

  // Init engagement tracking (scroll depth + time on page)
  initEngagement();

  var heartbeatSeconds =
    typeof window.ATRIBU_HEARTBEAT_INTERVAL_SECONDS === "number"
      ? window.ATRIBU_HEARTBEAT_INTERVAL_SECONDS
      : window.ATRIBU_HEARTBEAT_INTERVAL_SECONDS === false
        ? 0
        : 60;
  if (heartbeatSeconds > 0) {
    window.setInterval(function () {
      if (document.visibilityState !== "visible") return;
      var heartbeatEvent = emitEngagementEvent("heartbeat");
      if (!heartbeatEvent) return;
      post(heartbeatEvent);
    }, Math.max(heartbeatSeconds, 5) * 1000);
  }

  // Init Meta Pixel bridge
  initMetaBridge();

  // Init auto-capture (always-on)
  initGhlFormCapture();
  initFormCapture();
  initBookingCapture();
  initSpaCapture();
  initOutboundLinkCapture();
  initFileDownloadCapture();
  initTaggedEventCapture();
  initStripeCheckoutCapture();
  initFormInteractionCapture();
  initIdentitySync();
  initErrorCapture();

  // Init opt-in features (enabled by default, disable via config flags)
  if (window.ATRIBU_ENABLE_CLICK_QUALITY !== false) {
    initClickQualityCapture();
  }
  if (window.ATRIBU_ENABLE_WEB_VITALS !== false) {
    initWebVitalsCapture();
  }
  if (window.ATRIBU_ENABLE_CTA_TRACKING !== false) {
    initCtaVisibilityCapture();
  }
  if (window.ATRIBU_ENABLE_VIDEO_TRACKING !== false) {
    initVideoCapture();
  }

  // Drain any events queued before tracker loaded (queue stub pattern)
  var q = window.atribuTracker && window.atribuTracker.q;
  if (Array.isArray(q)) {
    for (var j = 0; j < q.length; j++) {
      var args = q[j];
      if (!args || !args.length) continue;
      var method = args[0];
      if (method === "track" && typeof args[1] === "string") {
        window.atribuTracker.track(args[1], args[2]);
      } else if (method === "identify") {
        window.atribuTracker.identify(args[1]);
      } else if (method === "page") {
        window.atribuTracker.page();
      } else if (method === "setConsent") {
        window.atribuTracker.setConsent(args[1]);
      } else if (method === "trackRevenue" && typeof args[1] === "string") {
        window.atribuTracker.trackRevenue(args[1], args[2], args[3], args[4]);
      }
    }
    delete window.atribuTracker.q;
  }

  // Auto-fire session_start + page_view (defer if prerendering/background)
  if (shouldDeferInit()) {
    document.addEventListener(
      "visibilitychange",
      function onVisible() {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", onVisible);
        window.atribuTracker.sessionStart();
        window.atribuTracker.page();
      },
      false
    );
  } else {
    window.atribuTracker.sessionStart();
    window.atribuTracker.page();
  }
}
