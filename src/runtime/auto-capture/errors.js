// ---------------------------------------------------------------------------
// Auto-capture: JavaScript error tracking
// ---------------------------------------------------------------------------
// Captures unhandled JS errors and promise rejections. Max 5 per page load
// to avoid flooding. Critical for agencies: a JS error on a landing page
// can silently break the conversion funnel.
// ---------------------------------------------------------------------------

var MAX_ERRORS = 5;
var _errorCount = 0;

function fireError(message, source, lineno, colno) {
  if (_errorCount >= MAX_ERRORS) return;
  _errorCount++;

  window.atribuTracker.track("engagement", {
    payload: {
      engagement_type: "js_error",
      error_message: (message || "Unknown error").substring(0, 500),
      error_source: (source || "").substring(0, 200),
      error_line: lineno || undefined,
      error_col: colno || undefined,
      error_index: _errorCount,
      path: window.location.pathname,
    },
  });
}

export function initErrorCapture() {
  window.addEventListener(
    "error",
    function (event) {
      try {
        fireError(event.message, event.filename, event.lineno, event.colno);
      } catch (_) {}
    },
    false
  );

  window.addEventListener(
    "unhandledrejection",
    function (event) {
      try {
        var reason = event.reason;
        var message =
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : "Unhandled promise rejection";
        fireError(message, "", 0, 0);
      } catch (_) {}
    },
    false
  );
}
