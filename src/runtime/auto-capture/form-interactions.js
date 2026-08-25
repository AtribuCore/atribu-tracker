// ---------------------------------------------------------------------------
// Auto-capture: form field interactions + abandonment detection
// ---------------------------------------------------------------------------
// Tracks when users start interacting with form fields (focusin, input)
// and fires form_abandoned engagement events when they leave without
// submitting. This enables form abandonment analytics at the field level.
// ---------------------------------------------------------------------------

import { getSessionId } from "../session.js";
import { activeEndpoint, createDispatchPayload } from "../networking.js";

var FORM_FIELD_TAGS = { INPUT: 1, SELECT: 1, TEXTAREA: 1 };
var IGNORE_INPUT_TYPES = { hidden: 1, submit: 1, button: 1, reset: 1, image: 1 };

// Per-form interaction state (keyed by form container ID or index)
var _formStates = {};
var _nextFormIndex = 1;

// Global flag: set to true when lead_submitted fires (from forms.js or ghl-forms.js)
// Checked before firing form_abandoned
export var submittedForms = {};

export function markFormSubmitted(formId) {
  submittedForms[formId || "_default"] = true;
}

function getFormContainer(el) {
  // Walk up to find the nearest form or div-based form container
  var node = el;
  for (var i = 0; i < 10; i++) {
    if (!node || node === document.body) break;
    if (node.tagName === "FORM") return node;
    if (node.id && /form/i.test(node.id)) return node;
    if (node.getAttribute && /form/i.test(node.getAttribute("class") || "")) return node;
    node = node.parentElement;
  }
  // Fallback: return the first ancestor with 2+ inputs
  node = el;
  for (var j = 0; j < 10; j++) {
    if (!node || node === document.body) break;
    var inputs = node.querySelectorAll("input, select, textarea");
    if (inputs.length >= 2) return node;
    node = node.parentElement;
  }
  return null;
}

function getFormId(container) {
  if (!container) return "_default";
  if (container._atribuFormId) return container._atribuFormId;
  var id = container.id || container.getAttribute("name") || "form_" + _nextFormIndex++;
  container._atribuFormId = id;
  return id;
}

function getFieldLabel(el) {
  var type = (el.type || "").toLowerCase();
  var name = el.name || el.id || "";

  // Check for email/phone/name patterns to return semantic labels
  if (type === "email" || /email|correo/i.test(name)) return "email";
  if (type === "tel" || /phone|tel|celular|whatsapp/i.test(name)) return "phone";
  if (/first[_-]?name|fname/i.test(name)) return "first_name";
  if (/last[_-]?name|lname|apellido|surname/i.test(name)) return "last_name";
  // "nombre" = Spanish for full name — maps to "name" for splitting, not "first_name"
  if (/\b(?:full[_-]?)?name\b|\bnombre\b/i.test(name)) return "name";

  return name || type || "unknown";
}

function isEmailField(el) {
  var type = (el.type || "").toLowerCase();
  var name = (el.name || el.id || "").toLowerCase();
  return type === "email" || /email|correo/i.test(name);
}

function getOrCreateState(formId) {
  if (!_formStates[formId]) {
    _formStates[formId] = {
      formId: formId,
      fieldsFocused: [],
      fieldsFilled: [],
      lastFieldFocused: null,
      firstInteractionAt: null,
      emailFieldTouched: false,
      submitted: false,
      hasTrustedFocus: false,
    };
  }
  return _formStates[formId];
}

function addUnique(arr, val) {
  if (arr.indexOf(val) === -1) arr.push(val);
}

function onFocusIn(event) {
  try {
    var el = event.target;
    if (!el || !el.tagName || !FORM_FIELD_TAGS[el.tagName.toUpperCase()]) return;
    var type = (el.type || "").toLowerCase();
    if (IGNORE_INPUT_TYPES[type]) return;

    // Skip auto-focused fields (only track user-initiated focus)
    if (!event.isTrusted) return;

    var container = getFormContainer(el);
    var formId = getFormId(container);
    var state = getOrCreateState(formId);

    if (!state.firstInteractionAt) {
      state.firstInteractionAt = Date.now();
    }
    state.hasTrustedFocus = true;

    var label = getFieldLabel(el);
    addUnique(state.fieldsFocused, label);
    state.lastFieldFocused = label;

    if (isEmailField(el)) {
      state.emailFieldTouched = true;
    }
  } catch (_) {}
}

function onInput(event) {
  try {
    var el = event.target;
    if (!el || !el.tagName || !FORM_FIELD_TAGS[el.tagName.toUpperCase()]) return;
    var type = (el.type || "").toLowerCase();
    if (IGNORE_INPUT_TYPES[type]) return;

    var val = (el.value || "").trim();
    if (!val) return;

    var container = getFormContainer(el);
    var formId = getFormId(container);
    var state = getOrCreateState(formId);
    var label = getFieldLabel(el);
    addUnique(state.fieldsFilled, label);

    // Cache PII values for fallback identity extraction
    cacheFieldValue(el, label);
  } catch (_) {}
}

function buildAbandonmentPayload(state) {
  return {
    engagement_type: "form_abandoned",
    form_id: state.formId,
    fields_focused: state.fieldsFocused.slice(0, 20),
    fields_filled: state.fieldsFilled.slice(0, 20),
    last_field_focused: state.lastFieldFocused,
    interaction_duration_ms: state.firstInteractionAt
      ? Date.now() - state.firstInteractionAt
      : 0,
    email_started: state.emailFieldTouched,
    path: window.location.pathname,
  };
}

var _abandonmentBeaconSent = false;

function sendAbandonmentBeacon() {
  if (_abandonmentBeaconSent) return;
  _abandonmentBeaconSent = true;
  try {
    var keys = Object.keys(_formStates);
    for (var i = 0; i < keys.length; i++) {
      var state = _formStates[keys[i]];
      // Only fire if user actually interacted AND didn't submit
      if (!state.hasTrustedFocus) continue;
      if (state.fieldsFocused.length === 0) continue;
      if (state.submitted || submittedForms[state.formId]) continue;

      var payload = buildAbandonmentPayload(state);
      var trackingEvent = window.atribuTracker._buildEvent(
        "engagement",
        { payload: payload },
        { eventSchema: "atribu.engagement", schemaVersion: 1 }
      );

      if (trackingEvent && navigator && typeof navigator.sendBeacon === "function") {
        var dispatchPayload = createDispatchPayload(trackingEvent);
        if (dispatchPayload) {
          var body = JSON.stringify(dispatchPayload);
          if (body.length < 60 * 1024) {
            var blob = new Blob([body], { type: "application/json" });
            navigator.sendBeacon(activeEndpoint(), blob);
          }
        }
      }
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Cached PII: last-seen email/phone/name values from input events.
// Used as fallback when DOM scraping fails (e.g., GHL clears form fields
// before the Meta bridge fires). Values are NOT persisted to storage.
// ---------------------------------------------------------------------------

var _cachedPII = { email: null, phone: null, firstName: null, lastName: null };

function cacheFieldValue(el, label) {
  var val = (el.value || "").trim();
  if (!val) return;
  if (label === "email" && val.indexOf("@") > 0) {
    _cachedPII.email = val;
  } else if (label === "phone") {
    _cachedPII.phone = val;
  } else if (label === "first_name") {
    _cachedPII.firstName = val;
  } else if (label === "name") {
    // Full name field — split into first/last
    var parts = val.split(/\s+/);
    _cachedPII.firstName = parts[0] || null;
    if (parts.length > 1) {
      _cachedPII.lastName = parts.slice(1).join(" ");
    }
  } else if (label === "last_name") {
    _cachedPII.lastName = val;
  }
}

export function getCachedPII() {
  if (!_cachedPII.email && !_cachedPII.phone) return null;
  var result = {};
  if (_cachedPII.email) result.email = _cachedPII.email;
  if (_cachedPII.phone) result.phone = _cachedPII.phone;
  if (_cachedPII.firstName) result.firstName = _cachedPII.firstName;
  if (_cachedPII.lastName) result.lastName = _cachedPII.lastName;
  return result;
}

export function resetFormInteractionState() {
  _formStates = {};
  submittedForms = {};
  _nextFormIndex = 1;
  _abandonmentBeaconSent = false;
  _cachedPII = { email: null, phone: null, firstName: null, lastName: null };
}

export function initFormInteractionCapture() {
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("input", onInput, true);

  // Fire abandonment on page exit
  window.addEventListener("pagehide", sendAbandonmentBeacon, false);
  window.addEventListener("beforeunload", sendAbandonmentBeacon, false);
  document.addEventListener(
    "visibilitychange",
    function () {
      if (document.visibilityState === "hidden") {
        sendAbandonmentBeacon();
      }
    },
    false
  );
}
