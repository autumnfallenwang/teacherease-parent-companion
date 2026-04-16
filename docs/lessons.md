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
