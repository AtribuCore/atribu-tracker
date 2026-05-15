// ---------------------------------------------------------------------------
// Outbound/exit-link capture: outbound_link_click on external links
// ---------------------------------------------------------------------------

import { KEEPALIVE_BYTES_LIMIT, getEndpoint, getTrackingKey } from "../config.js";
import { buildTrackingEvent } from "../track.js";
import { createDispatchPayload, post } from "../networking.js";

function isExternalLink(anchor) {
  try {
    if (!anchor || !anchor.href) return false;
    if (anchor.hasAttribute("download")) return false;
    var linkUrl = new URL(anchor.href, window.location.origin);
    if (linkUrl.protocol !== "http:" && linkUrl.protocol !== "https:")
      return false;
    return linkUrl.hostname !== window.location.hostname;
  } catch (_) {
    return false;
  }
}

function extractAnchorFromEventTarget(target) {
  var node = target;
  for (var i = 0; i < 5 && node; i++) {
    if (node.tagName === "A") return node;
    node = node.parentElement;
  }
  return null;
}

var _lastOutboundDispatchKey = null;
var _lastOutboundDispatchAt = 0;

function shouldSkipOutboundDispatch(dispatchKey) {
  var now = Date.now();
  if (
    _lastOutboundDispatchKey === dispatchKey &&
    now - _lastOutboundDispatchAt < 400
  ) {
    return true;
  }
  _lastOutboundDispatchKey = dispatchKey;
  _lastOutboundDispatchAt = now;
  return false;
}

function dispatchOutboundLinkClick(anchor) {
  try {
    if (!anchor || !isExternalLink(anchor)) return;
    var dispatchKey = [
      anchor.href,
      anchor.target || "_self",
      window.location.href,
    ].join("|");
    if (shouldSkipOutboundDispatch(dispatchKey)) return;

    var trackingEvent = buildTrackingEvent("outbound_link_click", {
      payload: {
        destination_url: anchor.href,
        link_text: (anchor.textContent || "").trim().slice(0, 200),
        link_target: anchor.target || "_self",
        source_page: window.location.pathname,
        is_external: true,
      },
    });

    // Use sendBeacon for reliability on page exit
    if (
      navigator &&
      typeof navigator.sendBeacon === "function" &&
      getTrackingKey()
    ) {
      var beaconPayload = createDispatchPayload(trackingEvent);
      if (!beaconPayload) return;
      var body = JSON.stringify(beaconPayload);
      if (body.length < KEEPALIVE_BYTES_LIMIT) {
        var blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(getEndpoint(), blob);
        return;
      }
    }

    // Fallback: queue via normal path
    post(trackingEvent);
  } catch (_) {}
}

export function initOutboundLinkCapture() {
  document.addEventListener(
    "click",
    function (event) {
      if (typeof event.button === "number" && event.button !== 0) return;
      dispatchOutboundLinkClick(extractAnchorFromEventTarget(event.target));
    },
    true
  );

  document.addEventListener(
    "auxclick",
    function (event) {
      if (event.button !== 1) return;
      dispatchOutboundLinkClick(extractAnchorFromEventTarget(event.target));
    },
    true
  );

  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== "Enter") return;
      dispatchOutboundLinkClick(extractAnchorFromEventTarget(event.target));
    },
    true
  );
}
