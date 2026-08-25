# Changelog

## 0.4.0 (2026-08-25)

### Features

- **Endpoint failover** — when a first-party tracking domain (CNAME) dies, delivery fails over to the canonical `www.atribu.app` collect endpoint after 3 consecutive network-level failures and a successful reachability probe; session-scoped, self-heals on next page load. Offline never triggers it.
- **GTM single-tag install** — the tracking key can ride the loader script's `src` query (`?key=`, `?endpoint=`), surviving GTM Custom HTML's `data-*` stripping. Window var still wins.
- **`whatsapp_click` / `contact_click` capture** — wa.me / api.whatsapp.com / web.whatsapp.com / `whatsapp://` clicks emit `whatsapp_click` (merchant phone + prefill text); `tel:` / `mailto:` emit `contact_click`. Both suppress the generic `outbound_link_click` duplicate.
- **Referrer-only first touch** — an organic first visit with an external referrer but no URL params now persists `{referrer, landing_page, capturedAt}` as first touch (first-write-wins; carried in the `atb1.` attribution token).
- **Broadened click-ID capture** — adds `rdt_cid`, `sccid`, `epik`, `dclid`, `qclid`, `irclid`.
- **`_ga` identity signal** — GA4 client id (and `_ga_*` session id) captured alongside `_fbp`/`_fbc` as a read-only identity signal.
- **Early identity capture** — phone/email captured at input blur (pre-submit) to a dedicated endpoint; per-profile server-side kill switch plus `window.ATRIBU_DISABLE_EARLY_IDENTITY`.
- **Install verification** — `?atb_verify=<nonce>` beacons install proof and is stripped before any stored touch/UTM context.


## 0.3.0 (2026-07-15)

### Features

- `purchase({ value, currency, orderId })` — fire a confirmation/thank-you page purchase. Same-device capture: the sale is recorded with its ad-click lineage so the payment provider's cash event stitches to that session (a backstop for when the provider can't carry the attribution token). Also queueable pre-init via the loader stub.

## 0.2.0 (2026-07-15)

### Features

- `getAttribution()` / `getAttributionToken()` — read the visitor's current identity + ad signal (anonymous_id, session_id, UTMs, click IDs, first touch) and hand it to a checkout so the payment ties to the exact ad instead of relying on an email match. The token is a compact `atb1.` string for a hidden form field, a Stripe/MercadoPago `metadata` value, or a `client_reference_id`; decode it server-side with `parseAttributionToken` from `@atribu/analytics-enrichment/attribution-token`.
- `ready(cb)` / `getAttributionAsync()` — read attribution before the tracker finishes loading (queue `["ready", cb]` on the loader stub) or as a promise after init.

## 0.1.3 (2026-05-15)

### Internal

- Workflow upgrades npm to latest before publishing so OIDC trusted publishing works for scoped packages (Node 20's default npm is too old for that path).

## 0.1.2 (2026-05-15)

> Note: tag pushed but workflow couldn't publish — npm 10.x (Node 20 default) doesn't support OIDC scoped publishing. Fixed in 0.1.3.

### Internal

- First release to land via OIDC trusted publishing (provenance attestation now signs every release).
- Mirror script now vendors the tracker runtime into `src/runtime/` inside the public mirror and rewrites runtime imports, so the standalone repo is buildable by `tsup` without monorepo context.

## 0.1.1 (2026-05-15)

> Note: tag pushed but workflow failed (standalone build couldn't resolve `../../src/*` imports). Fixed in 0.1.2.

### Features

- `setUserId(userId)` — attach a stable user ID to every future event. Complementary to `identify()` (which resolves identity via PII through the server-side identity graph). Was declared in the public `AtribuClient` type but missing from the live wrapper; now wired through to the underlying runtime.

### Docs

- README now documents `setUserId` under "User Identification" with the use-case split (PII identity resolution vs. stable user_id stamping).

### Internal

- First release published through GitHub Actions OIDC trusted publishing — provenance attestations now ship with every release.

## 0.1.0 (2025-03-18)

### Features

- Initial release of `@atribu/tracker`
- Thick SDK bundling the full tracker runtime
- `init()` with typed configuration
- `track()`, `identify()`, `page()`, `sessionStart()`, `setConsent()`, `trackRevenue()`
- `flush()` for immediate event dispatch
- `reset()` for clearing visitor/session state
- `getTracker()` singleton accessor
- SSR-safe (returns no-op client when `window` is undefined)
- ESM + CJS dual output with TypeScript declarations
- Auto-capture: page views, sessions, engagement, outbound links, file downloads, forms, bookings
- Meta Pixel bridge with deduplication
- Bot filtering and AI agent tagging
- Declarative events via `data-atribu-event` HTML attributes
