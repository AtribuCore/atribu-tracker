// ---------------------------------------------------------------------------
// Auto-capture: early identity signal (phone/email at input blur, pre-submit)
// ---------------------------------------------------------------------------
// #413 (Vambe parity, policy amendment on #397 2026-08-25: "full Vambe-parity
// capture, always-on default, with kill-switch + disclosure"). Vambe captures
// phone numbers typed into form inputs at BLUR time, before submit — their
// only edit-proof WhatsApp join tier: a visitor types a phone, abandons the
// form, then messages the dealer on WhatsApp from that same number. forms.js
// only captures identity at SUBMIT (identify() -> resolveCustomerProfile), so
// typed-but-abandoned identity was lost. This module closes exactly that gap.
//
// Sent to a DEDICATED endpoint (/api/tracking/identity-signal), NEVER
// through track()/post() (the events-pipeline senders in networking.js):
// this signal must not create touches/sessions/facts, and must never resolve
// or create a customer_profiles row (the orphan-profile rule,
// .claude/rules/crm-ingestion.md — see the migration + route for the full
// reasoning). It is intentionally NOT wired into forms.js/identify(); a
// separate standalone store (early_identity_signals) is the whole point.
//
// Two independent kill switches, both must allow capture:
//   1. Client: window.ATRIBU_DISABLE_EARLY_IDENTITY === true disables this
//      module entirely (checked at init AND on every blur, so a merchant
//      script that flips the flag mid-session still stops new capture).
//   2. Server: a per-profile setting (profile_attribution_settings.
//      early_identity_capture_enabled), enforced by the endpoint itself. This
//      module has no visibility into that setting — it always attempts the
//      send when the client switch allows it, and the server rejects (no
//      persisted row) when the profile has opted out.
// ---------------------------------------------------------------------------

import { getIdentitySignalEndpoint, getTrackingKey } from "../config.js";
import { anonymousId, getSessionId } from "../session.js";

var HIDDEN_TYPE = "hidden";

// Field name/attribute heuristics — same bilingual pattern as forms.js
// (EMAIL_NAME_RE / PHONE_NAME_RE). Duplicated rather than imported: this
// module fires on a much hotter event (every blur, not every submit) and
// stays independently reviewable/removable as a result.
var EMAIL_NAME_RE = /email|correo|e-?mail/i;
var PHONE_NAME_RE = /phone|tel(?:ephone)?|celular|m[oó]vil|whatsapp|n[uú]mero/i;
var EMAIL_VALUE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// sessionStorage-backed dedupe: don't re-send a value already reported this
// browser tab session. Purely a traffic-reduction optimization — the server
// writer (record_early_identity_signal) is a monotonic upsert keyed on
// (profile, id_type, id_value, anonymous_id), so a duplicate send is always
// safe, just wasteful. sessionStorage (not localStorage): naturally scoped
// to "this tab, until closed", a reasonable proxy for "this visit" without
// coordinating with the tracker's own 30-min session_id rotation.
var DEDUPE_KEY = "atribu_early_identity_sent";
var DEDUPE_MAX_ENTRIES = 50;

function readDedupeSet() {
  try {
    var raw = window.sessionStorage.getItem(DEDUPE_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function hasBeenSent(key) {
  return readDedupeSet().indexOf(key) !== -1;
}

function markSent(key) {
  try {
    var entries = readDedupeSet();
    if (entries.indexOf(key) !== -1) return;
    entries.push(key);
    if (entries.length > DEDUPE_MAX_ENTRIES) {
      entries = entries.slice(entries.length - DEDUPE_MAX_ENTRIES);
    }
    window.sessionStorage.setItem(DEDUPE_KEY, JSON.stringify(entries));
  } catch (_) {
    // sessionStorage unavailable (private mode, quota) — degrade to
    // no-dedupe rather than failing capture.
  }
}

function isVisible(el) {
  if (!el || !el.offsetParent) return false;
  var style = window.getComputedStyle ? window.getComputedStyle(el) : el.style;
  return style.display !== "none" && style.visibility !== "hidden";
}

function getFieldHints(el) {
  var name = (el.name || "").toLowerCase();
  var type = (el.type || "").toLowerCase();
  var autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
  var placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
  var ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  return name + " " + type + " " + autocomplete + " " + placeholder + " " + ariaLabel;
}

function classifyField(el, type) {
  if (type === "email") return "email";
  if (type === "tel") return "phone";
  var hints = getFieldHints(el);
  if (EMAIL_NAME_RE.test(hints)) return "email";
  if (PHONE_NAME_RE.test(hints)) return "phone";
  return null;
}

// ---------------------------------------------------------------------------
// Normalization — a LOOSE client-side plausibility check only, to avoid a
// network call for an obviously-junk value. The value of record is
// server-normalized (normalizeEmail/normalizePhone) at write time; do not
// treat this client-side pass as canonical.
// ---------------------------------------------------------------------------

function looseNormalizeEmail(raw) {
  var trimmed = String(raw || "").trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  return EMAIL_VALUE_RE.test(trimmed) ? trimmed : null;
}

function looseNormalizePhone(raw) {
  var trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  var digits = trimmed.replace(/[^0-9+]/g, "");
  var digitCount = digits.replace(/\+/g, "").length;
  if (digitCount < 7 || digitCount > 15) return null;
  return digits;
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

function sendSignal(idType, idValue) {
  var dedupeKey = idType + ":" + idValue;
  if (hasBeenSent(dedupeKey)) return;

  var trackingKey = getTrackingKey();
  if (!trackingKey) return;

  markSent(dedupeKey);

  var sessionId = null;
  try {
    sessionId = getSessionId();
  } catch (_) {
    // session.js is defensive already, but never let a session lookup
    // failure block the signal.
  }

  var payload = {
    trackingKey: trackingKey,
    anonymousId: anonymousId,
    sessionId: sessionId,
    idType: idType,
    idValue: idValue,
    pageUrl: window.location.href,
    capturedAt: new Date().toISOString(),
  };

  var endpoint = getIdentitySignalEndpoint();
  var body = JSON.stringify(payload);

  try {
    if (navigator && typeof navigator.sendBeacon === "function") {
      var ok = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
  } catch (_) {}

  // Fallback (no sendBeacon support, or it rejected the send): best-effort
  // fetch, fire-and-forget. Deliberately no outbox/retry — losing one blur
  // event is not a correctness issue (the same value is very likely
  // re-captured on the next blur, or at submit via forms.js).
  try {
    if (typeof fetch === "function") {
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () {});
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Listener
// ---------------------------------------------------------------------------

function onBlur(event) {
  try {
    if (window.ATRIBU_DISABLE_EARLY_IDENTITY === true) return;

    var el = event.target;
    if (!el || !el.tagName) return;
    if (el.tagName.toUpperCase() !== "INPUT") return;

    var type = (el.type || "").toLowerCase();
    if (type === HIDDEN_TYPE) return;
    if (!isVisible(el)) return;

    var val = (el.value || "").trim();
    if (!val) return;

    var fieldType = classifyField(el, type);
    if (!fieldType) return;

    var normalized =
      fieldType === "email" ? looseNormalizeEmail(val) : looseNormalizePhone(val);
    if (!normalized) return;

    sendSignal(fieldType, normalized);
  } catch (_) {}
}

export function initEarlyIdentityCapture() {
  if (window.ATRIBU_DISABLE_EARLY_IDENTITY === true) return;
  // Capture-phase + delegated, same idiom as forms.js's submit listener:
  // catches blur on inputs added dynamically (SPA-rendered forms, GHL
  // funnels) without per-form wiring. `blur` does not bubble, so this MUST
  // be capture-phase (`true`) — a bubble-phase document listener would
  // never observe it.
  document.addEventListener("blur", onBlur, true);
}
