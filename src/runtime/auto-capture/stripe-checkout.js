// ---------------------------------------------------------------------------
// Auto-capture: Stripe checkout session → stripe_checkout_completed
// ---------------------------------------------------------------------------
// When a Stripe Payment Link redirects back to the tracked site with
// ?session_id={CHECKOUT_SESSION_ID}, this module detects it and fires an
// event so the backend can stitch the payment to the browser session.
// ---------------------------------------------------------------------------

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
