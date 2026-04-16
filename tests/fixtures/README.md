# Test fixtures

Saved HTML snapshots from the TeacherEase parent portal, scrubbed of all PII. These are the input to the scraper parser tests (Phase 1, Tasks 9 and 10) — they let us parse-test against known inputs without re-hitting the live portal.

## Provenance

Derived on 2026-04-15 from `ref/teacherease_parents_helper/logs/` (the Python predecessor's debug captures), via `sandbox/scrub-fixtures.ts`. The scrub script is gitignored because it contains the real → dummy mapping.

## File layout

```
tests/fixtures/
├── README.md                     ← this file
├── login-page.html               ← unauthenticated login form (T8)
├── grades-page.html              ← main grades overview (8 classes, embedded kendoListView JSON)
├── classes/
│   ├── drama-7.html              ← Drama 7 detail page (standards + assignments)
│   ├── english-7.html
│   ├── french-7.html
│   ├── health-education-7.html
│   ├── science-7.html
│   └── social-studies-7.html
└── expected/
    └── full-data.json            ← reference parser output, for validating T9/T10 against a known good result
```

## login-page.html provenance

Captured 2026-04-15 via `sandbox/capture-login-page.ts` (a plain unauthenticated GET of `https://www.teacherease.com/common/login.aspx`). No PII — it's a public marketing/login form. Scrubbed only the portal hostname (`www.teacherease.com` → `school.example.teacherease.com`) so the commit hook allows it.

The form is **NOT classic ASP.NET WebForms postback.** No `__VIEWSTATE` or `__EVENTVALIDATION`. It's a regular HTML form with CSRF protection: 5 hidden fields, submit target `/app/Login/Login` (different from the GET URL), credential fields named `email` and `password`.

Parser tests in `scraper/teacherease.test.ts` assert the exact set of hidden field names extracted from this fixture. Re-capturing is fine — per-request tokens like `LoginRequestID` and `__AntiCsrfToken` will differ but the schema should be stable.

Not included: `homework_page.html` (we derive missing assignments from class detail pages per T9 proposal), Python runtime logs, Art 7 / Mathematics 7 / Physical Education 7 detail pages (the Python scraper only fetched details for classes with `needs_attention`, so we have 6 detail pages for an 8-class overview — intentional).

## Important: grades-page.html and full-data.json are from different scrapes

`grades-page.html` was captured at a different time than `full-data.json`. They show different classes and different statuses:

- **grades-page.html** (8 classes): Mathematics 7, Computer Science 7, Music 7, French 7, Science 7, Social Studies 7, English 7, Physical Education 7. Summary: 6 meeting, 1 needs_attention, 1 not_assessed.
- **full-data.json** (8 classes): Mathematics 7, French 7, Science 7, Social Studies 7, English 7, Art 7, Physical Education 7, Health Education 7. Summary: 4 meeting, 3 needs_attention, 1 not_assessed.

The class detail pages (`classes/*.html`) ARE from the same scrape as `full-data.json` — they match the `detailed_classes` section. Parser tests for overview (T9) assert against `grades-page.html` directly, NOT against `full-data.json`. Parser tests for class details (T10) can validate against `full-data.json`'s `detailed_classes`.

## Dummy values (match these in tests and code)

Per `CLAUDE.md` "Security constraints" and design-plan Q13, all committed code uses these dummy values. If you write parser tests against these fixtures, assert on these strings:

| Field | Dummy value |
|---|---|
| Student full name | `Test Student` |
| Student first name | `Test` |
| Student last name | `Student` |
| Student email | `test@example.com` |
| School district domain | `example.com` |
| Portal host | `school.example.teacherease.com` |
| Instructors | `Instructor One` through `Instructor Eight` (alphabetical by original last name — the mapping is documented only in `sandbox/scrub-fixtures.ts`) |

Class names (`Drama 7`, `English 7`, etc.), `ClassID`/`CGPID` integers, assignment titles, scores, grades, dates, and HTML structure are real (not PII, parser-relevant).

## Instructor-name format in fixtures

TeacherEase displays instructors as `"Lastname, X"` where `X` is the first initial. After scrubbing, the fixtures show `"Instructor One"`, `"Instructor Two"`, etc. — **no comma, no initial**. Parser tests should not assert on the `"Lastname, X"` format since it's been collapsed; assert on the full dummy string.

If a future parser change needs to preserve the `"Lastname, X"` format, update the scrub mapping to produce `"InstructorOne, A"` and re-run `sandbox/scrub-fixtures.ts`. Re-running is idempotent only if the mapping doesn't change.

## Classes with `needs_attention` (useful for T10 tests)

Per `expected/full-data.json`, the 3 classes with `status_code: 2` ("Click on Details") are:
- French 7
- Social Studies 7
- English 7

These are the ones the Python scraper fetched detail pages for. Tests that verify "missing assignment detection" should use these fixtures.

## Re-scrubbing / capturing new fixtures

If you capture a fresh HTML dump and want to add it:

1. Save the raw HTML somewhere under `sandbox/` (never `ref/` or `tests/fixtures/` directly).
2. Open `sandbox/scrub-fixtures.ts` and:
   - Add the new file to the `files` array.
   - If the new HTML contains PII strings not already in the mapping, add them to `replacements` (most specific first).
3. Re-run: `pnpm dlx tsx sandbox/scrub-fixtures.ts`
4. The script's built-in verification step greps the output for the original real values and exits non-zero if any leak. A second independent grep pass is still worth running manually before committing.
5. Commit only the output in `tests/fixtures/`. `sandbox/scrub-fixtures.ts` is gitignored and must never be committed — it contains the real → dummy mapping in plaintext.

## Why the scrub script lives in `sandbox/`

The script has to contain the real PII strings to do substitution. That makes it inherently un-commit-safe. `sandbox/` is gitignored at the directory level and `check-secrets.sh` blocks any staged `sandbox/*` path, so even accidentally staging it would fail at commit time.

This is the standard pattern for "cleaned artifacts committed, cleaning logic local-only." See `CLAUDE.md` "Security constraints" and `sandbox/README.md`.
