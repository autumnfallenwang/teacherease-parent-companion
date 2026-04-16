# Lessons

Corrections and patterns to avoid repeating. Append entries here whenever a user correction or a failed assumption would otherwise get lost.

## Format

```
## YYYY-MM-DD — Short title
**Context:** what we were doing
**Mistake:** what we assumed or did wrong
**Correction:** what the right thing is
**How to avoid next time:** the rule to apply
```

---

<!-- Entries below, newest first. -->

## 2026-04-15 — TeacherEase login is NOT classic ASP.NET WebForms

**Context:** T8 — writing the login flow. Design-plan Q1 warned about the ASP.NET `__VIEWSTATE` / `__EVENTVALIDATION` two-step dance as the "known caveat" of the fetch+cheerio approach.

**Mistake:** I assumed the login form would be classic WebForms postback with `ctl00$MainContent$txtEmail`-style field names, a `__VIEWSTATE` blob, and a `__EVENTVALIDATION` token. I also guessed the login URL was `/common/LoginParent.aspx`.

**Correction:** Captured the real login page via `sandbox/capture-login-page.ts`. The form is a **regular HTML form with CSRF protection**, not WebForms postback:
- GET URL is `/common/login.aspx` (lowercase, not `LoginParent.aspx`).
- POST action is `/app/Login/Login` (completely different path from the GET).
- Credential field names are the obvious `email` and `password` — not `ctl00$...`.
- Hidden fields are `ctlTE$TEContentPlaceHolder$__AntiCsrfToken` (CSRF, per-request), `fromResetPassword`, `LoginRequestID` (per-request GUID), `requestedServerApiVersion`, `targetPage`.
- No `__VIEWSTATE` or `__EVENTVALIDATION` anywhere on the login page.

The **grade pages may still be ASP.NET WebForms** — to verify in T9 when we actually fetch `grades-page.html` from the live portal. Q1's caveat might still apply there. Login is definitively NOT WebForms.

**How to avoid next time:**
1. Never guess server protocol shapes. Capture a real response and inspect it before writing the code — a 5-minute POC saves hours of wrong-path coding.
2. Don't conflate "the site is ASP.NET" with "every form is WebForms postback." Modern ASP.NET apps mix WebForms, MVC, and plain HTML forms on different pages of the same site.
3. When porting from a Playwright-based reference, the reference tells you almost nothing about the HTTP shape — Playwright abstracts away the form mechanics entirely. Treat the Python code as documentation of *intent* (what to scrape, what to parse), not *mechanism* (how to send it over the wire).

## 2026-04-15 — Fixtures from ref/logs are NOT from the same scrape session

**Context:** T9/T10 — writing grade overview and class detail parsers. Tests compared parser output against `full-data.json` expecting them to match.

**Mistake:** Assumed that `grades-page.html`, the 6 `*_details.html` files, and `full-data.json` in `ref/teacherease_parents_helper/logs/` were all from the same scrape run and would therefore agree on class lists, statuses, and missing-assignment counts.

**Correction:** The Python scraper overwrites its `logs/` files on every run. `grades-page.html` is from a LATER session than `full-data.json` — different classes (Computer Science 7 + Music 7 instead of Art 7 + Health Education 7), different instructor list (Zides, Lee not in the original scrub mapping), different status codes. The class detail fixtures are also from a different session — French 7 has 6 standards / 2 missing (fixture) vs 5 standards / 1 missing (full-data.json).

**How to avoid next time:**
1. Never assume files captured independently are from the same scrape. Verify by comparing class names, counts, and timestamps across all fixtures before asserting against "expected" output.
2. Build the PII scrub mapping from ALL fixtures, not just one JSON summary — different scrapes may have different instructors.
3. When writing parser tests, assert against values you've VERIFIED from the actual fixture HTML, not against a separate "expected" file that might be from a different session. `full-data.json` is a structural reference (what the output SHAPE should look like), not a ground-truth oracle for specific values.
