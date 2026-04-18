// TeacherEase login flow. Not classic ASP.NET WebForms postback — the login
// form is a regular HTML form with a per-request CSRF token (the marketing
// grade pages may still be WebForms, to be handled in T9/T10).
//
// Flow:
//   1. GET {baseUrl}/common/login.aspx to pick up hidden fields + session cookie.
//   2. POST {baseUrl}/app/Login/Login with hidden fields + email + password.
//   3. Success → 302 redirect to the authenticated dashboard. Failure → 200
//      with an error message rendered into the login page body.
//
// See design-plan.md Q1 (plain HTTP, no browser) and Q11 (scraper bundled
// into the frontend, called from React via Tauri IPC wrapper). This module
// stays a pure TypeScript module with zero platform imports per the
// "Forward compatibility" rules.

import * as cheerio from "cheerio";
import { CookieJar } from "./cookie-jar";
import { type FetchImpl, type LoginCredentials, LoginError, type Session } from "./types";

// Locked from tests/fixtures/login-page.html (captured 2026-04-15).
const LOGIN_PAGE_PATH = "/common/login.aspx";
const LOGIN_POST_PATH = "/app/Login/Login";

// Identifiable User-Agent so TeacherEase can contact us if needed.
// Links to the public repo for transparency.
export const USER_AGENT =
  "TeacherEaseParentCompanion/0.1.0 (+https://github.com/autumnfallenwang/teacherease-parent-companion)";

// Credential field names — simple, not WebForms-style.
const FIELD_EMAIL = "email";
const FIELD_PASSWORD = "password";

/**
 * Detects "the server bounced us back to the login page" — the signal for
 * bad credentials when the HTTP layer auto-follows redirects (which Tauri's
 * plugin-http / reqwest does regardless of `redirect: "manual"`). Matches
 * both `/common/login.aspx` and `/app/Login/...` paths case-insensitively.
 */
function isLoginPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith("/login.aspx") || path.includes("/login/");
  } catch {
    return false;
  }
}

/**
 * Log in to TeacherEase and return an authenticated session. Throws
 * LoginError on wrong credentials, portal errors, or unexpected HTTP
 * responses — all error messages are user-presentable.
 *
 * `fetchImpl` is parameterized so tests can mock it and the production
 * caller can later swap in Tauri's http-plugin fetch without touching this
 * function.
 */
export async function login(
  baseUrl: string,
  credentials: LoginCredentials,
  fetchImpl: FetchImpl = fetch,
): Promise<Session> {
  const jar = new CookieJar();
  const pageUrl = new URL(LOGIN_PAGE_PATH, baseUrl).toString();
  const postUrl = new URL(LOGIN_POST_PATH, baseUrl).toString();

  // Step 1: GET the login page to pick up hidden fields and any initial
  // session cookies the server wants us to echo back.
  let pageRes: Response;
  try {
    pageRes = await fetchImpl(pageUrl, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (err) {
    throw new LoginError("Couldn't reach TeacherEase. Check your internet connection.", {
      cause: err,
    });
  }
  if (!pageRes.ok) {
    throw new LoginError(`Couldn't load the login page (HTTP ${pageRes.status}).`);
  }
  jar.absorb(pageRes.headers.getSetCookie());
  const hiddenFields = extractLoginFormFields(await pageRes.text());

  // Step 2: POST credentials + hidden fields to the form's action URL.
  const body = buildLoginFormBody(hiddenFields, credentials);
  let loginRes: Response;
  try {
    loginRes = await fetchImpl(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Cookie: jar.header(),
      },
      body,
      // Don't follow the redirect automatically — the 302 IS the success
      // signal, and following it would give us a 200 we'd then have to
      // heuristically distinguish from a failed-login 200.
      redirect: "manual",
    });
  } catch (err) {
    throw new LoginError("Couldn't reach TeacherEase. Check your internet connection.", {
      cause: err,
    });
  }
  jar.absorb(loginRes.headers.getSetCookie());

  // Success: 302 → /App/Parents/... or similar authenticated URL.
  // `manual` redirect mode also surfaces as `type === "opaqueredirect"` with
  // status 0 in some fetch implementations (browsers). Handle both shapes.
  const isRedirect =
    loginRes.status === 302 || loginRes.status === 303 || loginRes.type === "opaqueredirect";
  if (isRedirect) {
    return { baseUrl, cookieHeader: jar.header() };
  }

  // With plugin-http / reqwest the 302 is auto-followed, so the success
  // signal we actually see here is a 200 response whose final URL is
  // somewhere other than the login page. Bounce back to the login page =
  // bad credentials.
  if (loginRes.status === 200) {
    if (isLoginPageUrl(loginRes.url)) {
      throw new LoginError("Couldn't log in to TeacherEase. Double-check your email and password.");
    }
    return { baseUrl, cookieHeader: jar.header() };
  }

  throw new LoginError(`TeacherEase login failed (HTTP ${loginRes.status}).`);
}

/**
 * Parse every `<input type="hidden">` inside the login form into a name→value
 * map. Exported for unit testing.
 */
export function extractLoginFormFields(html: string): Record<string, string> {
  const doc = cheerio.load(html);
  const fields: Record<string, string> = {};
  // biome-ignore lint/security/noSecrets: CSS selector, not a secret
  doc('form input[type="hidden"]').each((_i, el) => {
    const name = doc(el).attr("name");
    if (!name) return;
    fields[name] = doc(el).attr("value") ?? "";
  });
  return fields;
}

/**
 * URL-encode the hidden fields + credentials into a form-encoded POST body.
 * Exported for unit testing.
 */
export function buildLoginFormBody(
  hiddenFields: Record<string, string>,
  credentials: LoginCredentials,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(hiddenFields)) {
    params.set(k, v);
  }
  params.set(FIELD_EMAIL, credentials.username);
  params.set(FIELD_PASSWORD, credentials.password);
  return params.toString();
}
