// ---------------------------------------------------------------------------
// Auto-capture: GHL (GoHighLevel) form submissions via fetch() interception
// ---------------------------------------------------------------------------
// GHL funnel pages render forms as <div id="_builder-form"> with div-wrapped
// inputs — no <form> element exists. Submission happens via fetch() POST to
// GHL's /forms/submit endpoint. This module wraps window.fetch to intercept
// those requests, extract PII, call identify(), and fire lead_submitted.
// ---------------------------------------------------------------------------

import { getSessionId } from "../session.js";
import { markFormSubmitted } from "./form-interactions.js";

// URL patterns that indicate a form submission to a known provider.
// Only match specific /forms/submit endpoints — broader domain patterns
// cause false positives from GHL analytics/tracking/session API calls.
var FORM_SUBMIT_PATTERNS = [
  /leadconnectorhq\.com\/forms\/submit/i,
  /msgsndr\.com\/forms\/submit/i,
];

var EMAIL_RE = /email/i;
var PHONE_RE = /phone|tel(?:ephone)?|celular|m[oó]vil|whatsapp/i;
var FIRST_NAME_RE = /first[_-]?name|given[_-]?name|fname/i;
var LAST_NAME_RE = /last[_-]?name|family[_-]?name|lname|surname|apellido/i;
// "nombre" = Spanish for full name — triggers splitting, not first-name assignment
var FULL_NAME_RE = /^(?:full[_-]?)?name$|^nombre$/i;

// Dedup: track submissions per session to avoid double-firing
var _firedThisSession = {};

function isGhlFormUrl(url) {
  if (typeof url !== "string") return false;
  for (var i = 0; i < FORM_SUBMIT_PATTERNS.length; i++) {
    if (FORM_SUBMIT_PATTERNS[i].test(url)) return true;
  }
  return false;
}

function extractPiiFromPayload(body) {
  if (!body || typeof body !== "object") return null;

  var email = null;
  var phone = null;
  var firstName = null;
  var lastName = null;
  var fullName = null;

  var keys = Object.keys(body);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var val = body[key];
    if (typeof val !== "string" || !val.trim()) continue;
    val = val.trim();
    var keyLower = key.toLowerCase();

    var atIdx = val.indexOf("@");
    if (!email && EMAIL_RE.test(keyLower) && atIdx > 0 && atIdx < val.length - 1) {
      email = val;
    }
    if (!phone && PHONE_RE.test(keyLower)) {
      phone = val;
    }
    if (!firstName && FIRST_NAME_RE.test(keyLower)) {
      firstName = val;
    }
    if (!lastName && LAST_NAME_RE.test(keyLower)) {
      lastName = val;
    }
    if (!fullName && FULL_NAME_RE.test(keyLower)) {
      fullName = val;
    }
  }

  // Split full name if specific fields weren't found
  if (fullName && !firstName) {
    var parts = fullName.split(/\s+/);
    firstName = parts[0] || null;
    if (!lastName && parts.length > 1) {
      lastName = parts.slice(1).join(" ");
    }
  }

  if (!email && !phone) return null;

  var contact = {};
  if (email) contact.email = email;
  if (phone) contact.phone = phone;
  if (firstName) contact.firstName = firstName;
  if (lastName) contact.lastName = lastName;
  return contact;
}

function handleFormSubmission(url, body) {
  try {
    var sessionId = getSessionId();
    var dedupKey = sessionId + ":" + url;
    if (_firedThisSession[dedupKey]) return;
    _firedThisSession[dedupKey] = true;

    var contact = extractPiiFromPayload(body);
    if (contact) {
      window.atribuTracker.identify(contact);
    }

    var formId = body.formId || body.form_id || "ghl_form";
    markFormSubmitted(formId);

    window.atribuTracker.track("lead_submitted", {
      payload: {
        form_id: formId,
        form_provider: "gohighlevel",
        detection_method: "fetch_interception",
        path: window.location.pathname,
        email_captured: !!(contact && contact.email),
      },
    });
  } catch (_) {}
}

function getRequestUrl(input) {
  if (typeof input === "string") return input;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  if (input && typeof input.toString === "function") return input.toString();
  return "";
}

function tryParseBody(body) {
  if (!body) return null;
  // String body (most common for JSON fetch)
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_) {
      return null;
    }
  }
  // FormData — convert to object
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    var obj = {};
    body.forEach(function (value, key) {
      if (typeof value === "string") obj[key] = value;
    });
    return obj;
  }
  // URLSearchParams
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    var result = {};
    body.forEach(function (value, key) {
      result[key] = value;
    });
    return result;
  }
  return null;
}

export function initGhlFormCapture() {
  if (typeof window.fetch !== "function") return;

  var originalFetch = window.fetch;

  window.fetch = function () {
    var args = arguments;
    var input = args[0];
    var init = args[1];

    try {
      var url = getRequestUrl(input);
      if (isGhlFormUrl(url)) {
        // Extract body from init options or Request object
        var rawBody = null;
        if (init && init.body) {
          rawBody = init.body;
        } else if (typeof Request !== "undefined" && input instanceof Request) {
          // Cannot clone already-consumed body; best-effort via init
          rawBody = init && init.body ? init.body : null;
        }

        var parsed = tryParseBody(rawBody);
        if (parsed) {
          handleFormSubmission(url, parsed);
        }
      }
    } catch (_) {}

    return originalFetch.apply(this, args);
  };
}
