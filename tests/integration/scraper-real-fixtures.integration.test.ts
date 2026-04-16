// T11a — Real-fixture parser tests. Loads unscrubbed HTML from sandbox/captures/
// (gitignored, may not exist on every machine). Catches PII-scrub artifacts
// that could silently break parsers.
//
// Skip gracefully when fixture files are missing — a skip is NOT a failure.
// Run via: pnpm test (included in full suite, excluded from test:fast)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseClassDetails, parseGradesOverview } from "../../scraper/parser";
import { extractLoginFormFields } from "../../scraper/teacherease";

const CAPTURES_DIR = join(__dirname, "../../sandbox/captures");

function readCapture(name: string): string | null {
  const path = join(CAPTURES_DIR, name);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

describe("real-fixture: login page", () => {
  const html = readCapture("login-page.html");

  it.skipIf(!html)("extracts hidden form fields from unscrubbed login page", () => {
    const fields = extractLoginFormFields(html as string);
    expect(Object.keys(fields).length).toBeGreaterThanOrEqual(4);
    expect(fields).toHaveProperty("LoginRequestID");
  });
});

describe("real-fixture: grades overview", () => {
  const html = readCapture("grades-page.html");

  it.skipIf(!html)("parses unscrubbed grades overview and finds classes", () => {
    const overview = parseGradesOverview(html as string);
    expect(overview.classes.length).toBeGreaterThan(0);
    expect(overview.summary.totalClasses).toBe(overview.classes.length);
  });

  it.skipIf(!html)("every class has a non-empty name and instructor", () => {
    const overview = parseGradesOverview(html as string);
    for (const cls of overview.classes) {
      expect(cls.name.length).toBeGreaterThan(0);
      expect(cls.instructor.length).toBeGreaterThan(0);
    }
  });
});

describe("real-fixture: class details", () => {
  const detailFiles = [
    "drama_7_details.html",
    "english_7_details.html",
    "french_7_details.html",
    "health_education_7_details.html",
    "science_7_details.html",
    "social_studies_7_details.html",
  ];

  for (const file of detailFiles) {
    const html = readCapture(file);
    const className = file.replace("_details.html", "").replaceAll("_", " ");

    it.skipIf(!html)(`parses unscrubbed ${file} and finds standards`, () => {
      const result = parseClassDetails(html as string, className);
      expect(result.standards.length).toBeGreaterThan(0);
    });
  }
});
