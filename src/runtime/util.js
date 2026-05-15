// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

export function genId(prefix) {
  if (window.crypto && window.crypto.randomUUID) {
    return prefix + "_" + window.crypto.randomUUID().replace(/-/g, "");
  }
  return (
    prefix +
    "_" +
    String(Date.now()) +
    "_" +
    String(Math.floor(Math.random() * 1e9))
  );
}

export function cleanObject(value) {
  var out = {};
  if (!value || typeof value !== "object") return out;
  Object.keys(value).forEach(function (key) {
    var v = value[key];
    if (v !== undefined && v !== null && String(v).trim() !== "")
      out[key] = String(v).trim();
  });
  return out;
}

export function hasAnyKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).length > 0;
}

export function isPlainObject(value) {
  return (
    !!value && Object.prototype.toString.call(value) === "[object Object]"
  );
}

export function safeUrl(v) {
  try {
    if (!v) return undefined;
    return new URL(v).toString();
  } catch (_) {
    return undefined;
  }
}
