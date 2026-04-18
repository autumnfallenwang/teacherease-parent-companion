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
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LoginError";
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
