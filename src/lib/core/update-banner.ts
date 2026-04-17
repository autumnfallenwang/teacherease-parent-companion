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
