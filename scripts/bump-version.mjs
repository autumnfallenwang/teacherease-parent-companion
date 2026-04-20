#!/usr/bin/env node
// Bump the three version files that have to stay in sync:
//   - package.json
//   - src-tauri/Cargo.toml
//   - src-tauri/tauri.conf.json
//
// Usage:  pnpm bump 0.1.1
//
// Does NOT touch git. After this runs:
//   1. Edit CHANGELOG.md — move Unreleased → [<version>] - YYYY-MM-DD.
//   2. git commit -am "chore: release v<version>"
//   3. git tag v<version> && git push origin main --tags
//   4. Release workflow builds + publishes a draft Release.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

function parseArg() {
  const v = process.argv[2];
  if (!v) {
    console.error("usage: pnpm bump <version>   (e.g. pnpm bump 0.1.1)");
    process.exit(1);
  }
  if (!SEMVER_RE.test(v)) {
    console.error(`error: "${v}" is not valid SemVer (e.g. 0.1.1, 1.2.3, 1.0.0-rc.1)`);
    process.exit(1);
  }
  return v;
}

function bumpPackageJson(version) {
  const path = resolve(ROOT, "package.json");
  const raw = readFileSync(path, "utf8");
  const next = raw.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`);
  writeFileSync(path, next);
  console.log(`  updated package.json → ${version}`);
}

function bumpCargoToml(version) {
  const path = resolve(ROOT, "src-tauri/Cargo.toml");
  const raw = readFileSync(path, "utf8");
  // Match the first `version = "x.y.z"` line (the package version, not a dep).
  const next = raw.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
  writeFileSync(path, next);
  console.log(`  updated src-tauri/Cargo.toml → ${version}`);
}

function bumpTauriConf(version) {
  const path = resolve(ROOT, "src-tauri/tauri.conf.json");
  const raw = readFileSync(path, "utf8");
  const next = raw.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`);
  writeFileSync(path, next);
  console.log(`  updated src-tauri/tauri.conf.json → ${version}`);
}

const version = parseArg();
console.log(`bumping to v${version}`);
bumpPackageJson(version);
bumpCargoToml(version);
bumpTauriConf(version);

console.log("");
console.log("next steps:");
console.log(
  `  1. edit CHANGELOG.md — move Unreleased → [${version}] - ${new Date().toISOString().slice(0, 10)}`,
);
console.log(`  2. git commit -am "chore: release v${version}"`);
console.log(`  3. git tag v${version} && git push origin main --tags`);
console.log("  4. GitHub Actions runs release.yml (~15 min) and publishes a draft Release.");
