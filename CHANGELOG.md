# Changelog

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
