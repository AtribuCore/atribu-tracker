// ---------------------------------------------------------------------------
// Auto-capture: form submissions → identify + lead_submitted
// ---------------------------------------------------------------------------
// Extracts email/phone/name from form fields and calls identify() before
// firing lead_submitted. Supports standard <form> elements AND div-based
// form containers (GHL, Typeform, etc.) with fuzzy field matching.
// ---------------------------------------------------------------------------

import { markFormSubmitted } from "./form-interactions.js";

var EMAIL_TYPE = "email";
var TEL_TYPE = "tel";
var HIDDEN_TYPE = "hidden";

// Field name patterns (English + Spanish)
var EMAIL_NAME_RE = /email|correo|e-?mail/i;
var PHONE_NAME_RE = /phone|tel(?:ephone)?|celular|m[oó]vil|whatsapp|n[uú]mero/i;
// No anchors: matchesAnyHint tests a concatenated hint string, not individual tokens
var NAME_NAME_RE = /\b(?:full[_-]?)?name\b|\bnombre\b/i;
// "nombre" is NOT here — it's in NAME_NAME_RE (nombre = Spanish for full name)
var FIRST_NAME_RE = /first[_-]?name|given[_-]?name|fname/i;
var LAST_NAME_RE = /last[_-]?name|family[_-]?name|lname|surname|apellido/i;

// Submit button text patterns (bilingual) for non-form container detection
var SUBMIT_TEXT_RE =
  /submit|enviar|send|register|registr|sign.?up|get.?started|comenzar|apply|solicitar|book|reservar|agendar|contact|download|descargar|subscribe|suscr/i;

function isVisible(el) {
  if (!el || !el.offsetParent) return false;
  var style = window.getComputedStyle ? window.getComputedStyle(el) : el.style;
  return style.display !== "none" && style.visibility !== "hidden";
}

// ---------------------------------------------------------------------------
// Fuzzy field matching: checks name, type, autocomplete, label, placeholder,
// aria-label, and parent label text
// ---------------------------------------------------------------------------

function getFieldHints(el) {
  var hints = [];
  var name = (el.name || "").toLowerCase();
  var type = (el.type || "").toLowerCase();
  var autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
  var placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
  var ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();

  if (name) hints.push(name);
  if (type) hints.push(type);
  if (autocomplete) hints.push(autocomplete);
  if (placeholder) hints.push(placeholder);
  if (ariaLabel) hints.push(ariaLabel);

  // Check associated <label> element
  try {
    if (el.id) {
      var label = document.querySelector('label[for="' + el.id + '"]');
      if (label) {
        var labelText = (label.textContent || "").trim().toLowerCase();
        if (labelText) hints.push(labelText);
      }
    }
    // Check parent label
    var parentLabel = el.closest ? el.closest("label") : null;
    if (parentLabel) {
      var parentText = (parentLabel.textContent || "").trim().toLowerCase();
      if (parentText) hints.push(parentText);
    }
  } catch (_) {}

  return hints.join(" ");
}

function matchesAnyHint(hintString, re) {
  return re.test(hintString);
}

export function extractFormPII(container) {
  var email = null;
  var phone = null;
  var firstName = null;
  var lastName = null;
  var fullName = null;

  // Use querySelectorAll so it works on both <form> and <div> containers
  var elements = container.querySelectorAll
    ? container.querySelectorAll("input, select, textarea")
    : container.elements;
  if (!elements) return null;

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    if (!el || !el.tagName) continue;
    var tag = el.tagName.toUpperCase();
    if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") continue;

    var type = (el.type || "").toLowerCase();
    if (type === HIDDEN_TYPE) continue;
    if (!isVisible(el)) continue;

    var val = (el.value || "").trim();
    if (!val) continue;

    var hints = getFieldHints(el);

    // Email: type="email", or any hint matches email pattern
    if (!email) {
      if (type === EMAIL_TYPE || matchesAnyHint(hints, EMAIL_NAME_RE)) {
        var atIdx = val.indexOf("@");
        if (atIdx > 0 && atIdx < val.length - 1) email = val;
      }
    }

    // Phone: type="tel", or any hint matches phone pattern
    if (!phone) {
      if (type === TEL_TYPE || matchesAnyHint(hints, PHONE_NAME_RE)) {
        phone = val;
      }
    }

    // First name
    if (!firstName) {
      if (
        matchesAnyHint(hints, FIRST_NAME_RE) ||
        (el.getAttribute("autocomplete") || "").toLowerCase() === "given-name"
      ) {
        firstName = val;
      }
    }

    // Last name
    if (!lastName) {
      if (
        matchesAnyHint(hints, LAST_NAME_RE) ||
        (el.getAttribute("autocomplete") || "").toLowerCase() === "family-name"
      ) {
        lastName = val;
      }
    }

    // Full name (split later if no first/last found)
    if (!fullName) {
      if (
        matchesAnyHint(hints, NAME_NAME_RE) ||
        (el.getAttribute("autocomplete") || "").toLowerCase() === "name"
      ) {
        fullName = val;
      }
    }
  }

  // Split full name into first/last if specific fields weren't found
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

// ---------------------------------------------------------------------------
// Standard <form> submit handler
// ---------------------------------------------------------------------------

function onFormSubmit(event) {
  try {
    var form = event.target;
    if (!form || form.tagName !== "FORM") return;
    var formId = form.getAttribute("id") || form.getAttribute("name") || "form";

    var contact = extractFormPII(form);
    if (contact) {
      window.atribuTracker.identify(contact);
    }

    markFormSubmitted(formId);

    window.atribuTracker.track("lead_submitted", {
      payload: {
        form_id: String(formId),
        detection_method: "form_submit",
        path: window.location.pathname,
        email_captured: !!contact,
      },
    });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Non-form container: detect submit-like button clicks outside <form>
// ---------------------------------------------------------------------------

function findFormContainer(el) {
  var node = el;
  for (var i = 0; i < 10; i++) {
    if (!node || node === document.body) return null;
    // Skip if inside a <form> — the regular submit handler will catch it
    if (node.tagName === "FORM") return null;
    // Look for containers with multiple inputs (likely a form)
    var inputs = node.querySelectorAll
      ? node.querySelectorAll("input, select, textarea")
      : [];
    if (inputs.length >= 2) return node;
    node = node.parentElement;
  }
  return null;
}

function isSubmitButton(el) {
  if (!el) return false;
  var tag = (el.tagName || "").toUpperCase();

  // Standard submit buttons
  if (tag === "INPUT" && (el.type || "").toLowerCase() === "submit") return true;

  // Buttons with submit-like text
  if (tag === "BUTTON" || el.getAttribute("role") === "button") {
    var text = (el.textContent || el.innerText || "").trim();
    return SUBMIT_TEXT_RE.test(text);
  }

  return false;
}

var _lastNonFormSubmitTime = 0;

function onDocumentClick(event) {
  try {
    // Walk up to find a submit-like button
    var el = event.target;
    var button = null;
    for (var i = 0; i < 5; i++) {
      if (!el) break;
      if (isSubmitButton(el)) { button = el; break; }
      el = el.parentElement;
    }
    if (!button) return;

    // Check if it's inside a <form> — if so, let the submit handler deal with it
    if (button.closest && button.closest("form")) return;

    // Dedup: 1s cooldown
    var now = Date.now();
    if (now - _lastNonFormSubmitTime < 1000) return;
    _lastNonFormSubmitTime = now;

    var container = findFormContainer(button);
    if (!container) return;

    var formId = container.id || container.getAttribute("name") || "div_form";
    var contact = extractFormPII(container);
    if (contact) {
      window.atribuTracker.identify(contact);
    }

    markFormSubmitted(formId);

    window.atribuTracker.track("lead_submitted", {
      payload: {
        form_id: String(formId),
        detection_method: "button_click",
        path: window.location.pathname,
        email_captured: !!contact,
      },
    });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initFormCapture() {
  // Standard <form> submit events
  document.addEventListener("submit", onFormSubmit, true);

  // Non-form container submit button clicks
  document.addEventListener("click", onDocumentClick, true);
}
