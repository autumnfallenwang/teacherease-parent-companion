// H7 — real-fixture test for the homework parser. Reads the captured HTML at
// sandbox/captures/homework-page.html (gitignored — populated via
// sandbox/capture-homework-page.ts). Skips gracefully when missing so the
// default test run stays offline-clean.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHomework } from "../../src/lib/scraper/homework-parser";

const FIXTURE_PATH = join(__dirname, "../../sandbox/captures/homework-page.html");
const HAS_FIXTURE = existsSync(FIXTURE_PATH);

describe.skipIf(!HAS_FIXTURE)("homework parser — real captured fixture", () => {
  const html = HAS_FIXTURE ? readFileSync(FIXTURE_PATH, "utf8") : "";
  const entries = HAS_FIXTURE ? parseHomework(html) : [];

  it("parses multiple entries", () => {
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it("dates are in descending chronological order", () => {
    // "M/D/YY" sorts chronologically once normalized to "YY-MM-DD".
    const normalized = entries.map((e) => {
      const parts = e.date.split("/");
      const mm = (parts[0] ?? "").padStart(2, "0");
      const dd = (parts[1] ?? "").padStart(2, "0");
      const yy = parts[2] ?? "";
      return `${yy}-${mm}-${dd}`;
    });
    for (let i = 0; i < normalized.length - 1; i++) {
      const a = normalized[i] ?? "";
      const b = normalized[i + 1] ?? "";
      expect(a >= b).toBe(true);
    }
  });

  it("every subject has a plausible due-date shape or null", () => {
    for (const entry of entries) {
      for (const subj of entry.subjects) {
        if (subj.dueDate != null) {
          expect(subj.dueDate).toMatch(/^[A-Za-z]+\s+\d{1,2}\/\d{1,2}$/);
        }
      }
    }
  });

  it("most entries are populated (not all holidays)", () => {
    const populated = entries.filter((e) => e.subjects.length > 0).length;
    expect(populated / entries.length).toBeGreaterThan(0.5);
  });
});
