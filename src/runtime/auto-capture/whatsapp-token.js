// ---------------------------------------------------------------------------
// #404 tier "text_token" — the OPTIONAL, per-profile, default-OFF token.
// ---------------------------------------------------------------------------
// When a merchant turns this on, the tracker appends a short marker to the
// `?text=` prefill of a WhatsApp link. The visitor sends it as part of their own
// first message, and the inbox side reads it back as a deterministic key.
//
// TWO RULES, both load-bearing:
//
//  1. **APPEND ONLY.** The merchant's prefill is copy they wrote; the token is
//     added after it, never in place of it. `buildTokenizedText` returns the
//     original text plus a marker, and when there is no original text it
//     returns the marker alone — it never rewrites, truncates or reorders what
//     was there.
//
//  2. **NEVER THE SOLE DEPENDENCY.** This tier rides on top of
//     `text_correlation`, which is invisible and always on. `normalizeWaMessageText`
//     strips the marker before comparing, so a tokenised prefill still
//     text-correlates when the visitor deletes the code — the two tiers cannot
//     cannibalise each other.
//
// The flag arrives as `window.ATRIBU_WA_TOKEN_ENABLED`, emitted into the
// install snippet from `profile_attribution_settings.wa_join_token_enabled`.
// Default OFF: absent, false, or anything other than the boolean `true` means
// off, matching how every other opt-in tracker flag is read.
// ---------------------------------------------------------------------------

// Crockford-style alphabet: no I, L, O or U, so a code read aloud or retyped
// cannot confuse 1/I/L or 0/O.
var TOKEN_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var TOKEN_LENGTH = 6;

/** True only when the per-profile flag is explicitly on. */
export function isWaTokenEnabled() {
  return window.ATRIBU_WA_TOKEN_ENABLED === true;
}

/**
 * Mint a token. 32^6 ≈ 1.07e9 values, scoped per profile and matched only
 * within a 7-day window — and a collision does not mis-join, it produces two
 * candidates, which the resolver's ambiguity rule declines.
 *
 * `crypto.getRandomValues` when available, `Math.random` otherwise: this is a
 * correlation handle, not a secret, and an engine without WebCrypto should
 * still get a working token rather than none.
 */
export function mintWaToken() {
  var out = "";
  var i;
  try {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      var bytes = new Uint8Array(TOKEN_LENGTH);
      window.crypto.getRandomValues(bytes);
      for (i = 0; i < TOKEN_LENGTH; i++) {
        out += TOKEN_ALPHABET.charAt(bytes[i] % TOKEN_ALPHABET.length);
      }
      return out;
    }
  } catch (_) {}
  for (i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET.charAt(Math.floor(Math.random() * TOKEN_ALPHABET.length));
  }
  return out;
}

/**
 * The merchant's prefill with the marker appended. Pure — no DOM, no globals —
 * so the append-only rule is directly testable.
 */
export function buildTokenizedText(originalText, token) {
  var marker = "[#" + token + "]";
  var base = typeof originalText === "string" ? originalText : "";
  if (!base) return marker;
  return base + " " + marker;
}

/**
 * Rewrite a WhatsApp URL's `?text=` to carry the token, leaving every other
 * part of the URL untouched.
 *
 * Returns `null` when the URL cannot be parsed or already carries a token — a
 * link the site itself tokenised, or a second capture-phase pass over the same
 * element after a rapid double-click. Re-minting there would hand the visitor a
 * different code than the one already indexed.
 */
export function buildTokenizedUrl(rawUrl, baseHref, token) {
  try {
    var u = new URL(String(rawUrl).trim(), baseHref);
    var existing = u.searchParams.get("text");
    if (existing && /\[#[0-9A-HJ-NP-TV-Z]{6}\]/i.test(existing)) return null;
    var text = buildTokenizedText(existing, token);
    u.searchParams.set("text", text);
    return { url: u.href, prefilledText: text };
  } catch (_) {
    return null;
  }
}

/**
 * Decorate the clicked element in place so the browser navigates to the
 * tokenised URL.
 *
 * Runs inside a CAPTURE-phase click listener, which is before the default
 * action, so writing the attribute here is enough — no `preventDefault`, no
 * `window.open`, no `location` assignment. That is the whole reason the token
 * can ship at all under the #397 capture policy.
 *
 * Returns `{ token, prefilledText }` for the event payload, or `null` when
 * nothing was changed (unparseable URL, already tokenised, or a target read out
 * of an inline `onclick` string, which is not an attribute we can safely
 * rewrite).
 */
export function decorateWhatsAppTarget(target, baseHref) {
  try {
    if (!target || !target.element || typeof target.element.setAttribute !== "function") {
      return null;
    }
    // An `onclick` body is code, not a URL slot. Rewriting it would mean
    // editing the merchant's JavaScript — out of scope, and exactly the class
    // of intervention the capture policy exists to prevent.
    if (target.linkSource === "inline_onclick") return null;

    var token = mintWaToken();
    var tokenized = buildTokenizedUrl(target.rawUrl, baseHref, token);
    if (!tokenized) return null;

    target.element.setAttribute(target.attribute, tokenized.url);
    return { token: token, prefilledText: tokenized.prefilledText };
  } catch (_) {
    return null;
  }
}
