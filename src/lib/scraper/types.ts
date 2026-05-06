// Shared types for the TeacherEase scraper. Pure module — no platform imports.
// See design-plan.md Q11 (scraper bundled into frontend) and "Forward
// compatibility" (this file must stay platform-agnostic so it can promote to
// packages/core/types.ts later without edits).

export interface LoginCredentials {
  readonly username: string;
  readonly password: string;
}

/**
 * An authenticated scraper session, scoped to a single scrape run. Not
 * persisted across scrapes — each run starts fresh. Holds the pre-built
 * Cookie header the rest of the scraper will send on authenticated requests.
 */
export interface Session {
  readonly baseUrl: string;
  readonly cookieHeader: string;
}

/**
 * Fetch implementation contract. Parameterized so tests can inject a mock
 * and the production caller can inject Tauri's http-plugin fetch without
 * touching the function body.
 */
export type FetchImpl = (url: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Login error codes. UI catch sites translate these via
 * `t(\`errors.scraper.login.${code}\`)`. Scraper stays pure (no t() import).
 *
 * - `noNetwork` — fetch threw (DNS, offline, etc.)
 * - `loginPageFetchFailed` — login page returned non-2xx (HTTP {status} in vars)
 * - `badCredentials` — server bounced us back to the login page
 * - `unexpectedStatus` — server replied with something we don't know how to read
 * - `unknown` — fallback used by call sites when nothing else matches
 */
export type LoginErrorCode =
  | "noNetwork"
  | "loginPageFetchFailed"
  | "badCredentials"
  | "unexpectedStatus"
  | "unknown";

/**
 * Thrown when login fails. Carries an error code (not English text) so the
 * UI can translate via the catalog. The base `Error.message` is set to the
 * code string for log readability.
 */
export class LoginError extends Error {
  readonly code: LoginErrorCode;
  /** Optional `{status}` interpolation value for `loginPageFetchFailed` /
   *  `unexpectedStatus` codes. */
  readonly status?: number;

  constructor(code: LoginErrorCode, options?: ErrorOptions & { status?: number }) {
    super(code, options);
    this.name = "LoginError";
    this.code = code;
    this.status = options?.status;
  }
}

/**
 * Homework-URL validation error codes (mirrors LoginErrorCode shape).
 *
 * - `invalidUrl` — `new URL()` threw
 * - `notGoogleSites` — hostname mismatch
 * - `unreachable` — fetch threw
 * - `unreachableHttp` — fetch returned non-2xx (status in vars)
 * - `notGoogleSitesPage` — fetched page lacks the homework-content selector
 */
export type HomeworkUrlErrorCode =
  | "invalidUrl"
  | "notGoogleSites"
  | "unreachable"
  | "unreachableHttp"
  | "notGoogleSitesPage";

export class HomeworkUrlError extends Error {
  readonly code: HomeworkUrlErrorCode;
  readonly status?: number;

  constructor(code: HomeworkUrlErrorCode, options?: ErrorOptions & { status?: number }) {
    super(code, options);
    this.name = "HomeworkUrlError";
    this.code = code;
    this.status = options?.status;
  }
}

// ---------------------------------------------------------------------------
// Child record (T13) — DB row shape, no password (lives in OS keychain)
// ---------------------------------------------------------------------------

export interface ChildRecord {
  readonly id: number;
  readonly displayName: string;
  readonly portalType: string;
  readonly baseUrl: string;
  readonly username: string;
  readonly grade: string | null;
  readonly school: string | null;
  readonly homeworkUrl: string | null;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Grades overview (T9)
// ---------------------------------------------------------------------------

export interface ClassOverview {
  readonly name: string;
  readonly instructor: string;
  readonly status: "meeting" | "needs_attention" | "not_assessed";
  readonly statusCode: number;
  readonly needsAttention: boolean;
  readonly targetsMeeting: number;
  readonly targetsNotMeeting: number;
  readonly totalTargets: number;
  readonly classId: number;
  readonly cgpId: number;
}

export interface GradesOverview {
  readonly classes: readonly ClassOverview[];
  readonly summary: {
    readonly totalClasses: number;
    readonly meetingExpectations: number;
    readonly needsAttention: number;
    readonly notAssessed: number;
    readonly totalTargetsMeeting: number;
    readonly totalTargetsNotMeeting: number;
  };
}

// ---------------------------------------------------------------------------
// Class detail (T10)
// ---------------------------------------------------------------------------

export interface Assignment {
  readonly testNameId: number;
  readonly dueDate: string;
  readonly name: string;
  readonly weight: string;
  readonly grade: string;
  readonly gradeNumeric: number;
  readonly gradeLetter: string;
  readonly isMissing: boolean;
  readonly feedback: string;
}

export interface Standard {
  readonly name: string;
  readonly score: string;
  readonly scoreNumeric: number;
  readonly scoreLetter: string;
  readonly isMeeting: boolean;
  readonly children: readonly Standard[];
  readonly assignments: readonly Assignment[];
  readonly missingCount: number;
  readonly lowScoreCount: number;
}

export interface ClassDetails {
  readonly className: string;
  readonly standards: readonly Standard[];
  readonly summary: {
    readonly missingAssignments: number;
  };
}

// ---------------------------------------------------------------------------
// Homework (H1) — Google Sites daily homework page
// ---------------------------------------------------------------------------

export interface HomeworkSubject {
  readonly name: string;
  readonly content: string;
  readonly dueDate: string | null;
}

export interface HomeworkEntry {
  readonly date: string;
  readonly subjects: readonly HomeworkSubject[];
}
