// ---------------------------------------------------------------------------
// Auto-capture: tel: / mailto: clicks → contact_click (#405)
// ---------------------------------------------------------------------------
// Same module family and the same protocol gap as `whatsapp-links.js`:
// `outbound-links.js` passes only http(s), so a phone tap or an email link is
// invisible. For phone-heavy verticals a `tel:` click is the only web-side
// trace of a caller who then books by phone.
//
// EXPLICITLY OUT OF SCOPE — no auto-stitching. This module records a payload;
// it never calls `identify()` and the server never resolves a customer profile
// from it. A later GHL appointment whose contact phone matches a recent
// `contact_click` destination is a SIGNAL to surface, not an automatic merge:
// `resolveCustomerProfile` from a bare phone with no PII mints an orphan
// profile that the real contact event can never merge into, permanently
// splitting one person in two (`.claude/rules/crm-ingestion.md`, Appointment
// identity, invariant 2). Automated linkage gets its own design.
// ---------------------------------------------------------------------------

import { KEEPALIVE_BYTES_LIMIT, getTrackingKey } from "../config.js";
import { buildTrackingEvent } from "../track.js";
// `activeEndpoint`, not `getEndpoint` (#415/#425) — every sendBeacon call site
// has to go through the CNAME failover, or a `tel:` tap on a profile whose
// first-party domain has died beacons at the dead host and is lost.
import { activeEndpoint, createDispatchPayload, post } from "../networking.js";
import { parseContactTarget } from "./contact-target.js";

// Matches `extractAnchorFromEventTarget` in outbound-links.js — a phone CTA is
// commonly `<a><span><svg>` and the click lands on the svg.
var ANCESTOR_DEPTH = 5;

function extractAnchorFromEventTarget(target) {
  var node = target;
  for (var i = 0; i < ANCESTOR_DEPTH && node; i++) {
    if (node.tagName === "A") return node;
    node = node.parentElement;
  }
  return null;
}

// Rapid-repeat guard, same shape and window as the sibling capture modules.
var _lastContactKey = null;
var _lastContactAt = 0;

function shouldSkipDispatch(key) {
  var now = Date.now();
  if (_lastContactKey === key && now - _lastContactAt < 400) return true;
  _lastContactKey = key;
  _lastContactAt = now;
  return false;
}

function dispatchContactClick(anchor) {
  try {
    if (!anchor || typeof anchor.getAttribute !== "function") return;
    // Read the ATTRIBUTE, not `anchor.href`: the resolved property normalises
    // `tel:` differently across engines, and the raw attribute is what the site
    // actually authored.
    var target = parseContactTarget(anchor.getAttribute("href"));
    if (!target) return;

    var key = [target.method, target.destination, window.location.href].join("|");
    if (shouldSkipDispatch(key)) return;

    var trackingEvent = buildTrackingEvent("contact_click", {
      payload: {
        method: target.method,
        destination: target.destination,
        link_text: (anchor.textContent || "").trim().slice(0, 200),
        source_page: window.location.pathname,
      },
    });

    // sendBeacon: a `tel:` tap backgrounds the page as the dialer opens.
    if (navigator && typeof navigator.sendBeacon === "function" && getTrackingKey()) {
      var beaconPayload = createDispatchPayload(trackingEvent);
      if (beaconPayload) {
        var body = JSON.stringify(beaconPayload);
        if (body.length < KEEPALIVE_BYTES_LIMIT) {
          var blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(activeEndpoint(), blob);
          return;
        }
      }
    }

    post(trackingEvent);
  } catch (_) {}
}

export function initContactLinkCapture() {
  function handle(event) {
    dispatchContactClick(extractAnchorFromEventTarget(event.target));
  }

  document.addEventListener(
    "click",
    function (event) {
      if (typeof event.button === "number" && event.button !== 0) return;
      handle(event);
    },
    true
  );

  document.addEventListener(
    "auxclick",
    function (event) {
      if (event.button !== 1) return;
      handle(event);
    },
    true
  );

  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== "Enter") return;
      handle(event);
    },
    true
  );
}
