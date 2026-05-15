<p align="center">
  <a href="https://www.atribu.app">
    <img src="https://www.atribu.app/brand/atribu-wordmark-square-800.png" alt="Atribu" width="120">
  </a>
</p>

<h1 align="center">Atribu Web Tracking SDK</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@atribu/tracker"><img src="https://img.shields.io/npm/v/@atribu/tracker.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

<p align="center">
  <strong>Marketing attribution that shows which ads drive revenue. npm-installable; no <code>&lt;script&gt;</code> tag needed.</strong>
</p>

The official browser tracking SDK for [Atribu](https://www.atribu.app) — page views, sessions, engagement, outbound links, file downloads, form submissions, booking detection, and a Meta Pixel bridge, all auto-captured.

> Building a server-side integration instead? See [`@atribu/node`](https://www.npmjs.com/package/@atribu/node) for sending WhatsApp / Instagram messages, OAuth flow helpers, and signed webhook verification.

## Installation

```bash
npm install @atribu/tracker
```

## Quick Start

```typescript
import { init } from "@atribu/tracker";

init({
  trackingKey: "trk_live_...", // from Tracking Settings → Ingest Keys
});
```

That's it. Page views, sessions, engagement, outbound links, file downloads, form submissions, and booking detection are all auto-captured.

## What's Auto-Captured

| Signal | What & When |
|---|---|
| **Page views** | `init`, SPA navigation (`pushState`/`replaceState`/`popstate`/`hashchange`), bfcache restoration |
| **Sessions** | 30 min inactivity timeout (configurable 1–120), persisted across page loads |
| **Engagement** | Scroll depth (px + %), time on page — sent on page exit |
| **Outbound links** | External link clicks via `sendBeacon` |
| **File downloads** | pdf · xlsx · docx · csv · zip · mp4 · and 30+ more extensions |
| **Form submissions** | Auto-detected on standard `<form>` submits AND GHL-style `<div>` form fetches |
| **Booking detection** | Calendly · Cal.com · GoHighLevel · custom postMessage patterns |
| **Meta Pixel bridge** | Intercepts `fbq()` calls for server-side CAPI dedup |
| **Bot filtering** | Blocks traditional bots; tags AI agents (ChatGPT, Claude, Perplexity, Gemini) as `visitor_type: "ai_agent"` |
| **Declarative events** | `data-atribu-event` HTML attributes — no-code event tracking |

## Configuration

```typescript
init({
  trackingKey: "trk_live_...",                  // required
  apiHost: "https://tracking.example.com",      // custom tracking domain
  trackingEndpoint: "...",                       // full override of collect URL
  interceptMetaFbq: true,                       // mirror Meta Pixel events (default true)
  metaBridgePageview: false,                    // mirror Meta PageView too (default false)
  customProperties: { tier: "pro" },            // static props on every event
  transformRequest: (event) => event,           // event middleware (return null to suppress)
  ignoredPages: ["/admin/*"],                   // URL patterns with `*` wildcards
  sessionTimeoutMinutes: 30,                    // 1–120 min
  sessionMode: "inactivity_only",               // or "inactivity_or_source_change"
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `trackingKey` | `string` | *required* | Ingest Key from Tracking Settings → Ingest Keys |
| `apiHost` | `string` | `window.location.origin` | Origin for the collect endpoint |
| `trackingEndpoint` | `string` | `${apiHost}/api/tracking/collect` | Full override for collect URL |
| `interceptMetaFbq` | `boolean` | `true` | Mirror `fbq()` calls to Atribu |
| `metaBridgePageview` | `boolean` | `false` | Also mirror Meta PageView events |
| `customProperties` | `object \| function` | — | Extra properties merged into every event |
| `transformRequest` | `function` | — | Return `null`/`false` to suppress, or modified event |
| `ignoredPages` | `string[]` | — | URL patterns with `*` wildcards |
| `sessionTimeoutMinutes` | `number` | `30` | Session inactivity timeout (1–120) |
| `sessionMode` | `'inactivity_only' \| 'inactivity_or_source_change'` | `'inactivity_only'` | Whether to also reset a session when a new source fingerprint appears mid-session |

## Custom Events

```typescript
import { track } from "@atribu/tracker";

track("signup", { plan: "pro", source: "pricing-page" });
```

## Revenue Tracking

```typescript
import { trackRevenue } from "@atribu/tracker";

trackRevenue("purchase", 99.99, "USD", { plan: "enterprise" });
```

## User Identification

Link a visitor to a known user for cross-device attribution:

```typescript
import { identify } from "@atribu/tracker";

identify({
  email: "user@example.com",
  firstName: "Jane",
  lastName: "Doe",
  phone: "+1234567890",
});
```

## Consent Management

```typescript
import { setConsent } from "@atribu/tracker";

setConsent({ analytics: true, marketing: false });
```

Consent state is persisted to `localStorage` and attached to every event.

## Lifecycle Controls

```typescript
import { flush, reset } from "@atribu/tracker";

flush(); // force-send queued events (e.g. before navigating away)
reset(); // clear visitor ID, session, all stored state (e.g. on logout)
```

## Singleton Access

Initialize once, retrieve from anywhere:

```typescript
import { init, getTracker } from "@atribu/tracker";

// In your app's entry point:
init({ trackingKey: "trk_live_..." });

// In any other module:
const atribu = getTracker();
atribu.track("button_click", { label: "hero-cta" });
```

## Framework Examples

### React

```tsx
import { useEffect } from "react";
import { init } from "@atribu/tracker";

function App() {
  useEffect(() => {
    init({ trackingKey: "trk_live_..." });
  }, []);
  return <>{/* your app */}</>;
}
```

### Next.js (App Router)

```tsx
// app/providers.tsx
"use client";

import { useEffect } from "react";
import { init } from "@atribu/tracker";

export function AtribuProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    init({ trackingKey: "trk_live_..." });
  }, []);
  return <>{children}</>;
}
```

```tsx
// app/layout.tsx
import { AtribuProvider } from "./providers";

export default function RootLayout({ children }) {
  return (
    <html><body><AtribuProvider>{children}</AtribuProvider></body></html>
  );
}
```

### Vue 3

```typescript
import { onMounted } from "vue";
import { init } from "@atribu/tracker";

onMounted(() => init({ trackingKey: "trk_live_..." }));
```

### Svelte

```typescript
import { onMount } from "svelte";
import { init } from "@atribu/tracker";

onMount(() => init({ trackingKey: "trk_live_..." }));
```

### Vanilla JS

```html
<script type="module">
  import { init, track } from "@atribu/tracker";

  init({ trackingKey: "trk_live_..." });

  document.querySelector("#signup-btn").addEventListener("click", () => {
    track("signup", { source: "landing" });
  });
</script>
```

## Declarative Events

Track events without writing JavaScript using HTML data attributes:

```html
<button
  data-atribu-event="signup"
  data-atribu-prop-plan="pro"
  data-atribu-revenue="99.99"
  data-atribu-currency="USD"
>
  Sign Up
</button>
```

The tracker auto-captures clicks on elements with `data-atribu-event` and extracts:
- Event name from `data-atribu-event`
- Custom properties from `data-atribu-prop-*` attributes
- Revenue from `data-atribu-revenue` + `data-atribu-currency`

## Meta Pixel Bridge

When `interceptMetaFbq` is `true` (the default), the tracker intercepts `fbq()` calls from the Meta Pixel and mirrors them to Atribu for server-side deduplication and attribution. The `event_id` passed through is the same one Meta CAPI sees, so Pixel↔CAPI dedup works automatically.

## Privacy

- **First-party only.** All data goes to your configured endpoint. No third-party tracking, no cross-site identifiers.
- **No cookies set for tracking.** Visitor + session IDs live in `localStorage`. The tracker reads `_fbp`/`_fbc` cookies (set by Meta Pixel) only when present, for CAPI match quality.
- **Consent-aware.** `setConsent()` state is persisted and attached to every event. Events fired before consent are queued and replayed once consent is granted.
- **Bot filtering on-device.** Traditional bots are blocked at the client level. AI agents (ChatGPT, Claude, Perplexity, Gemini) are tracked but tagged `visitor_type: "ai_agent"` so you can filter them in reporting.

## Developer Exclusion

Exclude yourself from tracking during development:

```javascript
localStorage.atribu_ignore = "true";
```

Remove it to re-enable tracking:

```javascript
delete localStorage.atribu_ignore;
```

## TypeScript

Full TypeScript support with all types exported:

```typescript
import type {
  AtribuConfig,
  AtribuClient,
  TrackOptions,
  IdentifyInput,
  ConsentPayload,
  TrackingEvent,
  CustomPropertiesContext,
} from "@atribu/tracker";
```

## How It Works

This package bundles the full Atribu tracker runtime (the same code served by `atribu-tracker.js`). When you call `init()`:

1. Window configuration variables are set from your config.
2. The tracker runtime initializes (bot detection, outbox, event listeners).
3. `session_start` and `page_view` are auto-fired.
4. SPA navigation, engagement, and all auto-capture modules activate.

In SSR environments (Node.js, Next.js server components), `init()` returns a silent no-op client — safe to import + call anywhere.

## Runtime Support

| Runtime | Supported |
|---|---|
| Modern browsers (Chrome, Safari, Firefox, Edge) | ✅ |
| Mobile webviews (iOS, Android) | ✅ |
| SSR (Node 18+, Next.js server) | ✅ — no-op fallback |
| Bun (browser bundle) | ✅ |
| Deno | ❌ (no DOM) |

## Links

- [Documentation](https://www.atribu.app/docs)
- [Dashboard](https://www.atribu.app/login)
- [Changelog](./CHANGELOG.md)

## License

MIT
