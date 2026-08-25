// ---------------------------------------------------------------------------
// Atribu Tracker v3 — Entry point
// ---------------------------------------------------------------------------
// esbuild bundles all imports into a single IIFE. The runtime module contains
// the full init sequence; this file simply invokes it on script load.

import { initRuntime } from "./runtime.js";
import { setLoaderScript } from "./config.js";

// #411 — capture the executing <script> element now. `document.currentScript`
// is only valid synchronously during this script's own execution; the
// deferred-init path in runtime.js (and any later async call) would see
// `null`. config.js's getTrackingKey()/getEndpoint() read this cached
// reference for their src-query-param / data-attribute fallbacks.
setLoaderScript(typeof document !== "undefined" ? document.currentScript : null);

initRuntime();
