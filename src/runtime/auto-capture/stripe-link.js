// ---------------------------------------------------------------------------
// Pure helpers for Stripe Payment Link decoration (#111). No DOM / no imports
// so the host-matching + param-injection logic is unit-testable in node.
// ---------------------------------------------------------------------------

// The canonical Stripe Payment Link host is buy.stripe.com. A session-specific
// checkout.stripe.com URL already carries its own params and is NOT a match.
export function isStripePaymentLink(rawUrl, baseHref) {
  try {
    var u = new URL(rawUrl, baseHref);
    return u.hostname === "buy.stripe.com" || u.hostname.slice(-15) === ".buy.stripe.com";
  } catch (_) {
    return false;
  }
}

// Stripe Payment Links accept client_reference_id as a URL query param and pass
// it through to the resulting checkout.session (#110 reads it back). Inject the
// visitor's anonymous_id — but never clobber a client_reference_id the site set.
export function buildDecoratedUrl(rawUrl, baseHref, anonId) {
  try {
    var u = new URL(rawUrl, baseHref);
    if (anonId && !u.searchParams.get("client_reference_id")) {
      u.searchParams.set("client_reference_id", anonId);
    }
    return u.href;
  } catch (_) {
    return rawUrl;
  }
}
