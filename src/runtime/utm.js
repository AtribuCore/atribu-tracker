// ---------------------------------------------------------------------------
// UTM collection, click IDs, touch persistence (first & latest)
// ---------------------------------------------------------------------------

import { FIRST_TOUCH_KEY, LATEST_TOUCH_KEY } from "./config.js";
import { cleanObject, hasAnyKey } from "./util.js";
import { readJson, writeJson } from "./storage.js";

export function collectUtmFromLocation() {
  var params = new URLSearchParams(window.location.search);
  return {
    source: params.get("utm_source") || undefined,
    medium: params.get("utm_medium") || undefined,
    campaign: params.get("utm_campaign") || undefined,
    content: params.get("utm_content") || undefined,
    term: params.get("utm_term") || undefined,
    id: params.get("utm_id") || undefined,
  };
}

export function collectClickIdsFromLocation() {
  var params = new URLSearchParams(window.location.search);
  return {
    gclid: params.get("gclid") || undefined,
    fbclid: params.get("fbclid") || undefined,
    ttclid: params.get("ttclid") || undefined,
    msclkid: params.get("msclkid") || undefined,
    wbraid: params.get("wbraid") || undefined,
    gbraid: params.get("gbraid") || undefined,
    li_fat_id: params.get("li_fat_id") || undefined,
    twclid: params.get("twclid") || undefined,
    // Instagram-scoped User ID stamped on outbound DM links by
    // sendInstagramText (see link-enricher.ts:87-91). Captured here
    // so a customer who DMs the brand and later submits a website
    // form gets stitched: IGSID → email/phone via resolveCustomerProfile
    // when identify() fires. ig_media_id rides along as analytics
    // metadata; it is not used for identity stitching itself.
    igsid: params.get("igsid") || undefined,
    ig_media_id: params.get("ig_media_id") || undefined,
    // #409 — broadened long tail. classify_default_channel() maps these to
    // Paid Social (rdt_cid/sccid/epik) or Display (dclid); qclid/irclid ride
    // through generically (captured + tokenized, no channel-name mapping).
    rdt_cid: params.get("rdt_cid") || undefined, // Reddit
    sccid: params.get("sccid") || undefined, // Snapchat
    epik: params.get("epik") || undefined, // Pinterest
    dclid: params.get("dclid") || undefined, // Google Display/DV360
    qclid: params.get("qclid") || undefined, // Quora
    irclid: params.get("irclid") || undefined, // Impact
  };
}

// #410 — the install-verification beacon appends ?atb_verify=<nonce> to
// whatever page the merchant opens to prove the tracker is installed. It is
// our own plumbing, not a marketing signal, and must never reach stored
// touch/UTM context. collectUtmFromLocation()/collectClickIdsFromLocation()
// above only ever read specific known param names so they're already immune;
// this is the one place a raw location.href gets persisted verbatim.
export function stripVerifyParam(href) {
  try {
    var url = new URL(href);
    if (!url.searchParams.has("atb_verify")) return href;
    url.searchParams.delete("atb_verify");
    return url.toString();
  } catch (_) {
    return href;
  }
}

// True when `referrer` names a different host than the current page — a
// same-site referrer (e.g. a click from one page of the tracked site to
// another) is not a marketing signal.
function isExternalReferrer(referrer) {
  if (!referrer) return false;
  try {
    var refHost = new URL(referrer).hostname;
    return !!refHost && refHost !== window.location.hostname;
  } catch (_) {
    return false;
  }
}

function mergeTouch(existing, incoming) {
  var existingUtm = cleanObject(
    existing && existing.utm ? existing.utm : {}
  );
  var existingClickIds = cleanObject(
    existing && existing.clickIds ? existing.clickIds : {}
  );
  var incomingUtm = cleanObject(
    incoming && incoming.utm ? incoming.utm : {}
  );
  var incomingClickIds = cleanObject(
    incoming && incoming.clickIds ? incoming.clickIds : {}
  );
  return {
    utm: Object.assign({}, existingUtm, incomingUtm),
    clickIds: Object.assign({}, existingClickIds, incomingClickIds),
    capturedAt:
      (existing && existing.capturedAt) || new Date().toISOString(),
  };
}

export function touchContext() {
  var fromUrl = {
    utm: collectUtmFromLocation(),
    clickIds: collectClickIdsFromLocation(),
    capturedAt: new Date().toISOString(),
  };
  var urlHasTracking =
    hasAnyKey(cleanObject(fromUrl.utm)) ||
    hasAnyKey(cleanObject(fromUrl.clickIds));

  var firstTouch = readJson(FIRST_TOUCH_KEY);
  var latestTouch = readJson(LATEST_TOUCH_KEY);

  if (!firstTouch && urlHasTracking) {
    firstTouch = mergeTouch(null, fromUrl);
    writeJson(FIRST_TOUCH_KEY, firstTouch);
  } else if (!firstTouch && isExternalReferrer(document.referrer)) {
    // Organic first visit — no UTMs/click IDs on the URL, but a real
    // external referrer (Instagram bio link, Google organic, a bare share
    // link, …). Persist referrer + landing page as first touch so
    // getAttribution()/the token still carries a first-touch signal for
    // off-site conversion paths (#406). Never fabricate UTM values from the
    // referrer — channel classification happens server-side.
    // First-write-wins, same as the UTM branch above: a later paid visit
    // must not overwrite this.
    firstTouch = {
      referrer: document.referrer,
      landing_page: stripVerifyParam(window.location.href),
      capturedAt: new Date().toISOString(),
    };
    writeJson(FIRST_TOUCH_KEY, firstTouch);
  }

  if (urlHasTracking) {
    latestTouch = mergeTouch(latestTouch, fromUrl);
    latestTouch.capturedAt = new Date().toISOString();
    writeJson(LATEST_TOUCH_KEY, latestTouch);
  }

  if (!latestTouch && firstTouch) latestTouch = firstTouch;

  return {
    firstTouch: firstTouch || null,
    latestTouch: latestTouch || null,
  };
}
