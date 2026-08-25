// ---------------------------------------------------------------------------
// Auto-capture: install-verification beacon (#410)
// ---------------------------------------------------------------------------
// Onboarding's "is my tracker actually installed?" check. The dashboard's
// "Verify installation" button generates a short-lived nonce and gives the
// customer a link to their own site with ?atb_verify=<nonce> appended. When
// the tracker sees that param on init, it POSTs {nonce, trackingKey} to the
// verify endpoint, fire-and-forget, and the dashboard flips to "installed".
//
// The nonce is our own plumbing, never a marketing signal — it must never
// reach stored touch/UTM context. This module only READS it; the actual
// stripping happens at the one place a raw location.href gets persisted
// (tracker/src/utm.js stripVerifyParam(), applied in touchContext() and
// track.js's buildTrackingEvent()).
// ---------------------------------------------------------------------------

import { getVerifyEndpoint, getTrackingKey } from "../config.js";

export function initInstallVerifyBeacon() {
  var nonce;
  try {
    nonce = new URLSearchParams(window.location.search).get("atb_verify");
  } catch (_) {
    return;
  }
  if (!nonce) return;

  var trackingKey = getTrackingKey();
  if (!trackingKey) return;

  try {
    if (typeof fetch !== "function") return;
    fetch(getVerifyEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nonce: nonce,
        trackingKey: trackingKey,
        pageUrl: window.location.href,
      }),
      keepalive: true,
    }).catch(function () {
      // Swallow — a verification beacon must never affect the storefront.
    });
  } catch (_) {
    // Swallow.
  }
}
