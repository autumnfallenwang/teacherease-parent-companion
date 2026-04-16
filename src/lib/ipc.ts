// Thin facade over Tauri IPC. All calls from React into the Rust shell go
// through this file — components never import from `@tauri-apps/*` directly.
//
// Why this exists: keeps the React code free of desktop-platform imports so
// it can run against a different backend (REST API, in-memory mock, etc.)
// without rewriting every component. See design-plan.md "Forward
// compatibility" section.
//
// When Phase 2 adds real IPC calls, they'll be re-exported from here as
// plain async functions (e.g. `addChild`, `runScrape`, `getLatestScrape`)
// that wrap `invoke()` internally.

// Placeholder so the module isn't empty and Biome's noRestrictedImports
// override has a file to target. Remove when real exports land.
export const IPC_WRAPPER_VERSION = 1;
