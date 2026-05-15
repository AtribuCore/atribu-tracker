// ---------------------------------------------------------------------------
// SPA route-change detection: page_view on pushState/replaceState/popstate/hashchange
// ---------------------------------------------------------------------------

import { safeUrl } from "../util.js";
import { collectEngagementPayload } from "../engagement.js";
import { rotatePageViewId } from "../session.js";
import { resetFormInteractionState } from "./form-interactions.js";

var _lastSpaUrl = window.location.href;
var _spaPageViewDebounceTimer = null;

function fireSpaPageView() {
  var currentUrl = window.location.href;
  if (currentUrl === _lastSpaUrl) return;
  var previousUrl = _lastSpaUrl;
  _lastSpaUrl = currentUrl;

  // Collect engagement metrics for the page we're leaving
  var engagement = collectEngagementPayload();
  resetFormInteractionState();
  // Reset exit beacon guard so the new page gets its own exit event
  if (typeof window.__atribuResetExitBeacon === "function") {
    window.__atribuResetExitBeacon();
  }
  rotatePageViewId();

  window.atribuTracker.track("page_view", {
    referrer: safeUrl(previousUrl),
    payload: Object.assign(
      {
        title: document.title,
        path: window.location.pathname,
        spa_navigation: true,
      },
      engagement
    ),
  });
}

function debouncedSpaPageView() {
  if (_spaPageViewDebounceTimer) clearTimeout(_spaPageViewDebounceTimer);
  _spaPageViewDebounceTimer = setTimeout(fireSpaPageView, 50);
}

export function initSpaCapture() {
  if (typeof history === "undefined") return;

  var _origPushState = history.pushState;
  var _origReplaceState = history.replaceState;

  history.pushState = function () {
    var result = _origPushState.apply(this, arguments);
    debouncedSpaPageView();
    return result;
  };

  history.replaceState = function () {
    var result = _origReplaceState.apply(this, arguments);
    debouncedSpaPageView();
    return result;
  };

  window.addEventListener(
    "popstate",
    function () {
      debouncedSpaPageView();
    },
    false
  );

  window.addEventListener(
    "hashchange",
    function () {
      debouncedSpaPageView();
    },
    false
  );
}
