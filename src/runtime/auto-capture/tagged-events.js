// ---------------------------------------------------------------------------
// Auto-capture: declarative events via data-atribu-* attributes
// ---------------------------------------------------------------------------
// Usage:
//   <button data-atribu-event="signup"
//           data-atribu-prop-plan="pro"
//           data-atribu-revenue="99.99"
//           data-atribu-currency="USD">
//     Sign Up
//   </button>

var ATTR_EVENT = "data-atribu-event";
var ATTR_PROP_PREFIX = "data-atribu-prop-";
var ATTR_REVENUE = "data-atribu-revenue";
var ATTR_CURRENCY = "data-atribu-currency";

function findTaggedElement(target) {
  var node = target;
  for (var i = 0; i < 3 && node; i++) {
    if (node.getAttribute && node.getAttribute(ATTR_EVENT)) return node;
    node = node.parentElement;
  }
  return null;
}

function extractTaggedEvent(element) {
  var eventName = element.getAttribute(ATTR_EVENT);
  if (!eventName || !eventName.trim()) return null;

  var props = {};
  var attrs = element.attributes;
  for (var k = 0; k < attrs.length; k++) {
    var attr = attrs[k];
    if (attr.name.indexOf(ATTR_PROP_PREFIX) === 0) {
      var propName = attr.name.slice(ATTR_PROP_PREFIX.length);
      if (propName) props[propName] = attr.value;
    }
  }

  var revenueStr = element.getAttribute(ATTR_REVENUE);
  var revenue = revenueStr ? Number(revenueStr) : undefined;
  if (typeof revenue === "number" && !isFinite(revenue)) revenue = undefined;

  var currency = element.getAttribute(ATTR_CURRENCY);

  return {
    eventName: eventName.trim(),
    props: props,
    valueAmount: revenue,
    currency: currency ? currency.trim().toUpperCase() : undefined,
  };
}

export function initTaggedEventCapture() {
  document.addEventListener(
    "click",
    function (event) {
      try {
        var tagged = findTaggedElement(event.target);
        if (!tagged) return;
        var ev = extractTaggedEvent(tagged);
        if (!ev) return;

        // Map to custom_event canonical name, preserve original in payload
        window.atribuTracker.track("custom_event", {
          valueAmount: ev.valueAmount,
          currency: ev.currency,
          payload: Object.assign(
            {
              custom_event_name: ev.eventName,
              tagged_event: true,
            },
            ev.props
          ),
        });
      } catch (_) {}
    },
    true
  );

  // Also handle form submissions on tagged forms
  document.addEventListener(
    "submit",
    function (event) {
      try {
        var form = event.target;
        if (!form || form.tagName !== "FORM") return;
        if (!form.getAttribute(ATTR_EVENT)) return;
        var ev = extractTaggedEvent(form);
        if (!ev) return;

        window.atribuTracker.track("custom_event", {
          valueAmount: ev.valueAmount,
          currency: ev.currency,
          payload: Object.assign(
            {
              custom_event_name: ev.eventName,
              tagged_event: true,
              form_id:
                form.getAttribute("id") ||
                form.getAttribute("name") ||
                "form",
            },
            ev.props
          ),
        });
      } catch (_) {}
    },
    true
  );
}
