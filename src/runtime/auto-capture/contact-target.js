// ---------------------------------------------------------------------------
// Pure helpers for `tel:` / `mailto:` link parsing (#405). No DOM, no imports —
// same split as `stripe-link.js` and `whatsapp-target.js`.
//
// `outbound-links.js` passes only `http:`/`https:`, so these clicks are
// invisible today. For phone-heavy verticals (GHL medical/dental profiles) a
// `tel:` click is the ONLY web-side trace of a caller who then books by phone —
// exactly the blind spot `ghl-appointment-identity.ts` exists to compensate
// for, where a manual GHL booking arrives with a `contactId` and no web
// context at all.
// ---------------------------------------------------------------------------

/**
 * Digits-only, keeping a leading `+`, so a captured number is comparable with
 * the phones GHL stores.
 *
 * NOT libphonenumber-normalised, and that is deliberate twice over: the tracker
 * ships to every page on a customer's site (a phone-number parser is ~150 kB
 * against a ~60 kB bundle), and the browser does not know the merchant's
 * country, so a strict parse would either reject valid national numbers or
 * invent a country code. `normalizePhone` server-side does the real E.164 work
 * when a country hint exists.
 *
 * `tel:` URIs may legally carry `;ext=`, `;phone-context=` and friends
 * (RFC 3966); everything from the first `;` is dropped before the digit strip
 * so an extension cannot silently become part of the number.
 */
export function normalizeTelDestination(raw) {
  if (!raw || typeof raw !== "string") return null;
  var withoutParams = raw.split(";")[0].trim();
  if (!withoutParams) return null;
  var hasPlus = withoutParams.charAt(0) === "+";
  var digits = withoutParams.replace(/[^0-9]/g, "");
  // 7 is the shortest plausible national number (same floor `normalizePhone`
  // uses server-side); 15 is the E.164 ceiling. Anything outside is a `tel:`
  // href that is not a phone number — a short code, or markup noise.
  if (digits.length < 7 || digits.length > 15) return null;
  return hasPlus ? "+" + digits : digits;
}

/**
 * Trim + lowercase, drop the `?subject=…` tail. A `mailto:` may name several
 * recipients (`mailto:a@x.com,b@x.com`); the FIRST is the one the click is
 * addressed to and the only one worth keying on.
 */
export function normalizeMailtoDestination(raw) {
  if (!raw || typeof raw !== "string") return null;
  var withoutQuery = raw.split("?")[0];
  var first = withoutQuery.split(",")[0];
  var decoded = first;
  try {
    decoded = decodeURIComponent(first);
  } catch (_) {
    // A malformed escape sequence is not a reason to lose the click.
  }
  var trimmed = decoded.trim().toLowerCase();
  if (!trimmed || trimmed.indexOf("@") < 1) return null;
  if (trimmed.length > 254) return null; // RFC 5321 address ceiling
  return trimmed;
}

/**
 * Parse a `tel:` / `mailto:` href into `{ method, destination }`.
 *
 * Returns `null` for every other scheme — including `wa.me` and
 * `whatsapp://`, which route to `whatsapp_click` (#403), not here.
 * A recognised scheme whose payload does not normalise (a `tel:` short code,
 * a `mailto:` with no `@`) also returns null: an event carrying an unusable
 * destination is worse than no event, because it reads as a real contact
 * attempt on the timeline.
 */
export function parseContactTarget(rawHref) {
  if (!rawHref || typeof rawHref !== "string") return null;
  var trimmed = rawHref.trim();
  var lower = trimmed.toLowerCase();

  if (lower.slice(0, 4) === "tel:") {
    var phone = normalizeTelDestination(trimmed.slice(4));
    return phone ? { method: "tel", destination: phone } : null;
  }

  if (lower.slice(0, 7) === "mailto:") {
    var email = normalizeMailtoDestination(trimmed.slice(7));
    return email ? { method: "mailto", destination: email } : null;
  }

  return null;
}
