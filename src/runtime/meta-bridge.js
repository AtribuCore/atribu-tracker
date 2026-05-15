// ---------------------------------------------------------------------------
// Meta Pixel bridge: intercept fbq() and mirror to Atribu
// ---------------------------------------------------------------------------

import { FBQ_MIRROR_DEDUP_MS } from "./config.js";
import { genId, isPlainObject } from "./util.js";
import { getCachedPII } from "./auto-capture/form-interactions.js";

var META_EVENT_TO_CANONICAL = {
  Purchase: "purchase",
  Lead: "lead_submitted",
  Schedule: "appointment_booked",
  CompleteRegistration: "registration_completed",
  AddToCart: "add_to_cart",
  InitiateCheckout: "checkout_started",
  AddPaymentInfo: "add_payment_info",
  AddToWishlist: "add_to_wishlist",
  ViewContent: "view_content",
  Search: "search",
  Contact: "contact_requested",
  SubmitApplication: "application_submitted",
  StartTrial: "trial_started",
  Subscribe: "subscription_started",
  Donate: "donation",
  FindLocation: "location_found",
  CustomizeProduct: "product_customized",
  PageView: "page_view",
};

var mirroredFbqEventIds = {};

function rememberFbqEventId(eventId) {
  if (!eventId) return false;
  var now = Date.now();
  var keys = Object.keys(mirroredFbqEventIds);
  for (var i = 0; i < keys.length; i++) {
    if (now - mirroredFbqEventIds[keys[i]] > FBQ_MIRROR_DEDUP_MS) {
      delete mirroredFbqEventIds[keys[i]];
    }
  }
  if (mirroredFbqEventIds[eventId]) return false;
  mirroredFbqEventIds[eventId] = now;
  return true;
}

function shouldInterceptFbq() {
  return window.ATRIBU_INTERCEPT_FBQ !== false;
}

function shouldMirrorMetaPageView() {
  return window.ATRIBU_META_BRIDGE_PAGEVIEW === true;
}

function mapMetaEventName(metaEventName) {
  var mapped = META_EVENT_TO_CANONICAL[metaEventName];
  if (mapped) return mapped;
  return "meta_custom";
}

function readMetaEventId(customData, options) {
  if (
    isPlainObject(options) &&
    typeof options.eventID === "string" &&
    options.eventID.trim()
  ) {
    return options.eventID.trim();
  }
  if (
    isPlainObject(customData) &&
    typeof customData.eventID === "string" &&
    customData.eventID.trim()
  ) {
    return customData.eventID.trim();
  }
  if (
    isPlainObject(customData) &&
    typeof customData.event_id === "string" &&
    customData.event_id.trim()
  ) {
    return customData.event_id.trim();
  }
  return null;
}

function extractFbqCall(args) {
  var method = args[0];
  if (method === "track" || method === "trackCustom") {
    return {
      method: method,
      pixelId: null,
      eventName: typeof args[1] === "string" ? args[1] : "",
      customData: isPlainObject(args[2]) ? args[2] : {},
      optionsIndex: 3,
      options: isPlainObject(args[3]) ? args[3] : {},
    };
  }
  if (method === "trackSingle" || method === "trackSingleCustom") {
    return {
      method: method,
      pixelId: typeof args[1] === "string" ? args[1] : null,
      eventName: typeof args[2] === "string" ? args[2] : "",
      customData: isPlainObject(args[3]) ? args[3] : {},
      optionsIndex: 4,
      options: isPlainObject(args[4]) ? args[4] : {},
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// DOM scraping for identity extraction on lead/application events
// ---------------------------------------------------------------------------

var PII_IDENTITY_EVENTS = {
  application_submitted: true,
  lead_submitted: true,
  contact_requested: true,
  registration_completed: true,
};

var DOM_EMAIL_SELECTORS =
  'input[type="email"], input[name*="email" i], input[name*="correo" i], input[autocomplete="email"]';
var DOM_PHONE_SELECTORS =
  'input[type="tel"], input[name*="phone" i], input[name*="tel" i], input[name*="celular" i], input[autocomplete="tel"]';
var DOM_NAME_SELECTORS =
  'input[name*="name" i], input[name*="nombre" i], input[autocomplete="name"], input[autocomplete="given-name"]';

function scrapePageForIdentity(canonicalName) {
  if (!PII_IDENTITY_EVENTS[canonicalName]) return;
  try {
    var email = null;
    var phone = null;
    var firstName = null;

    // Try GHL-specific container first
    var container = document.getElementById("_builder-form") || document;

    var emailEls = container.querySelectorAll(DOM_EMAIL_SELECTORS);
    for (var i = 0; i < emailEls.length; i++) {
      var val = (emailEls[i].value || "").trim();
      if (val && val.indexOf("@") !== -1) { email = val; break; }
    }

    var phoneEls = container.querySelectorAll(DOM_PHONE_SELECTORS);
    for (var j = 0; j < phoneEls.length; j++) {
      var pval = (phoneEls[j].value || "").trim();
      if (pval) { phone = pval; break; }
    }

    var nameEls = container.querySelectorAll(DOM_NAME_SELECTORS);
    for (var k = 0; k < nameEls.length; k++) {
      var nval = (nameEls[k].value || "").trim();
      if (nval) { firstName = nval; break; }
    }

    if (email || phone) {
      var contact = {};
      if (email) contact.email = email;
      if (phone) contact.phone = phone;
      if (firstName) contact.firstName = firstName;
      window.atribuTracker.identify(contact);
      return;
    }

    // Fallback: use cached PII from form-interactions (handles GHL clearing
    // form fields before fbq fires)
    var cached = getCachedPII();
    if (cached) {
      window.atribuTracker.identify(cached);
    }
  } catch (_) {}
}

function mirrorFbqCall(call, eventId) {
  if (!call || !eventId) return;
  var canonicalName = mapMetaEventName(call.eventName);
  if (canonicalName === "page_view" && !shouldMirrorMetaPageView()) return;
  if (!rememberFbqEventId(eventId)) return;

  // Scrape page for identity data when lead/application events fire
  scrapePageForIdentity(canonicalName);

  // Also check customData for PII (some integrations pass it)
  if (PII_IDENTITY_EVENTS[canonicalName] && call.customData) {
    var cd = call.customData;
    var cdEmail = cd.email || cd.em || cd.user_email;
    var cdPhone = cd.phone || cd.ph || cd.user_phone;
    if (cdEmail || cdPhone) {
      var cdContact = {};
      if (cdEmail) cdContact.email = String(cdEmail).trim();
      if (cdPhone) cdContact.phone = String(cdPhone).trim();
      if (cd.firstName || cd.first_name) cdContact.firstName = String(cd.firstName || cd.first_name).trim();
      if (cd.lastName || cd.last_name) cdContact.lastName = String(cd.lastName || cd.last_name).trim();
      window.atribuTracker.identify(cdContact);
    }
  }

  var valueAmount =
    typeof call.customData.value === "number"
      ? call.customData.value
      : typeof call.customData.value === "string" &&
          call.customData.value.trim()
        ? Number(call.customData.value)
        : undefined;
  if (typeof valueAmount === "number" && !isFinite(valueAmount))
    valueAmount = undefined;

  window.atribuTracker.track(canonicalName, {
    eventId: eventId,
    sourcePlatform: "meta_pixel_bridge",
    valueAmount: valueAmount,
    currency:
      typeof call.customData.currency === "string" &&
      call.customData.currency.trim()
        ? call.customData.currency.trim().toUpperCase()
        : undefined,
    payload: {
      title: document.title,
      path: window.location.pathname,
      meta_method: call.method,
      meta_event_name: call.eventName,
      meta_pixel_id: call.pixelId || undefined,
      meta_custom_data: call.customData || {},
      meta_event_id_injected: true,
    },
  });
}

function copyFunctionProperties(fromFn, toFn) {
  try {
    for (var key in fromFn) {
      if (!Object.prototype.hasOwnProperty.call(fromFn, key)) continue;
      try {
        toFn[key] = fromFn[key];
      } catch (_) {}
    }
  } catch (_) {}
}

function wrapFbq(fn) {
  if (typeof fn !== "function") return fn;
  if (fn.__ATRIBU_FBQ_WRAPPED__) return fn;

  var wrapped = function () {
    var args = Array.prototype.slice.call(arguments);
    var call = extractFbqCall(args);

    if (call && shouldInterceptFbq()) {
      var eventId =
        readMetaEventId(call.customData, call.options) || genId("fbq");
      if (!isPlainObject(call.options)) call.options = {};
      call.options.eventID = eventId;
      args[call.optionsIndex] = call.options;
      mirrorFbqCall(call, eventId);
    }

    return fn.apply(this, args);
  };

  wrapped.__ATRIBU_FBQ_WRAPPED__ = true;
  wrapped.__ATRIBU_FBQ_ORIGINAL__ = fn;
  copyFunctionProperties(fn, wrapped);
  return wrapped;
}

function installFbqInterceptor() {
  if (!shouldInterceptFbq()) return;
  if (typeof window.fbq !== "function") return;
  if (window.fbq.__ATRIBU_FBQ_WRAPPED__) return;
  try {
    window.fbq = wrapFbq(window.fbq);
  } catch (_) {}
}

export function observeFbqAssignment() {
  if (!shouldInterceptFbq()) return;

  var fbqValue = window.fbq;
  var setterInstalled = false;

  try {
    Object.defineProperty(window, "fbq", {
      configurable: true,
      enumerable: true,
      get: function () {
        return fbqValue;
      },
      set: function (next) {
        fbqValue = wrapFbq(next);
      },
    });
    fbqValue = wrapFbq(fbqValue);
    setterInstalled = true;
  } catch (_) {
    setterInstalled = false;
  }

  if (!setterInstalled) {
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;
      installFbqInterceptor();
      if (
        attempts > 120 ||
        (window.fbq && window.fbq.__ATRIBU_FBQ_WRAPPED__)
      ) {
        clearInterval(poll);
      }
    }, 500);
  }
}

export function initMetaBridge() {
  observeFbqAssignment();
  installFbqInterceptor();
}
