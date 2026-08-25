// ---------------------------------------------------------------------------
// Auto-capture: Stripe checkout session → stripe_checkout_completed
// ---------------------------------------------------------------------------
// When a Stripe Payment Link redirects back to the tracked site with
// ?session_id={CHECKOUT_SESSION_ID}, this module detects it and fires an
// event so the backend can stitch the payment to the browser session.
// ---------------------------------------------------------------------------

import { anonymousId } from "../session.js";
import { isStripePaymentLink, buildDecoratedUrl } from "./stripe-link.js";

// #111 — stamp the visitor's anonymous_id onto Stripe Payment Link URLs on the
// page (via client_reference_id) so a payment through them gets a deterministic
// ad link with zero config from the customer. The webhook (#110) reads
// client_reference_id back. Pure host/param logic lives in ./stripe-link.js.
export function initStripePaymentLinkDecoration() {
  try {
    var base = window.location.href;
    // Decorate anchors already in the DOM at load.
    var anchors = document.querySelectorAll('a[href*="buy.stripe.com"]');
    for (var i = 0; i < anchors.length; i++) {
      if (isStripePaymentLink(anchors[i].href, base)) {
        anchors[i].href = buildDecoratedUrl(anchors[i].href, base, anonymousId);
      }
    }
    // Just-in-time for SPA / dynamically-inserted buttons: rewrite the anchor's
    // href in the capture phase, before the browser navigates.
    document.addEventListener(
      "click",
      function (e) {
        var el = e.target;
        while (el && el.nodeName !== "A") el = el.parentElement;
        if (el && el.href && isStripePaymentLink(el.href, window.location.href)) {
          el.href = buildDecoratedUrl(el.href, window.location.href, anonymousId);
        }
      },
      true
    );
  } catch (_) {}
}

export function initStripeCheckoutCapture() {
  try {
    var params = new URLSearchParams(window.location.search);
    var sessionId =
      params.get("session_id") ||
      params.get("checkout_session") ||
      params.get("checkout_session_id");

    // Only process Stripe checkout session IDs (cs_ prefix)
    if (!sessionId || sessionId.indexOf("cs_") !== 0) return;

    window.atribuTracker.track("stripe_checkout_completed", {
      payload: {
        checkout_session_id: sessionId,
        path: window.location.pathname,
      },
    });

    // Clean URL to avoid re-firing on SPA navigation or page refresh
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete("session_id");
      url.searchParams.delete("checkout_session");
      url.searchParams.delete("checkout_session_id");
      if (url.href !== window.location.href) {
        window.history.replaceState(null, "", url.href);
      }
    } catch (_) {}
  } catch (_) {}
}
