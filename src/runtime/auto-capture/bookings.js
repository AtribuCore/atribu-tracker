// ---------------------------------------------------------------------------
// Auto-capture: scheduling widget bookings → appointment_booked
// Supported: GoHighLevel, Calendly, Cal.com, custom patterns
// ---------------------------------------------------------------------------

import { getSessionId } from "../session.js";

var _bookingFiredSession = null;

function fireBookingOnce(widget, detail, contactInfo) {
  var sid = getSessionId();
  if (_bookingFiredSession === sid) return;
  _bookingFiredSession = sid;

  if (
    contactInfo &&
    (contactInfo.email ||
      contactInfo.firstName ||
      contactInfo.lastName ||
      contactInfo.phone)
  ) {
    window.atribuTracker.identify(contactInfo);
  }

  window.atribuTracker.track("appointment_booked", {
    payload: Object.assign(
      {
        widget: widget,
        path: window.location.pathname,
      },
      detail || {}
    ),
  });
}

function parseGHLBooking(data) {
  if (!Array.isArray(data) || data[0] !== "msgsndr-booking-complete")
    return null;
  var info = data[1] && typeof data[1] === "object" ? data[1] : {};
  return {
    widget: "gohighlevel",
    detail: {
      calendar_id: info.calendarId || info.calendar_id || undefined,
    },
    contact: {
      email: info.email || undefined,
      firstName: info.firstName || info.first_name || undefined,
      lastName: info.lastName || info.last_name || undefined,
      phone: info.phone || undefined,
    },
  };
}

function parseCalendlyBooking(data) {
  if (!data || data.event !== "calendly.event_scheduled") return null;
  var payload = data.payload || {};
  var invitee = payload.invitee || {};
  return {
    widget: "calendly",
    detail: {
      event_uri: (payload.event && payload.event.uri) || undefined,
    },
    contact: {
      email: invitee.email || undefined,
      firstName: invitee.name || undefined,
    },
  };
}

function parseCalComBooking(data) {
  if (!data || typeof data !== "object") return null;
  var action = data.type || data.action || "";
  if (typeof action !== "string" || !/bookingSuccessful/i.test(action))
    return null;
  var d = data.data || {};
  return {
    widget: "calcom",
    detail: { uid: d.uid || undefined, title: d.title || undefined },
    contact: {},
  };
}

function parseCustomBookingPatterns(data) {
  var patterns = window.ATRIBU_BOOKING_PATTERNS;
  if (!Array.isArray(patterns)) return null;
  var serialized = typeof data === "string" ? data : JSON.stringify(data);
  if (!serialized) return null;
  for (var i = 0; i < patterns.length; i++) {
    var p = patterns[i];
    if (!p || typeof p.match !== "string") continue;
    if (serialized.indexOf(p.match) !== -1) {
      return {
        widget: p.widget || "custom",
        detail: {},
        contact: {},
      };
    }
  }
  return null;
}

var BOOKING_HASH_PATTERN =
  /^#(booking|booked|scheduled|confirmed|thank-?you)/i;

export function initBookingCapture() {
  window.addEventListener(
    "message",
    function (event) {
      try {
        var data = event.data;
        var result =
          parseGHLBooking(data) ||
          parseCalendlyBooking(data) ||
          parseCalComBooking(data) ||
          parseCustomBookingPatterns(data);
        if (result)
          fireBookingOnce(result.widget, result.detail, result.contact);
      } catch (_) {}
    },
    false
  );

  window.addEventListener(
    "hashchange",
    function () {
      try {
        if (_bookingFiredSession === getSessionId()) return;
        var hash = window.location.hash;
        if (hash && BOOKING_HASH_PATTERN.test(hash)) {
          fireBookingOnce("hash_detection", { hash: hash });
        }
      } catch (_) {}
    },
    false
  );
}
