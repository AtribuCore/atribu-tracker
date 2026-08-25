// ---------------------------------------------------------------------------
// Auto-capture: WhatsApp handoff clicks → whatsapp_click (#403)
// ---------------------------------------------------------------------------
// A click on a WhatsApp link is the moment a visitor stops being a web session
// and becomes a conversation. `outbound-links.js` filtered these to a generic
// `outbound_link_click` (destination phone and prefilled text unparsed) and
// dropped `whatsapp://` deep links entirely, because it accepts only http(s).
//
// This module captures the same click with the two fields the inbox side needs
// to join it — the merchant phone and the prefilled message text — plus the
// standard session/touch context every tracker event carries.
//
// WHAT THIS DELIBERATELY DOES NOT DO (#397 capture policy): it does not patch
// `window.open` and it does not patch `location.href`/`location.assign`. Both
// are on the banned list. Consequently a click whose WhatsApp URL exists only
// inside a JS handler at runtime is NOT captured. `data-*` attributes and
// inline `onclick` attribute text cover the common button-based themes;
// anything past that is an accepted, documented miss.
// ---------------------------------------------------------------------------

import { KEEPALIVE_BYTES_LIMIT, getTrackingKey } from "../config.js";
import { buildTrackingEvent } from "../track.js";
// `activeEndpoint`, not `getEndpoint` (#415/#425): when a profile's first-party
// CNAME dies the tracker fails over to the canonical origin for the rest of the
// page session, and a beacon sent straight to `getEndpoint()` would keep firing
// at the dead host. Every sendBeacon call site has to go through the failover.
import { activeEndpoint, createDispatchPayload, post } from "../networking.js";
import {
  WHATSAPP_DATA_ATTRIBUTES,
  extractWhatsAppUrlFromInlineHandler,
  isWhatsAppUrl,
  parseWhatsAppTarget,
} from "./whatsapp-target.js";
import { decorateWhatsAppTarget, isWaTokenEnabled } from "./whatsapp-token.js";

// How many ancestor levels to walk from the event target. Matches
// `extractAnchorFromEventTarget` in outbound-links.js — a WhatsApp CTA is
// commonly `<a><span><svg><path>` and the click lands on the path.
var ANCESTOR_DEPTH = 5;

/**
 * Find the nearest element in the ancestor chain that names a WhatsApp target,
 * and say where the target came from. Checked in specificity order: a real
 * `href` beats a data attribute, which beats a scraped inline handler.
 */
export function readWhatsAppTargetFromElement(node, baseHref) {
  var current = node;
  for (var depth = 0; depth < ANCESTOR_DEPTH && current; depth++) {
    if (typeof current.getAttribute === "function") {
      var href = current.tagName === "A" ? current.getAttribute("href") : null;
      if (href && isWhatsAppUrl(href, baseHref)) {
        return { element: current, rawUrl: href, linkSource: "href", attribute: "href" };
      }

      for (var i = 0; i < WHATSAPP_DATA_ATTRIBUTES.length; i++) {
        var attr = WHATSAPP_DATA_ATTRIBUTES[i];
        var value = current.getAttribute(attr);
        if (value && isWhatsAppUrl(value, baseHref)) {
          return { element: current, rawUrl: value, linkSource: "data_attr", attribute: attr };
        }
      }

      var inline = current.getAttribute("onclick");
      var scraped = extractWhatsAppUrlFromInlineHandler(inline);
      if (scraped) {
        return {
          element: current,
          rawUrl: scraped,
          linkSource: "inline_onclick",
          attribute: "onclick",
        };
      }
    }
    current = current.parentElement;
  }
  return null;
}

// Rapid-repeat guard, same shape and window as outbound-links.js. A single
// user gesture can surface as click + auxclick + keydown on some engines.
var _lastWhatsAppKey = null;
var _lastWhatsAppAt = 0;

function shouldSkipDispatch(key) {
  var now = Date.now();
  if (_lastWhatsAppKey === key && now - _lastWhatsAppAt < 400) return true;
  _lastWhatsAppKey = key;
  _lastWhatsAppAt = now;
  return false;
}

function dispatchWhatsAppClick(target) {
  try {
    if (!target) return;
    var parsed = parseWhatsAppTarget(target.rawUrl, window.location.href);
    if (!parsed) return;

    var key = [target.rawUrl, target.linkSource, window.location.href].join("|");
    if (shouldSkipDispatch(key)) return;

    // #404 tier "text_token" — OPT-IN per profile, default OFF. When on, a
    // short marker is APPENDED to whatever prefill the merchant wrote (never a
    // rewrite of it) and the same value rides this event, so both sides hold
    // the key. This runs in the CAPTURE phase, before the default action, so
    // writing the attribute is enough — no `window.open`, no `location`
    // assignment, nothing the #397 capture policy bans.
    var decorated = isWaTokenEnabled()
      ? decorateWhatsAppTarget(target, window.location.href)
      : null;

    var trackingEvent = buildTrackingEvent("whatsapp_click", {
      payload: {
        destination_phone: parsed.destinationPhone,
        prefilled_text: decorated ? decorated.prefilledText : parsed.prefilledText,
        wa_token: decorated ? decorated.token : null,
        destination_url: parsed.normalizedUrl,
        link_source: target.linkSource,
        link_text:
          target.element && typeof target.element.textContent === "string"
            ? target.element.textContent.trim().slice(0, 200)
            : null,
        source_page: window.location.pathname,
      },
    });

    // sendBeacon: the page is about to background or navigate to WhatsApp.
    // Same exit-race handling as outbound-links.js.
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

export function initWhatsAppLinkCapture() {
  function handle(event) {
    dispatchWhatsAppClick(
      readWhatsAppTargetFromElement(event.target, window.location.href)
    );
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
