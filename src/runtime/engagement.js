// ---------------------------------------------------------------------------
// Engagement metrics: scroll depth + time on page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scroll depth tracking
// ---------------------------------------------------------------------------

var _maxScrollPixels = 0;
var _maxScrollPercent = 0;
var _pageHeightAtMax = 0;
var _scrollRafPending = false;
var _scrollMilestoneSent = false;
var _scrollDebounceTimer = null;
var _pageLoadTime = Date.now();
var SCROLL_DEBOUNCE_MS = 2000;

function getDocumentHeight() {
  return Math.max(
    document.body ? document.body.scrollHeight : 0,
    document.documentElement ? document.documentElement.scrollHeight : 0
  );
}

// Map scroll percent to the highest milestone threshold crossed
function getHighestMilestone(pct) {
  if (pct >= 100) return 100;
  if (pct >= 75) return 75;
  if (pct >= 50) return 50;
  if (pct >= 25) return 25;
  return 0;
}

function updateScrollDepth() {
  _scrollRafPending = false;
  var scrollTop =
    window.pageYOffset ||
    (document.documentElement ? document.documentElement.scrollTop : 0) ||
    0;
  var viewportHeight =
    window.innerHeight ||
    (document.documentElement
      ? document.documentElement.clientHeight
      : 0) ||
    0;
  var docHeight = getDocumentHeight();
  var currentPosition = scrollTop + viewportHeight;

  if (currentPosition > _maxScrollPixels) {
    _maxScrollPixels = currentPosition;
    _pageHeightAtMax = docHeight;
    _maxScrollPercent =
      docHeight > 0
        ? Math.min(100, Math.round((currentPosition / docHeight) * 100))
        : 0;

    // Schedule a single debounced scroll milestone
    scheduleScrollMilestone();
  }
}

function scheduleScrollMilestone() {
  if (_scrollMilestoneSent) return;
  if (_scrollDebounceTimer) clearTimeout(_scrollDebounceTimer);
  _scrollDebounceTimer = setTimeout(function () {
    _scrollDebounceTimer = null;
    emitScrollMilestone();
  }, SCROLL_DEBOUNCE_MS);
}

function emitScrollMilestone() {
  if (_scrollMilestoneSent) return;
  var milestone = getHighestMilestone(_maxScrollPercent);
  if (milestone <= 0) return;

  // For short pages that show 100% immediately, require 1s of viewing
  var timeSinceLoad = Date.now() - _pageLoadTime;
  if (timeSinceLoad < 1000) {
    _scrollDebounceTimer = setTimeout(function () {
      _scrollDebounceTimer = null;
      emitScrollMilestone();
    }, 1000 - timeSinceLoad);
    return;
  }

  _scrollMilestoneSent = true;
  try {
    window.atribuTracker.track("engagement", {
      payload: {
        engagement_type: "scroll_milestone",
        milestone_pct: milestone,
        time_to_milestone_s: Math.round((Date.now() - _pageLoadTime) / 1000),
        page_height_px: _pageHeightAtMax,
        path: window.location.pathname,
      },
    });
  } catch (_) {}
}

function onScroll() {
  if (_scrollRafPending) return;
  _scrollRafPending = true;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(updateScrollDepth);
  } else {
    setTimeout(updateScrollDepth, 16);
  }
}

// ---------------------------------------------------------------------------
// Time on page tracking (accumulates while visible + focused)
// ---------------------------------------------------------------------------

var _engagementStartTime = 0;
var _totalEngagementMs = 0;
var _isEngaged = false;

function startEngagement() {
  if (_isEngaged) return;
  _isEngaged = true;
  _engagementStartTime = Date.now();
}

function pauseEngagement() {
  if (!_isEngaged) return;
  _isEngaged = false;
  _totalEngagementMs += Date.now() - _engagementStartTime;
}

function getEngagementSeconds() {
  var total = _totalEngagementMs;
  if (_isEngaged) total += Date.now() - _engagementStartTime;
  return Math.round(total / 1000);
}

// ---------------------------------------------------------------------------
// Dynamic page height polling (handles lazy-loaded content)
// ---------------------------------------------------------------------------

function pollDocumentHeight() {
  var polls = 0;
  var maxPolls = 15; // 3 seconds at 200ms intervals
  var timer = setInterval(function () {
    polls++;
    updateScrollDepth();
    if (polls >= maxPolls) clearInterval(timer);
  }, 200);
}

// ---------------------------------------------------------------------------
// Collect engagement payload (called before SPA navigation or on unload)
// ---------------------------------------------------------------------------

export function collectEngagementPayload() {
  // Capture final scroll position
  updateScrollDepth();

  // Fire the pending scroll milestone before reset (if debounce hasn't
  // fired yet), so data isn't lost on quick SPA navigations or tab close
  if (!_scrollMilestoneSent && _maxScrollPercent > 0) {
    emitScrollMilestone();
  }

  var payload = {
    scroll_depth_px: _maxScrollPixels,
    scroll_depth_pct: _maxScrollPercent,
    page_height_px: _pageHeightAtMax,
    time_on_page_s: getEngagementSeconds(),
  };

  // Reset for next page
  _maxScrollPixels = 0;
  _maxScrollPercent = 0;
  _pageHeightAtMax = 0;
  _totalEngagementMs = 0;
  _isEngaged = false;
  _scrollMilestoneSent = false;
  _pageLoadTime = Date.now();
  if (_scrollDebounceTimer) {
    clearTimeout(_scrollDebounceTimer);
    _scrollDebounceTimer = null;
  }
  // Only restart engagement if the page is visible — otherwise the timer
  // accumulates time while the tab is hidden (inflating the next exit event)
  if (document.visibilityState === "visible") {
    startEngagement();
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Init: attach event listeners
// ---------------------------------------------------------------------------

export function initEngagement() {
  // Copy/paste detection
  document.addEventListener(
    "copy",
    function () {
      try {
        var selection = window.getSelection();
        var text = selection ? selection.toString().trim() : "";
        if (text && text.length > 0) {
          window.atribuTracker.track("engagement", {
            payload: {
              engagement_type: "text_copied",
              copied_text: text.substring(0, 200),
              path: window.location.pathname,
            },
          });
        }
      } catch (_) {}
    },
    false
  );

  // Start time tracking immediately
  startEngagement();

  // Capture initial viewport as scroll depth (user sees top of page)
  updateScrollDepth();

  // Scroll listener (passive for performance)
  window.addEventListener("scroll", onScroll, { passive: true });

  // Visibility-based time tracking
  document.addEventListener(
    "visibilitychange",
    function () {
      if (document.visibilityState === "hidden") {
        pauseEngagement();
      } else {
        startEngagement();
      }
    },
    false
  );

  window.addEventListener(
    "focus",
    function () {
      startEngagement();
    },
    false
  );

  window.addEventListener(
    "blur",
    function () {
      pauseEngagement();
    },
    false
  );

  // Poll for dynamic content height changes after load
  if (document.readyState === "complete") {
    pollDocumentHeight();
  } else {
    window.addEventListener("load", function () {
      pollDocumentHeight();
    });
  }
}
