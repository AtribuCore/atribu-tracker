// ---------------------------------------------------------------------------
// Auto-capture: CTA visibility tracking via IntersectionObserver
// ---------------------------------------------------------------------------
// Auto-detects call-to-action buttons/links on the page and tracks when
// they become visible to the user. Max 10 CTAs per page to avoid overhead.
// ---------------------------------------------------------------------------

var CTA_TEXT_RE =
  /buy|comprar|sign.?up|reg[ií]strate|get.?started|comenzar|apply|solicitar|book|reservar|schedule|agendar|download|descargar|contact|contactar|subscribe|suscr[ií]b|order|pedir|join|unirse|start|empezar|free|gratis|learn.?more|more.?info|m[aá]s.?info|try|probar/i;

var CTA_SELECTORS = 'button, a[href], input[type="submit"], [role="button"]';
var MAX_CTAS = 10;
var _observedCtas = new WeakSet();
var _observer = null;
var _ctaCount = 0;
var _pageStartTime = Date.now();

function getCtaText(el) {
  return (el.textContent || el.innerText || el.value || "").trim().substring(0, 100);
}

function isInsideNav(el) {
  try {
    if (el.closest) {
      return !!el.closest('nav, [role="navigation"]');
    }
    // Fallback for browsers without closest
    var node = el;
    for (var i = 0; i < 10; i++) {
      if (!node) return false;
      var tag = (node.tagName || "").toUpperCase();
      if (tag === "NAV") return true;
      var role = node.getAttribute && node.getAttribute("role");
      if (role === "navigation") return true;
      node = node.parentElement;
    }
  } catch (_) {}
  return false;
}

var CTA_MAX_TEXT_LEN = 80;

function isCta(el) {
  var text = getCtaText(el);
  if (!text) return false;
  // Real CTA buttons have short text — skip long content (widgets, cards)
  if (text.length > CTA_MAX_TEXT_LEN) return false;
  if (!CTA_TEXT_RE.test(text)) return false;
  // Exclude navigation elements — they're not CTAs
  if (isInsideNav(el)) return false;
  return true;
}

function isVisible(el) {
  if (!el.offsetParent && el.tagName !== "BODY") return false;
  var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return true;
}

function observeCtaElement(el) {
  if (_ctaCount >= MAX_CTAS) return;
  if (_observedCtas.has(el)) return;
  if (!isVisible(el)) return;

  _observedCtas.add(el);
  _ctaCount++;

  _observer.observe(el);
}

function scanPage() {
  _ctaCount = 0;
  _pageStartTime = Date.now();
  try {
    var elements = document.querySelectorAll(CTA_SELECTORS);
    for (var i = 0; i < elements.length && _ctaCount < MAX_CTAS; i++) {
      if (isCta(elements[i])) {
        observeCtaElement(elements[i]);
      }
    }
  } catch (_) {}
}

export function initCtaVisibilityCapture() {
  if (typeof IntersectionObserver === "undefined") return;
  if (typeof WeakSet === "undefined") return;

  _observer = new IntersectionObserver(
    function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;

        var el = entry.target;
        _observer.unobserve(el);

        window.atribuTracker.track("view_content", {
          payload: {
            content_type: "cta",
            cta_text: getCtaText(el),
            cta_tag: el.tagName || "",
            cta_href: el.href || el.getAttribute("href") || undefined,
            visible_ratio: Math.round(entry.intersectionRatio * 100) / 100,
            time_to_visible_s: Math.round((Date.now() - _pageStartTime) / 1000),
            path: window.location.pathname,
          },
        });
      }
    },
    { threshold: [0.5] }
  );

  // Initial scan after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanPage);
  } else {
    // Small delay to let SPA frameworks finish rendering
    setTimeout(scanPage, 500);
  }
}
