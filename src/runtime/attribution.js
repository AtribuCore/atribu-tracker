// ---------------------------------------------------------------------------
// getAttribution() — the identity + ad signal the tracker already holds, so a
// checkout can carry it onto the payment (#109). Pure read; no capture change.
// The serialized token round-trips server-side via parseAttributionToken()
// (packages/analytics-enrichment/src/attribution-token.ts).
// ---------------------------------------------------------------------------

import { anonymousId, getSessionId } from "./session.js";
import { touchContext } from "./utm.js";

// Format version prefix — the server rejects a token without it, and a future
// shape bump ("atb2.") stays distinguishable.
var TOKEN_PREFIX = "atb1.";

function cleanObject(obj) {
  var out = {};
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      var v = obj[k];
      if (v !== undefined && v !== null && v !== "") out[k] = v;
    }
  }
  return out;
}

// UTF-8-safe base64url (UTM values can carry non-ASCII).
function b64urlEncode(str) {
  var b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The current device/session identity + ad signal, flattened for a checkout.
 * Synchronous — the tracker is initialized by the time api.js runs.
 */
export function getAttribution() {
  var ctx = touchContext();
  var latest = ctx.latestTouch || {};
  var first = ctx.firstTouch || {};
  var utm = latest.utm || {};
  var clickIds = latest.clickIds || {};

  var out = cleanObject({
    anonymous_id: anonymousId,
    session_id: getSessionId(),
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    utm_content: utm.content,
    utm_term: utm.term,
    utm_id: utm.id,
    fbclid: clickIds.fbclid,
    gclid: clickIds.gclid,
    msclkid: clickIds.msclkid,
    ttclid: clickIds.ttclid,
  });

  var firstUtm = cleanObject(first.utm || {});
  var firstClicks = cleanObject(first.clickIds || {});
  var firstReferrer = first.referrer || undefined;
  var firstLandingPage = first.landing_page || undefined;
  if (
    Object.keys(firstUtm).length ||
    Object.keys(firstClicks).length ||
    firstReferrer
  ) {
    out.first_touch = cleanObject({
      utm: Object.keys(firstUtm).length ? firstUtm : undefined,
      click_ids: Object.keys(firstClicks).length ? firstClicks : undefined,
      captured_at: first.capturedAt,
      // #406 — a referrer-only first touch (organic visit, no UTMs/click
      // IDs on the URL). Never fabricated: only set when utm.js's
      // touchContext() captured a real external referrer.
      referrer: firstReferrer,
      landing_page: firstLandingPage,
    });
  }
  return out;
}

/**
 * A single compact string for a hidden form field, a Stripe/MP checkout
 * `metadata` value, or a `client_reference_id`. Parse it server-side with
 * parseAttributionToken(). Returns "" if serialization fails.
 */
export function getAttributionToken() {
  try {
    return TOKEN_PREFIX + b64urlEncode(JSON.stringify(getAttribution()));
  } catch (e) {
    return "";
  }
}
