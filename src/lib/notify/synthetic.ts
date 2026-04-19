// Synthetic RefreshDigest used by the "Send test" buttons in Settings →
// Notifications / Email. Shapes identical to a real digest so the test
// path exercises the real channel.send() renderer. Names are obviously
// placeholder ("Sample Student A/B") — a parent can't confuse the preview
// with real child data.

import type { AttentionItem } from "@/lib/core/attention-engine";
import type { HomeworkRecord } from "@/lib/ipc";
import { toLocalIso } from "./digest";
import type { RefreshDigest } from "./types";

function sampleAttentionItem(overrides: {
  className: string;
  assignmentName: string;
  reason: "missing" | "lowScore";
  ageDays: number;
}): AttentionItem {
  return {
    reason: overrides.reason,
    className: overrides.className,
    ageDays: overrides.ageDays,
    withinWindow: true,
    assignment: {
      testNameId: -1,
      name: overrides.assignmentName,
      dueDate: "",
      weight: "",
      grade: overrides.reason === "lowScore" ? "1=B" : "",
      gradeLetter: overrides.reason === "lowScore" ? "B" : "",
      gradeNumeric: overrides.reason === "lowScore" ? 1 : 0,
      isMissing: overrides.reason === "missing",
      feedback: "",
    },
  };
}

function sampleHomework(
  childId: number,
  hwDate: string,
  subject: string,
  content: string,
  dueDate: string | null = null,
): HomeworkRecord {
  return {
    id: -(childId * 100 + subject.length),
    childId,
    hwDate,
    subject,
    content,
    dueDate,
    dueDateInferred: false,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Build a deterministic synthetic digest so the "Send test" buttons fire
 * something realistic through the real channel renderers.
 */
export function buildSyntheticDigest(now: Date = new Date()): RefreshDigest {
  const todayLocal = toLocalIso(now);

  return {
    type: "refreshDigest",
    generatedAt: now.getTime(),
    todayLocal,
    family: {
      childCount: 2,
      attentionCount: 2,
      meetingCount: 11,
      notAssessedCount: 1,
      homeworkForTodayCount: 2,
      homeworkDueTodayCount: 1,
    },
    children: [
      {
        childId: -1,
        childName: "Sample Student A",
        hero: {
          attentionCount: 2,
          attentionClassNames: ["Math", "English"],
          meetingCount: 6,
          notAssessedCount: 0,
        },
        attention: [
          sampleAttentionItem({
            className: "Math",
            assignmentName: "Chapter 4 quiz",
            reason: "missing",
            ageDays: 3,
          }),
          sampleAttentionItem({
            className: "English",
            assignmentName: "Reading response",
            reason: "lowScore",
            ageDays: 1,
          }),
        ],
        homeworkConfigured: true,
        homeworkForToday: [
          sampleHomework(-1, todayLocal, "Math", "Finish problem set 4.2", todayLocal),
          sampleHomework(-1, todayLocal, "English", "Read chapter 5"),
        ],
        homeworkDueToday: [
          sampleHomework(-1, todayLocal, "Math", "Finish problem set 4.2", todayLocal),
        ],
      },
      {
        childId: -2,
        childName: "Sample Student B",
        hero: {
          attentionCount: 0,
          attentionClassNames: [],
          meetingCount: 5,
          notAssessedCount: 1,
        },
        attention: [],
        homeworkConfigured: true,
        homeworkForToday: [],
        homeworkDueToday: [sampleHomework(-2, todayLocal, "Science", "Lab write-up", todayLocal)],
      },
    ],
    failures: [],
  };
}
