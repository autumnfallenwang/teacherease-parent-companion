// Pure decision logic for the updater banner (R2). No platform imports — safe
// to unit-test in isolation.

export interface BannerDecisionInput {
  update: { version: string } | null;
  enabled: boolean;
  dismissedVersion: string | null;
}

export function shouldShowBanner(input: BannerDecisionInput): boolean {
  if (!input.enabled) return false;
  if (!input.update) return false;
  if (input.dismissedVersion === input.update.version) return false;
  return true;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldCheckNow(lastCheckedMs: number, nowMs: number): boolean {
  const delta = nowMs - lastCheckedMs;
  if (delta < 0) return false;
  return delta >= DAY_MS;
}

// The updater endpoint returns 404 / empty body until a release is actually
// published with a `latest.json` asset. Treat those as "up to date" so casual
// callers don't surface a scary error chip just because no release exists yet.
// Genuine network / auth errors still surface as errors to callers that care.
export function isNoReleaseYetError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("did not respond with a successful status code") ||
    m.includes("could not fetch a valid release json") ||
    m.includes("404") ||
    m.includes("not found")
  );
}
