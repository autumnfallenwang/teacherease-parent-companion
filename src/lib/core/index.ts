// Pure, platform-agnostic business logic. Everything here is testable
// without mocking Tauri, SQLite, or the OS keychain, and is safely
// importable from a future backend or a second frontend.
//
// Belongs here: diff algorithms (what's new since last scrape),
// "needs attention" rules, trend computations, grade formatting,
// status derivation. Pure functions only.
//
// Does NOT belong here: anything that reads/writes SQLite, touches the
// keychain, calls Tauri IPC, hits the network, reads process.env, or
// imports from `@tauri-apps/*`. See design-plan.md "Forward compatibility".

// Placeholder so the module isn't empty. Remove when real exports land.
export const CORE_VERSION = 1;
