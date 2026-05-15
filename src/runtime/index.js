// ---------------------------------------------------------------------------
// Atribu Tracker v3 — Entry point
// ---------------------------------------------------------------------------
// esbuild bundles all imports into a single IIFE. The runtime module contains
// the full init sequence; this file simply invokes it on script load.

import { initRuntime } from "./runtime.js";

initRuntime();
