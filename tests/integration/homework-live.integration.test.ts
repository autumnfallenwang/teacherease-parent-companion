// H7 — live e2e homework test. Hits the real Google Sites page configured in
// sandbox/.env. Skips in CI — gated by TEACHEREASE_LIVE=1.
//
// Run manually:
//   TEACHEREASE_LIVE=1 pnpm test tests/integration/homework-live.integration.test.ts
//
// Requires sandbox/.env with:
//   HOMEWORK_PAGE_URL=https://sites.google.com/.../homework

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHomework } from "../../src/lib/scraper/homework-parser";
import { USER_AGENT } from "../../src/lib/scraper/teacherease";

const LIVE_ENABLED = process.env.TEACHEREASE_LIVE === "1";
const ENV_PATH = join(__dirname, "../../sandbox/.env");

function loadEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

describe("live e2e: homework page", () => {
  const env = LIVE_ENABLED ? loadEnv() : {};
  const url = env.HOMEWORK_PAGE_URL ?? "";
  const hasUrl = Boolean(url);

  it.skipIf(!LIVE_ENABLED)("TEACHEREASE_LIVE=1 is set", () => {
    expect(LIVE_ENABLED).toBe(true);
  });

  it.skipIf(!LIVE_ENABLED || !hasUrl)(
    "fetches the homework page (HTTP 200, non-empty body)",
    async () => {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html.length).toBeGreaterThan(1000);
    },
    30_000,
  );

  it.skipIf(!LIVE_ENABLED || !hasUrl)(
    "parses at least one entry with a M/D/YY date",
    async () => {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      const html = await res.text();
      const entries = parseHomework(html);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.date).toMatch(/^\d{1,2}\/\d{1,2}\/\d{2}$/);
      }
    },
    30_000,
  );

  it.skipIf(!LIVE_ENABLED || !hasUrl)(
    "populated subjects have plausible due dates",
    async () => {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      const entries = parseHomework(await res.text());
      for (const entry of entries) {
        for (const subj of entry.subjects) {
          if (subj.dueDate != null) {
            expect(subj.dueDate).toMatch(/^[A-Za-z]+\s+\d{1,2}\/\d{1,2}$/);
          }
        }
      }
    },
    30_000,
  );
});
