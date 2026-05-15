// ---------------------------------------------------------------------------
// Auto-capture: file download clicks → file_download
// ---------------------------------------------------------------------------

import { KEEPALIVE_BYTES_LIMIT, getEndpoint, getTrackingKey } from "../config.js";
import { buildTrackingEvent } from "../track.js";
import { createDispatchPayload, post } from "../networking.js";

var DOWNLOAD_EXTENSIONS =
  /\.(pdf|xlsx?|docx?|csv|pptx?|zip|rar|gz|7z|exe|dmg|iso|pkg|mp4|mp3|wav|avi|mov|mpeg|wmv|flv|midi|wma|rtf|txt|key|pps|numbers|pages|odt|ods|odp|eps)$/i;

function isDownloadLink(anchor) {
  if (!anchor || !anchor.href) return false;
  if (anchor.hasAttribute("download")) return true;
  try {
    var url = new URL(anchor.href, window.location.origin);
    return DOWNLOAD_EXTENSIONS.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function extractFileExtension(href) {
  try {
    var path = new URL(href, window.location.origin).pathname;
    var match = path.match(/\.(\w+)$/);
    return match ? match[1].toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

function extractAnchorFromTarget(target) {
  var node = target;
  for (var i = 0; i < 5 && node; i++) {
    if (node.tagName === "A") return node;
    node = node.parentElement;
  }
  return null;
}

var _lastDownloadKey = null;
var _lastDownloadAt = 0;

function dispatchFileDownload(anchor) {
  try {
    if (!anchor || !isDownloadLink(anchor)) return;

    // Dedup rapid double-clicks
    var key = anchor.href + "|" + window.location.href;
    var now = Date.now();
    if (_lastDownloadKey === key && now - _lastDownloadAt < 400) return;
    _lastDownloadKey = key;
    _lastDownloadAt = now;

    var extension = extractFileExtension(anchor.href);

    var trackingEvent = buildTrackingEvent("file_download", {
      payload: {
        file_url: anchor.href,
        file_extension: extension,
        file_name:
          anchor.getAttribute("download") ||
          (anchor.href ? anchor.href.split("/").pop() : null),
        link_text: (anchor.textContent || "").trim().slice(0, 200),
        source_page: window.location.pathname,
      },
    });

    // Use sendBeacon for reliability (download may navigate away)
    if (
      navigator &&
      typeof navigator.sendBeacon === "function" &&
      getTrackingKey()
    ) {
      var beaconPayload = createDispatchPayload(trackingEvent);
      if (beaconPayload) {
        var body = JSON.stringify(beaconPayload);
        if (body.length < KEEPALIVE_BYTES_LIMIT) {
          var blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(getEndpoint(), blob);
          return;
        }
      }
    }

    post(trackingEvent);
  } catch (_) {}
}

export function initFileDownloadCapture() {
  document.addEventListener(
    "click",
    function (event) {
      if (typeof event.button === "number" && event.button !== 0) return;
      var anchor = extractAnchorFromTarget(event.target);
      if (anchor && isDownloadLink(anchor)) {
        dispatchFileDownload(anchor);
      }
    },
    true
  );

  document.addEventListener(
    "auxclick",
    function (event) {
      if (event.button !== 1) return;
      var anchor = extractAnchorFromTarget(event.target);
      if (anchor && isDownloadLink(anchor)) {
        dispatchFileDownload(anchor);
      }
    },
    true
  );
}
