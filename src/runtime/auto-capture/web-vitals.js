// ---------------------------------------------------------------------------
// Auto-capture: Core Web Vitals (LCP, FCP, CLS, INP, TTFB)
// ---------------------------------------------------------------------------
// Fires a single consolidated engagement event 5s after load with all
// Web Vitals metrics. Critical for agencies: slow landing pages destroy ROAS.
// ---------------------------------------------------------------------------

var _fired = false;
var _lcp = null;
var _fcp = null;
var _cls = 0;
var _inp = null;
var _ttfb = null;
var _observers = [];

function rateMetric(value, good, poor) {
  if (value <= good) return "good";
  if (value <= poor) return "needs_improvement";
  return "poor";
}

function collectAndFire() {
  if (_fired) return;
  _fired = true;

  // Disconnect all observers — we only need one reading
  for (var o = 0; o < _observers.length; o++) {
    try { _observers[o].disconnect(); } catch (_) {}
  }
  _observers = [];

  // TTFB from navigation timing
  try {
    var navEntries = performance.getEntriesByType("navigation");
    if (navEntries && navEntries.length > 0) {
      _ttfb = Math.round(navEntries[0].responseStart);
    }
  } catch (_) {}

  var payload = {
    engagement_type: "web_vitals",
    path: window.location.pathname,
  };

  if (_lcp !== null) {
    payload.lcp_ms = Math.round(_lcp);
    payload.lcp_rating = rateMetric(_lcp, 2500, 4000);
  }
  if (_fcp !== null) {
    payload.fcp_ms = Math.round(_fcp);
    payload.fcp_rating = rateMetric(_fcp, 1800, 3000);
  }
  if (_cls !== null) {
    payload.cls = Math.round(_cls * 1000) / 1000;
    payload.cls_rating = rateMetric(_cls, 0.1, 0.25);
  }
  if (_inp !== null) {
    payload.inp_ms = Math.round(_inp);
    payload.inp_rating = rateMetric(_inp, 200, 500);
  }
  if (_ttfb !== null) {
    payload.ttfb_ms = Math.round(_ttfb);
    payload.ttfb_rating = rateMetric(_ttfb, 800, 1800);
  }

  // Connection info
  try {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.effectiveType) {
      payload.connection_type = conn.effectiveType;
    }
  } catch (_) {}

  // Only fire if we have at least one metric
  if (
    payload.lcp_ms !== undefined ||
    payload.fcp_ms !== undefined ||
    payload.cls !== undefined ||
    payload.ttfb_ms !== undefined
  ) {
    window.atribuTracker.track("engagement", { payload: payload });
  }
}

export function initWebVitalsCapture() {
  if (typeof PerformanceObserver === "undefined") return;

  // LCP
  try {
    var lcpObserver = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      if (entries.length > 0) {
        _lcp = entries[entries.length - 1].startTime;
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    _observers.push(lcpObserver);
  } catch (_) {}

  // FCP
  try {
    var paintObserver = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name === "first-contentful-paint") {
          _fcp = entries[i].startTime;
        }
      }
    });
    paintObserver.observe({ type: "paint", buffered: true });
    _observers.push(paintObserver);
  } catch (_) {}

  // CLS (cumulative layout shift)
  try {
    var clsObserver = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].hadRecentInput) {
          _cls += entries[i].value;
        }
      }
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
    _observers.push(clsObserver);
  } catch (_) {}

  // INP (Interaction to Next Paint)
  try {
    var inpObserver = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        var duration = entries[i].duration;
        if (_inp === null || duration > _inp) {
          _inp = duration;
        }
      }
    });
    inpObserver.observe({ type: "event", buffered: true, durationThreshold: 40 });
    _observers.push(inpObserver);
  } catch (_) {}

  // Fire 5 seconds after load
  function scheduleCollection() {
    setTimeout(collectAndFire, 5000);
  }

  if (document.readyState === "complete") {
    scheduleCollection();
  } else {
    window.addEventListener("load", scheduleCollection);
  }
}
