// ---------------------------------------------------------------------------
// Auto-capture: video engagement (play, pause, milestones)
// ---------------------------------------------------------------------------
// Auto-detects native <video> elements AND Wistia embeds. Tracks play/pause
// events plus a completion milestone. Uses threshold [95] + `ended`/`end`
// event to reliably detect completion (native timeupdate often stops at
// ~98-99%, and Wistia percentwatchedchanged measures unique seconds, not
// playback position).
// ---------------------------------------------------------------------------

var MILESTONES = [95];
var _trackedVideos = new WeakSet();
var _trackedWistiaIds = {};

function getVideoLabel(video) {
  return (
    video.id ||
    video.getAttribute("title") ||
    video.getAttribute("data-title") ||
    video.getAttribute("src") ||
    "video"
  ).substring(0, 200);
}

function fireMilestone(label, pct, durationS, provider) {
  var payload = {
    engagement_type: "video_milestone",
    video_label: label,
    milestone_pct: pct,
    video_duration_s: durationS,
    path: window.location.pathname,
  };
  if (provider) payload.video_provider = provider;
  try {
    window.atribuTracker.track("engagement", { payload: payload });
  } catch (_) {}
}

function trackVideo(video) {
  if (_trackedVideos.has(video)) return;
  _trackedVideos.add(video);

  var firedMilestones = {};
  var label = getVideoLabel(video);

  video.addEventListener("play", function () {
    window.atribuTracker.track("engagement", {
      payload: {
        engagement_type: "video_play",
        video_label: label,
        video_current_time_s: Math.round(video.currentTime),
        video_duration_s: Math.round(video.duration || 0),
        path: window.location.pathname,
      },
    });
  });

  video.addEventListener("pause", function () {
    if (video.ended) return;
    window.atribuTracker.track("engagement", {
      payload: {
        engagement_type: "video_pause",
        video_label: label,
        video_current_time_s: Math.round(video.currentTime),
        video_duration_s: Math.round(video.duration || 0),
        video_percent: video.duration
          ? Math.round((video.currentTime / video.duration) * 100)
          : 0,
        path: window.location.pathname,
      },
    });
  });

  video.addEventListener("timeupdate", function () {
    if (!video.duration) return;
    var pct = (video.currentTime / video.duration) * 100;
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (pct >= m && !firedMilestones[m]) {
        firedMilestones[m] = true;
        fireMilestone(label, m, Math.round(video.duration));
      }
    }
  });

  // The `ended` event fires reliably when the video reaches the end,
  // even when timeupdate never reports exactly 100%
  video.addEventListener("ended", function () {
    if (!firedMilestones[100]) {
      firedMilestones[100] = true;
      fireMilestone(label, 100, Math.round(video.duration || 0));
    }
  });
}

// ---------------------------------------------------------------------------
// Wistia player support via _wq (Wistia Queue) API
// ---------------------------------------------------------------------------

function trackWistiaPlayer(video) {
  var mediaId = video.hashedId && video.hashedId();
  if (!mediaId) return;
  if (_trackedWistiaIds[mediaId]) return;
  _trackedWistiaIds[mediaId] = true;

  var firedMilestones = {};
  var label = video.name ? video.name() : mediaId;
  label = (label || mediaId).substring(0, 200);

  // Do NOT return video.unbind from play/pause/percentwatchedchanged —
  // that unbinds the handler after the first invocation, preventing
  // subsequent events from firing (e.g., 95% milestone would never fire
  // if percentwatchedchanged unbinds at 10%).
  video.bind("play", function () {
    window.atribuTracker.track("engagement", {
      payload: {
        engagement_type: "video_play",
        video_label: label,
        video_provider: "wistia",
        video_current_time_s: Math.round(video.time() || 0),
        video_duration_s: Math.round(video.duration() || 0),
        path: window.location.pathname,
      },
    });
  });

  video.bind("pause", function () {
    var duration = video.duration() || 0;
    var currentTime = video.time() || 0;
    if (duration > 0 && currentTime >= duration - 0.5) return;

    window.atribuTracker.track("engagement", {
      payload: {
        engagement_type: "video_pause",
        video_label: label,
        video_provider: "wistia",
        video_current_time_s: Math.round(currentTime),
        video_duration_s: Math.round(duration),
        video_percent: duration
          ? Math.round((currentTime / duration) * 100)
          : 0,
        path: window.location.pathname,
      },
    });
  });

  // percentwatchedchanged measures unique seconds watched as a fraction of
  // total duration — NOT playback position. A user who watches 0-50% then
  // skips to 80-100% gets percentWatched=0.7, never 1.0. We use [95] to
  // catch most complete views.
  video.bind("percentwatchedchanged", function (pct) {
    var percent = Math.round((pct || 0) * 100);
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (percent >= m && !firedMilestones[m]) {
        firedMilestones[m] = true;
        fireMilestone(label, m, Math.round(video.duration() || 0), "wistia");
      }
    }
  });

  // Wistia's `end` event fires when playback finishes, regardless of
  // percentWatched. This reliably catches video completion.
  video.bind("end", function () {
    if (!firedMilestones[100]) {
      firedMilestones[100] = true;
      fireMilestone(label, 100, Math.round(video.duration() || 0), "wistia");
    }
    return video.unbind;
  });
}

function initWistiaCapture() {
  window._wq = window._wq || [];
  window._wq.push({
    id: "_all",
    onReady: function (video) {
      try {
        trackWistiaPlayer(video);
      } catch (_) {}
    },
  });
}

// ---------------------------------------------------------------------------
// Native <video> scanning
// ---------------------------------------------------------------------------

function scanForVideos() {
  try {
    var videos = document.querySelectorAll("video");
    for (var i = 0; i < videos.length; i++) {
      trackVideo(videos[i]);
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Video.js player support (GHL funnel pages use Video.js with .vjs-ghl)
// ---------------------------------------------------------------------------

function initVideoJsCapture() {
  // Video.js exposes players via window.videojs.getPlayers() once loaded.
  // Poll for it since the library may load after our tracker.
  var attempts = 0;
  var maxAttempts = 20; // 10 seconds at 500ms intervals
  var timer = setInterval(function () {
    attempts++;
    try {
      if (window.videojs && typeof window.videojs.getPlayers === "function") {
        clearInterval(timer);
        var players = window.videojs.getPlayers();
        for (var key in players) {
          if (players[key] && players[key].el_) {
            var videoEl = players[key].el_.querySelector("video");
            if (videoEl) trackVideo(videoEl);
          }
        }
      }
    } catch (_) {}
    if (attempts >= maxAttempts) clearInterval(timer);
  }, 500);
}

export function initVideoCapture() {
  if (typeof WeakSet === "undefined") return;

  // Wistia players (via _wq API — works even if Wistia loads after us)
  initWistiaCapture();

  // Video.js players (GHL funnel pages)
  initVideoJsCapture();

  // Native <video> — initial scan
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanForVideos);
  } else {
    scanForVideos();
  }

  // Delayed rescan — SPA frameworks (GHL/Nuxt) may render videos after
  // DOMContentLoaded. The MutationObserver below should catch most cases,
  // but a safety net rescan at 3s catches edge cases.
  setTimeout(scanForVideos, 3000);

  // Watch for dynamically added videos
  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.tagName === "VIDEO") trackVideo(node);
          var nested = node.querySelectorAll("video");
          for (var k = 0; k < nested.length; k++) trackVideo(nested[k]);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}
