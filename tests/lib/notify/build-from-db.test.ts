import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildHeroCounts } from "@/lib/notify/digest";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";

vi.mock("@/lib/ipc", () => ({
  getAttentionConfig: vi.fn(async () => ({ forgivenessWeeks: 2, lowScoreThreshold: 3 })),
  getHomeworkForDay: vi.fn(async () => []),
}));

vi.mock("@/lib/hero-statuses", () => ({
  loadHeroStatuses: vi.fn(),
}));

const { getHomeworkForDay } = await import("@/lib/ipc");
const { loadHeroStatuses } = await import("@/lib/hero-statuses");
const { buildDigestFromDb } = await import("@/lib/notify/build-from-db");

function makeChild(id: number, name: string, homeworkUrl: string | null = null): ChildRecord {
  return {
    id,
    displayName: name,
    portalType: "teacherease",
    baseUrl: "https://school.example.com",
    username: `user${id}@example.com`,
    grade: null,
    school: null,
    homeworkUrl,
    createdAt: "2026-01-01 00:00:00",
  };
}

function emptyHero(children: readonly ChildRecord[]) {
  const perChildDetails = new Map<number, ClassDetails[]>();
  const perChildHeroCounts = new Map<number, ChildHeroCounts>();
  for (const c of children) {
    perChildDetails.set(c.id, []);
    perChildHeroCounts.set(c.id, { meetingCount: 0, notAssessedCount: 0 });
  }
  return { statuses: [], perChildDetails, perChildHeroCounts };
}

describe("buildDigestFromDb", () => {
  beforeEach(() => {
    vi.mocked(getHomeworkForDay).mockReset();
    vi.mocked(getHomeworkForDay).mockResolvedValue([]);
    vi.mocked(loadHeroStatuses).mockReset();
  });

  it("produces a digest with hero counts from loadHeroStatuses output", async () => {
    const children = [makeChild(1, "Alex")];
    vi.mocked(loadHeroStatuses).mockResolvedValue({
      statuses: [],
      perChildDetails: new Map([[1, []]]),
      perChildHeroCounts: new Map([[1, { meetingCount: 5, notAssessedCount: 2 }]]),
    });

    const digest = await buildDigestFromDb(children, new Date(2026, 3, 19, 12));

    expect(digest.type).toBe("refreshDigest");
    expect(digest.children).toHaveLength(1);
    expect(digest.children[0]?.hero.meetingCount).toBe(5);
    expect(digest.children[0]?.hero.notAssessedCount).toBe(2);
    expect(digest.failures).toEqual([]);
  });

  it("skips getHomeworkForDay for children with no homeworkUrl", async () => {
    const children = [
      makeChild(1, "Alex", null),
      makeChild(2, "Ivy", "https://sites.google.com/x"),
    ];
    vi.mocked(loadHeroStatuses).mockResolvedValue(emptyHero(children));

    await buildDigestFromDb(children, new Date(2026, 3, 19, 12));

    expect(vi.mocked(getHomeworkForDay)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getHomeworkForDay).mock.calls[0]?.[0]).toBe(2);
  });

  it("carries failures = [] always (Q29 + D-18)", async () => {
    const children = [makeChild(1, "Alex")];
    vi.mocked(loadHeroStatuses).mockResolvedValue(emptyHero(children));

    const digest = await buildDigestFromDb(children, new Date(2026, 3, 19, 12));

    expect(digest.failures).toEqual([]);
  });
});
