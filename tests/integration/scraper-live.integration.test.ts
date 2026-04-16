// T11b — Live e2e scraper test. Hits real TeacherEase with credentials from
// sandbox/.env. NEVER runs in CI — gated by TEACHEREASE_LIVE=1 env var.
//
// Run manually:
//   TEACHEREASE_LIVE=1 pnpm test tests/integration/scraper-live.integration.test.ts
//
// Requires sandbox/.env with:
//   TEACHEREASE_BASE_URL=https://www.teacherease.com
//   TEACHEREASE_USERNAME=real@email.com
//   TEACHEREASE_PASSWORD=realpassword

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGradesOverview } from "../../src/lib/scraper/parser";
import { login } from "../../src/lib/scraper/teacherease";

const LIVE_ENABLED = process.env.TEACHEREASE_LIVE === "1";
const ENV_PATH = join(__dirname, "../../sandbox/.env");

function loadEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const lines = readFileSync(ENV_PATH, "utf8").split("\n");
  const env: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = (line as string).trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

describe("live e2e: login + scrape", () => {
  const env = LIVE_ENABLED ? loadEnv() : {};
  const baseUrl = env.TEACHEREASE_BASE_URL ?? "";
  const username = env.TEACHEREASE_USERNAME ?? "";
  const password = env.TEACHEREASE_PASSWORD ?? "";
  const hasCredentials = Boolean(baseUrl && username && password);

  it.skipIf(!LIVE_ENABLED)("TEACHEREASE_LIVE=1 is set", () => {
    expect(LIVE_ENABLED).toBe(true);
  });

  it.skipIf(!LIVE_ENABLED || !hasCredentials)(
    "logs in and receives an authenticated session",
    async () => {
      const session = await login(baseUrl, { username, password });
      expect(session.baseUrl).toBe(baseUrl);
      expect(session.cookieHeader.length).toBeGreaterThan(0);
    },
    30_000,
  );

  it.skipIf(!LIVE_ENABLED || !hasCredentials)(
    "fetches and parses the grades overview",
    async () => {
      const session = await login(baseUrl, { username, password });

      const gradesUrl = new URL(
        "/App/Parents/StandardGrade/GradeViewAllWithProgress",
        session.baseUrl,
      ).toString();
      const res = await fetch(gradesUrl, {
        headers: { Cookie: session.cookieHeader },
      });
      expect(res.ok).toBe(true);

      const html = await res.text();
      const overview = parseGradesOverview(html);
      expect(overview.classes.length).toBeGreaterThan(0);

      for (const cls of overview.classes) {
        expect(cls.name.length).toBeGreaterThan(0);
        expect(cls.classId).toBeGreaterThan(0);
      }
    },
    30_000,
  );
});
