# Changelog

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
