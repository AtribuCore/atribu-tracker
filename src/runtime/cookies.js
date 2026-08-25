// ---------------------------------------------------------------------------
// Cookie reading: _fbp / _fbc for Meta CAPI match quality, _ga / _ga_* for
// the GA4 client/session id (#408) — an extra identity-graph join key and a
// way for customers to cross-check Atribu against their own GA4 reports.
// Both are first-party cookies the site already sets; we're only reading
// them, never setting a new cookie of our own.
// ---------------------------------------------------------------------------

export function getCookie(name) {
  try {
    var cookies = document.cookie.split(";");
    for (var i = 0; i < cookies.length; i++) {
      var parts = cookies[i].trim().split("=");
      if (parts[0] === name)
        return decodeURIComponent(parts.slice(1).join("="));
    }
  } catch (_) {}
  return null;
}

// All first-party cookies whose name starts with `prefix`, as { name, value }
// pairs. Used for `_ga_<STREAM_ID>` where the suffix is unknown up front.
function getCookiesByPrefix(prefix) {
  var matches = [];
  try {
    var cookies = document.cookie.split(";");
    for (var i = 0; i < cookies.length; i++) {
      var eqIdx = cookies[i].indexOf("=");
      if (eqIdx === -1) continue;
      var name = cookies[i].slice(0, eqIdx).trim();
      if (name.slice(0, prefix.length) !== prefix) continue;
      matches.push({
        name: name,
        value: decodeURIComponent(cookies[i].slice(eqIdx + 1)),
      });
    }
  } catch (_) {}
  return matches;
}

export function getFbp() {
  return getCookie("_fbp") || null;
}

export function getFbc() {
  var cookie = getCookie("_fbc");
  if (cookie) return cookie;
  var params = new URLSearchParams(window.location.search);
  var fbclid = params.get("fbclid");
  if (fbclid) return "fb.1." + Date.now() + "." + fbclid;
  return null;
}

// GA4's `_ga` cookie holds a stable per-device client id shaped
// `GA1.1.<a>.<b>` (domain-level digit in the 2nd segment can vary, e.g.
// `GA1.2....`). The client id itself is parts 3+4 -- `<a>.<b>`.
export function getGaClientId() {
  var cookie = getCookie("_ga");
  if (!cookie) return null;
  var parts = cookie.split(".");
  if (parts.length < 4) return null;
  return parts[2] + "." + parts[3];
}

// GA4's session cookie is `_ga_<STREAM_ID>` -- the stream id suffix is
// unknown ahead of time, so scan by prefix and use the first match.
//
// Current format (GS2): dot- and `$`-delimited key/value segments, e.g.
// `GS2.1.s1746825440$o3$g1$t1746825501$j60$l0$h0` -- the session id is the
// segment prefixed with `s` (a Unix-seconds timestamp).
// Legacy format (GS1): `GS1.1.<sessionId>.<sessionNumber>...` -- the bare
// 3rd dot-segment is the session id instead.
export function getGaSessionId() {
  var cookies = getCookiesByPrefix("_ga_");
  for (var i = 0; i < cookies.length; i++) {
    var segments = cookies[i].value.split(/[.$]/);
    for (var j = 0; j < segments.length; j++) {
      if (/^s\d+$/.test(segments[j])) return segments[j].slice(1);
    }
    if (segments[0] === "GS1" && segments.length > 2) return segments[2];
  }
  return null;
}
