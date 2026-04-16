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
 * Thrown when login fails — wrong credentials, portal down, parser broken,
 * or an unexpected HTTP response shape. The message is user-presentable.
 */
export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginError";
  }
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
