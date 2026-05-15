// ---------------------------------------------------------------------------
// Cookie reading: _fbp / _fbc for Meta CAPI match quality
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
