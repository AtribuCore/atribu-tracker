// ---------------------------------------------------------------------------
// Pure helpers for WhatsApp link detection + parsing (#403). No DOM, no
// imports, so the host-matching and phone/text extraction are unit-testable in
// node — same split as `stripe-link.js`.
//
// Shapes we recognise (mirrors the surface Vambe's `buildDtoFromHref` covers,
// on our own event pipeline):
//
//   https://wa.me/56912345678?text=Hola
//   https://api.whatsapp.com/send?phone=56912345678&text=Hola
//   https://web.whatsapp.com/send?phone=56912345678&text=Hola
//   whatsapp://send?phone=56912345678&text=Hola
//
// `wa.me/message/<CODE>` (a WhatsApp short link) is recognised as a WhatsApp
// target but yields NO phone: the code is an opaque handle, not a number, and
// inventing a phone from it would poison the (merchant_phone, clicked_at) join
// key the inbox side matches on.
// ---------------------------------------------------------------------------

// Exact hosts only. A suffix match (`.endsWith("wa.me")`) would accept
// `evil-wa.me`; the explicit `"." + host` check accepts a real subdomain
// without accepting a lookalike registrable domain.
var WHATSAPP_HOSTS = ["wa.me", "api.whatsapp.com", "web.whatsapp.com"];

/** `whatsapp:` deep links. Kept separate — they have no useful hostname. */
var WHATSAPP_PROTOCOL = "whatsapp:";

function matchesWhatsAppHost(hostname) {
  var host = (hostname || "").toLowerCase();
  for (var i = 0; i < WHATSAPP_HOSTS.length; i++) {
    var known = WHATSAPP_HOSTS[i];
    if (host === known) return true;
    if (host.length > known.length + 1 && host.slice(-(known.length + 1)) === "." + known) {
      return true;
    }
  }
  return false;
}

/**
 * True when `rawUrl` addresses a WhatsApp conversation.
 *
 * `outbound-links.js` calls this to suppress its own generic
 * `outbound_link_click` for the same click, so one click stays one event. That
 * suppression is structural rather than ordering-dependent: both modules
 * register capture-phase listeners on `document`, and relying on registration
 * order to decide which one wins is exactly the kind of coupling that breaks
 * the first time someone reorders `initRuntime`.
 */
export function isWhatsAppUrl(rawUrl, baseHref) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  var trimmed = rawUrl.trim();
  if (!trimmed) return false;
  // Cheap prefix test first: `new URL` on a `whatsapp://` string is fine in
  // modern browsers but this keeps the hot path off the parser entirely.
  if (trimmed.slice(0, WHATSAPP_PROTOCOL.length).toLowerCase() === WHATSAPP_PROTOCOL) {
    return true;
  }
  try {
    var u = new URL(trimmed, baseHref);
    if (u.protocol === WHATSAPP_PROTOCOL) return true;
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return matchesWhatsAppHost(u.hostname);
  } catch (_) {
    return false;
  }
}

/**
 * Keep digits only, and cap the length so a mangled path segment can't become
 * a 400-character "phone". E.164 tops out at 15 digits; 7 is the shortest
 * plausible national number (same floor `normalizePhone` uses server-side).
 *
 * Deliberately NOT E.164-normalised here: the tracker does not know the
 * merchant's country, and a wa.me path segment is already international by
 * construction. The server side compares digits-only against the WhatsApp
 * Cloud API's own `display_phone_number`, which is likewise digits.
 */
function normalizeMerchantPhone(raw) {
  if (!raw || typeof raw !== "string") return null;
  var digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

function firstPathSegment(pathname) {
  var parts = (pathname || "").split("/");
  for (var i = 0; i < parts.length; i++) {
    if (parts[i]) return parts[i];
  }
  return null;
}

/**
 * Parse a WhatsApp target into the two fields the join needs.
 *
 * Returns `null` when the URL is not a WhatsApp target at all. Returns an
 * object with a null `destinationPhone` when it IS one but carries no number
 * (`wa.me/message/<CODE>`, or a bare `?text=` share link) — that is still a
 * capture-worthy click, it just cannot key the merchant-phone tier.
 */
export function parseWhatsAppTarget(rawUrl, baseHref) {
  if (!isWhatsAppUrl(rawUrl, baseHref)) return null;

  var destinationPhone = null;
  var prefilledText = null;
  var normalizedUrl = null;

  try {
    var u = new URL(String(rawUrl).trim(), baseHref);
    normalizedUrl = u.href;

    // `?phone=` wins when present — it is the explicit form and the only one
    // api/web.whatsapp.com use.
    destinationPhone = normalizeMerchantPhone(u.searchParams.get("phone"));

    // wa.me/<digits> (and whatsapp://send/<digits>, which some themes emit).
    if (!destinationPhone) {
      destinationPhone = normalizeMerchantPhone(firstPathSegment(u.pathname));
    }

    var text = u.searchParams.get("text");
    if (typeof text === "string") {
      var trimmedText = text.trim();
      // 4096 is WhatsApp's own message-body ceiling; anything longer than that
      // did not come from a prefill and is not worth carrying.
      if (trimmedText) prefilledText = trimmedText.slice(0, 4096);
    }
  } catch (_) {
    // A `whatsapp://` string an old engine refuses to parse still counts as a
    // WhatsApp click — we just have no fields for it.
    return { destinationPhone: null, prefilledText: null, normalizedUrl: null };
  }

  return {
    destinationPhone: destinationPhone,
    prefilledText: prefilledText,
    normalizedUrl: normalizedUrl,
  };
}

/**
 * The `data-*` attributes button-based themes use to carry a WhatsApp target
 * on a non-anchor element. Same list Vambe walks, minus the `onclick` regex,
 * which `readWhatsAppTargetFromElement` handles separately.
 */
export var WHATSAPP_DATA_ATTRIBUTES = [
  "data-whatsapp",
  "data-wa-link",
  "data-href",
  "data-url",
  "data-link",
];

/**
 * Pull the first wa.me / api.whatsapp.com / web.whatsapp.com / whatsapp:// URL
 * out of an inline handler string.
 *
 * This reads an ATTRIBUTE. It does not patch `window.open` and it does not
 * patch `location.*` — both are banned by the #397 capture policy, so a click
 * whose WhatsApp URL is only ever computed inside JS at runtime is a known,
 * accepted miss.
 */
export function extractWhatsAppUrlFromInlineHandler(handlerSource) {
  if (!handlerSource || typeof handlerSource !== "string") return null;
  var match = handlerSource.match(
    /(?:whatsapp:\/\/[^\s'"`)]+|https?:\/\/(?:[a-z0-9-]+\.)*(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\/[^\s'"`)]*)/i
  );
  return match ? match[0] : null;
}
