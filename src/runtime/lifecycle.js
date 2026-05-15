// ---------------------------------------------------------------------------
// Page lifecycle: bfcache restoration, prerender awareness
// ---------------------------------------------------------------------------

import { storage } from "./storage.js";

// ---------------------------------------------------------------------------
// Prerender / background tab detection
// ---------------------------------------------------------------------------

export function shouldDeferInit() {
  // Speculation Rules API (modern prerendering)
  if (typeof document.prerendering === "boolean" && document.prerendering)
    return true;
  // Background tab at load time — don't fire phantom pageviews
  if (document.visibilityState === "hidden") return true;
  return false;
}

// ---------------------------------------------------------------------------
// bfcache restoration: re-fire page_view when page is restored
// ---------------------------------------------------------------------------

export function initBfcacheListener() {
  window.addEventListener(
    "pageshow",
    function (event) {
      if (!event.persisted) return;
      // Page restored from bfcache — refresh session timestamp
      try {
        storage.setItem("atribu_session_ts", String(Date.now()));
      } catch (_) {}
      // Fire a new page_view for the restored page
      if (window.atribuTracker && window.atribuTracker.page) {
        window.atribuTracker.page();
      }
    },
    false
  );
}
