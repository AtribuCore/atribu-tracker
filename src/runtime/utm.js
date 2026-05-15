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
  };
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
