// ---------------------------------------------------------------------------
// Cross-tab identity sync via BroadcastChannel
// ---------------------------------------------------------------------------
// When identify() is called in one tab, broadcasts the identity data to
// all other tabs so they can stitch the same anonymous visitor. Useful when
// a user opens a form in a new tab from the ad-click landing page.
// ---------------------------------------------------------------------------

var CHANNEL_NAME = "atribu_identity_sync";
var _channel = null;

function onMessage(event) {
  try {
    var data = event.data;
    if (!data || data.type !== "atribu_identify") return;
    if (!data.payload) return;

    // Call identify without re-broadcasting (avoid infinite loop)
    if (window.atribuTracker && window.atribuTracker.identify) {
      _broadcasting = false;
      window.atribuTracker.identify(data.payload);
      _broadcasting = true;
    }
  } catch (_) {}
}

var _broadcasting = true;

export function broadcastIdentify(identifyInput) {
  if (!_broadcasting) return;
  try {
    if (_channel) {
      _channel.postMessage({
        type: "atribu_identify",
        payload: identifyInput,
      });
    } else {
      // Fallback: write to localStorage to trigger storage events in other tabs
      try {
        localStorage.setItem(
          "atribu_identity_broadcast",
          JSON.stringify({ payload: identifyInput, ts: Date.now() })
        );
      } catch (_) {}
    }
  } catch (_) {}
}

export function initIdentitySync() {
  if (typeof BroadcastChannel === "undefined") {
    // Fallback: use storage events for cross-tab sync
    window.addEventListener("storage", function (event) {
      try {
        if (event.key !== "atribu_identity_broadcast") return;
        if (!event.newValue) return;
        var data = JSON.parse(event.newValue);
        if (data && data.payload && window.atribuTracker) {
          _broadcasting = false;
          window.atribuTracker.identify(data.payload);
          _broadcasting = true;
        }
      } catch (_) {}
    });
    return;
  }

  try {
    _channel = new BroadcastChannel(CHANNEL_NAME);
    _channel.addEventListener("message", onMessage);
  } catch (_) {}
}
