// ---------------------------------------------------------------------------
// Auto-capture: rage clicks + dead clicks
// ---------------------------------------------------------------------------
// Rage clicks: 3+ clicks within 1s on the same ~30px area (frustration)
// Dead clicks: click with no DOM mutation within 700ms (broken UX)
// ---------------------------------------------------------------------------

var RAGE_CLICK_THRESHOLD = 3;
var RAGE_CLICK_WINDOW_MS = 1000;
var RAGE_CLICK_RADIUS_PX = 30;
var RAGE_CLICK_COOLDOWN_MS = 5000;
var RAGE_CLICK_MAX_ENTRIES = 50;

var DEAD_CLICK_TIMEOUT_MS = 700;
var DEAD_CLICK_MAX_CONCURRENT = 3;

// Sliding window of recent clicks (stores coordinates only, no DOM refs)
var _recentClicks = [];
var _lastRageClickTime = {};
var _activeDeadClickChecks = 0;

function getSelector(el) {
  if (!el || !el.tagName) return "";
  var tag = el.tagName.toLowerCase();
  if (el.id) return tag + "#" + el.id;
  var cls = (el.className || "");
  if (typeof cls === "string" && cls.trim()) {
    return tag + "." + cls.trim().split(/\s+/).slice(0, 2).join(".");
  }
  return tag;
}

function getTargetText(el) {
  if (!el) return "";
  var text = (el.textContent || el.innerText || "").trim();
  return text.substring(0, 100);
}

function distance(a, b) {
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function cleanupRageClickTimes() {
  var keys = Object.keys(_lastRageClickTime);
  if (keys.length <= RAGE_CLICK_MAX_ENTRIES) return;
  var now = Date.now();
  for (var i = 0; i < keys.length; i++) {
    if (now - _lastRageClickTime[keys[i]] > RAGE_CLICK_COOLDOWN_MS) {
      delete _lastRageClickTime[keys[i]];
    }
  }
}

function checkRageClick(click, target) {
  var now = click.timestamp;
  var nearby = 0;
  for (var i = _recentClicks.length - 1; i >= 0; i--) {
    var prev = _recentClicks[i];
    if (now - prev.timestamp > RAGE_CLICK_WINDOW_MS) break;
    if (distance(click, prev) <= RAGE_CLICK_RADIUS_PX) {
      nearby++;
    }
  }

  if (nearby >= RAGE_CLICK_THRESHOLD - 1) {
    var selector = getSelector(target);
    var lastFired = _lastRageClickTime[selector] || 0;
    if (now - lastFired < RAGE_CLICK_COOLDOWN_MS) return;
    _lastRageClickTime[selector] = now;
    cleanupRageClickTimes();

    window.atribuTracker.track("engagement", {
      payload: {
        engagement_type: "rage_click",
        click_count: nearby + 1,
        target_tag: target.tagName || "",
        target_text: getTargetText(target),
        target_selector: selector,
        x: click.x,
        y: click.y,
        path: window.location.pathname,
      },
    });
  }
}

// Tags for known video player elements that handle clicks internally
// (shadow DOM, iframe, web components) — never dead/rage click targets
var VIDEO_PLAYER_TAGS = [
  "VIDEO", "WISTIA-PLAYER", "VIDYARD-PLAYER", "VIMEO-PLAYER",
];
var VIDEO_PLAYER_SELECTORS = [
  'iframe[src*="youtube"]', 'iframe[src*="vimeo"]', 'iframe[src*="wistia"]',
  'iframe[src*="vidyard"]', 'iframe[src*="loom"]',
  '[class*="wistia"]', '[id*="wistia"]',
  '[class*="vjs-"]',
];

function isInsideVideoPlayer(el) {
  if (!el) return false;
  var tag = (el.tagName || "").toUpperCase();
  if (VIDEO_PLAYER_TAGS.indexOf(tag) !== -1) return true;
  for (var i = 0; i < VIDEO_PLAYER_SELECTORS.length; i++) {
    try { if (el.matches && el.matches(VIDEO_PLAYER_SELECTORS[i])) return true; } catch (_) {}
  }
  // Walk up a few ancestors to catch clicks on child elements of video players
  var node = el;
  for (var j = 0; j < 5; j++) {
    node = node.parentElement;
    if (!node) break;
    var parentTag = (node.tagName || "").toUpperCase();
    if (VIDEO_PLAYER_TAGS.indexOf(parentTag) !== -1) return true;
    for (var k = 0; k < VIDEO_PLAYER_SELECTORS.length; k++) {
      try { if (node.matches && node.matches(VIDEO_PLAYER_SELECTORS[k])) return true; } catch (_) {}
    }
  }
  return false;
}

// Exclude clicks inside form containers — submissions often happen async
// (fetch/XHR) with no immediate DOM mutation, causing false dead clicks
var FORM_CONTAINER_SELECTORS = [
  "form",
  "#_builder-form",
  ".hl_wrapper",
  '[data-page-element="FormWrapper"]',
];

function isInsideFormContainer(el) {
  var node = el;
  for (var i = 0; i < 10; i++) {
    if (!node) break;
    for (var j = 0; j < FORM_CONTAINER_SELECTORS.length; j++) {
      try {
        if (node.matches && node.matches(FORM_CONTAINER_SELECTORS[j])) return true;
      } catch (_) {}
    }
    node = node.parentElement;
  }
  return false;
}

// Common submit/CTA button text patterns (EN + ES)
var SUBMIT_TEXT_RE = /submit|enviar|send|register|registr|sign.?up|get.?started|comenzar|apply|solicitar|book|reservar|agendar|contact|download|descargar|subscribe|suscr/i;

function checkDeadClick(event) {
  if (_activeDeadClickChecks >= DEAD_CLICK_MAX_CONCURRENT) return;

  var target = event.target;
  if (!target) return;

  // Exclude known video player elements — they handle clicks in shadow DOM
  if (isInsideVideoPlayer(target)) return;

  // Exclude elements that typically navigate away or have side effects
  var tag = (target.tagName || "").toUpperCase();
  if (tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  var role = target.getAttribute && target.getAttribute("role");
  if (role === "button" || role === "link") return;

  // Check if target or a close ancestor is a link/button
  var node = target;
  for (var i = 0; i < 3; i++) {
    if (!node) break;
    if (node.tagName === "A" || node.tagName === "BUTTON") return;
    node = node.parentElement;
  }

  // Exclude clicks inside form containers (GHL, standard forms)
  if (isInsideFormContainer(target)) return;

  // Exclude elements with CTA/submit text (GHL uses <p>/<div> as buttons)
  var clickText = (target.textContent || target.innerText || "").trim();
  if (clickText.length > 0 && clickText.length <= 80 && SUBMIT_TEXT_RE.test(clickText)) return;

  var mutated = false;
  var observer = new MutationObserver(function () {
    mutated = true;
    observer.disconnect();
  });

  // Observe the target and its parent subtree for any changes
  var observeTarget = target.parentElement || target;
  try {
    observer.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  } catch (_) {
    return;
  }

  _activeDeadClickChecks++;

  // Capture values synchronously before the timeout
  var targetTag = target.tagName || "";
  var targetText = getTargetText(target);
  var targetSelector = getSelector(target);
  var clickX = event.clientX;
  var clickY = event.clientY;
  var clickPath = window.location.pathname;

  setTimeout(function () {
    _activeDeadClickChecks = Math.max(0, _activeDeadClickChecks - 1);
    observer.disconnect();
    if (mutated) return;

    try {
      window.atribuTracker.track("engagement", {
        payload: {
          engagement_type: "dead_click",
          target_tag: targetTag,
          target_text: targetText,
          target_selector: targetSelector,
          x: clickX,
          y: clickY,
          path: clickPath,
        },
      });
    } catch (_) {}
  }, DEAD_CLICK_TIMEOUT_MS);
}

export function initClickQualityCapture() {
  if (typeof MutationObserver === "undefined") return;

  document.addEventListener(
    "click",
    function (event) {
      try {
        var click = {
          x: event.clientX,
          y: event.clientY,
          timestamp: Date.now(),
        };

        // Keep sliding window trimmed (no DOM refs stored)
        _recentClicks.push(click);
        if (_recentClicks.length > 10) {
          _recentClicks = _recentClicks.slice(-10);
        }

        // Skip video player elements for both rage and dead click checks
        if (!isInsideVideoPlayer(event.target)) {
          checkRageClick(click, event.target);
        }
        checkDeadClick(event);
      } catch (_) {}
    },
    true
  );
}
