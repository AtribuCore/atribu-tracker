// ---------------------------------------------------------------------------
// Core: buildTrackingEvent + track function
// ---------------------------------------------------------------------------

import { safeUrl, isPlainObject, genId } from "./util.js";
import { anonymousId, consumeEventContext } from "./session.js";
import {
  touchContext,
  collectUtmFromLocation,
  collectClickIdsFromLocation,
  stripVerifyParam,
} from "./utm.js";
import { getFbp, getFbc, getGaClientId, getGaSessionId } from "./cookies.js";
import { getConsent } from "./consent.js";
import { post } from "./networking.js";
import { shouldSuppressEvent, getAiAgentPayload } from "./filtering.js";

// ---------------------------------------------------------------------------
// Custom properties injection
// ---------------------------------------------------------------------------

function resolveCustomProperties() {
  var custom = window.ATRIBU_CUSTOM_PROPERTIES;
  if (!custom) return null;
  try {
    if (typeof custom === "function") {
      var result = custom({
        url: window.location.href,
        path: window.location.pathname,
        referrer: document.referrer,
        title: document.title,
      });
      return isPlainObject(result) ? result : null;
    }
    if (isPlainObject(custom)) return custom;
  } catch {}
  return null;
}

// ---------------------------------------------------------------------------
// transformRequest middleware
// ---------------------------------------------------------------------------

function applyTransform(event) {
  var fn = window.ATRIBU_TRANSFORM_REQUEST;
  if (typeof fn !== "function") return event;
  try {
    var result = fn(event);
    if (result === null || result === false) return null; // Suppressed
    if (typeof result === "object") return result;
    return event;
  } catch {
    return event; // On error, send unchanged
  }
}

var DEFAULT_EVENT_SCHEMAS = {
  page_view: "atribu.page_view",
  session_start: "atribu.session_start",
  identify: "atribu.identify",
  outbound_link_click: "atribu.outbound_link_click",
  lead_submitted: "atribu.lead_submitted",
  registration_completed: "atribu.registration_completed",
  add_to_cart: "atribu.add_to_cart",
  add_payment_info: "atribu.add_payment_info",
  add_to_wishlist: "atribu.add_to_wishlist",
  checkout_started: "atribu.checkout_started",
  purchase: "atribu.purchase",
  view_content: "atribu.view_content",
  search: "atribu.search",
  subscription_started: "atribu.subscription_started",
  subscription_renewed: "atribu.subscription_renewed",
  refund_issued: "atribu.refund_issued",
  appointment_booked: "atribu.appointment_booked",
  contact_requested: "atribu.contact_requested",
  application_submitted: "atribu.application_submitted",
  trial_started: "atribu.trial_started",
  donation: "atribu.donation",
  location_found: "atribu.location_found",
  product_customized: "atribu.product_customized",
  meta_custom: "atribu.meta_custom",
  opportunity_stage_changed: "atribu.opportunity_stage_changed",
  closed_won: "atribu.closed_won",
  engagement: "atribu.engagement",
  file_download: "atribu.file_download",
  whatsapp_click: "atribu.whatsapp_click",
  contact_click: "atribu.contact_click",
  custom_event: "atribu.custom_event",
};

function getEventSchema(eventName) {
  return DEFAULT_EVENT_SCHEMAS[eventName] || "atribu.custom_event";
}

function normalizeContextEntities() {
  var entities = [];
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (!Array.isArray(value)) continue;
    for (var j = 0; j < value.length; j++) {
      if (isPlainObject(value[j])) {
        entities.push(value[j]);
      }
    }
  }
  return entities;
}

// ---------------------------------------------------------------------------
// Build tracking event
// ---------------------------------------------------------------------------

export function buildTrackingEvent(eventName, data, options) {
  var context = touchContext();
  var fbp = getFbp();
  var fbc = getFbc();
  var gaClientId = getGaClientId();
  var gaSessionId = getGaSessionId();
  var consent = getConsent();
  // #410 — atb_verify (the install-verification nonce) is our own plumbing,
  // never a marketing/attribution signal. Strip it before it becomes
  // events_enriched.page_url / sessions.entry_page / touches.landing_page_path.
  var pageUrl = safeUrl(stripVerifyParam(window.location.href));
  var path = window.location.pathname;
  var host = window.location.hostname;
  var nowIso = new Date().toISOString();
  var eventId = genId("evt");
  var sessionContext = consumeEventContext(eventId, nowIso);
  var requestedSchema =
    options && typeof options.eventSchema === "string" && options.eventSchema.trim()
      ? options.eventSchema.trim()
      : data && typeof data.eventSchema === "string" && data.eventSchema.trim()
        ? data.eventSchema.trim()
        : getEventSchema(eventName);
  var requestedSchemaVersion =
    options && typeof options.schemaVersion === "number" && options.schemaVersion > 0
      ? options.schemaVersion
      : data && typeof data.schemaVersion === "number" && data.schemaVersion > 0
        ? data.schemaVersion
        : 1;
  var contextEntities = normalizeContextEntities(
    data && data.contextEntities,
    options && options.contextEntities
  );

  var base = {
    eventId: eventId,
    eventName: eventName,
    eventSchema: requestedSchema,
    schemaVersion: requestedSchemaVersion,
    eventTimeClient: nowIso,
    eventTimeServer: nowIso,
    anonymousId: anonymousId,
    userId: window.ATRIBU_USER_ID || undefined,
    sessionId: sessionContext.sessionId,
    appId:
      window.ATRIBU_APP_ID ||
      window.ATRIBU_WEBSITE_ID ||
      window.ATRIBU_TRACKING_KEY ||
      undefined,
    websiteId: window.ATRIBU_WEBSITE_ID || window.ATRIBU_TRACKING_KEY || undefined,
    pixelId: window.ATRIBU_PIXEL_ID || window.ATRIBU_TRACKING_KEY || undefined,
    dedupeKey: eventId,
    previousSessionId: sessionContext.previousSessionId || undefined,
    sessionIndex: sessionContext.sessionIndex,
    eventIndex: sessionContext.eventIndex,
    firstEventId: sessionContext.firstEventId || undefined,
    firstEventTimestamp: sessionContext.firstEventTimestamp || undefined,
    pageViewId: sessionContext.pageViewId,
    sourceType:
      options && typeof options.sourceType === "string" && options.sourceType.trim()
        ? options.sourceType.trim()
        : "web",
    pageUrl: pageUrl,
    path: path,
    host: host,
    referrer: safeUrl(document.referrer),
    locale:
      typeof navigator !== "undefined" && typeof navigator.language === "string"
        ? navigator.language
        : undefined,
    timezone:
      typeof Intl !== "undefined" &&
      Intl.DateTimeFormat &&
      Intl.DateTimeFormat().resolvedOptions
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined,
    utm: context.latestTouch
      ? context.latestTouch.utm
      : collectUtmFromLocation(),
    firstTouchUtm: context.firstTouch ? context.firstTouch.utm : undefined,
    clickIds: context.latestTouch
      ? context.latestTouch.clickIds
      : collectClickIdsFromLocation(),
    firstTouchClickIds: context.firstTouch
      ? context.firstTouch.clickIds
      : undefined,
    fbp: fbp || undefined,
    fbc: fbc || undefined,
    gaClientId: gaClientId || undefined,
    gaSessionId: gaSessionId || undefined,
    consent: consent || undefined,
    sourcePlatform:
      options &&
      typeof options.sourcePlatform === "string" &&
      options.sourcePlatform.trim()
        ? options.sourcePlatform.trim()
        : "web",
    contextEntities: contextEntities,
    payload: {
      title: document.title,
      path: path,
    },
  };
  var payload = Object.assign({}, base, data || {});
  if (data && Object.prototype.hasOwnProperty.call(data, "payload")) {
    if (isPlainObject(base.payload) && isPlainObject(data.payload)) {
      payload.payload = Object.assign({}, base.payload, data.payload);
    } else {
      payload.payload = data.payload;
    }
  }

  // Inject custom properties into payload
  var customProps = resolveCustomProperties();
  if (customProps && isPlainObject(payload.payload)) {
    payload.payload = Object.assign({}, payload.payload, customProps);
  }

  // Enrich with AI agent classification if detected
  var aiPayload = getAiAgentPayload();
  if (aiPayload && isPlainObject(payload.payload)) {
    payload.payload = Object.assign({}, payload.payload, aiPayload);
  }

  return payload;
}

// ---------------------------------------------------------------------------
// track() — the core dispatch function
// ---------------------------------------------------------------------------

export function track(eventName, data, options) {
  // Per-event suppression (developer exclusion, page exclusion)
  if (shouldSuppressEvent()) {
    if (options && typeof options.callback === "function") {
      options.callback(new Error("Event suppressed"));
    }
    return Promise.resolve(false);
  }

  var event = buildTrackingEvent(eventName, data, options);

  // Apply transformRequest middleware
  event = applyTransform(event);
  if (!event) {
    if (options && typeof options.callback === "function") {
      options.callback(new Error("Event suppressed by transform"));
    }
    return Promise.resolve(false);
  }

  // Pass callback through to networking layer (in-memory only, not persisted)
  return post(event, options && options.callback ? options.callback : null);
}
