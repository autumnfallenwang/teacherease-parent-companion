import { describe, expect, it } from "vitest";
import { renderEmail } from "@/lib/notify/email-templates";
import type { NotifyEvent } from "@/lib/notify/types";

describe("renderEmail / gradesAttention", () => {
  it("returns null when both counts are zero", () => {
    const event: NotifyEvent = {
      type: "gradesAttention",
      childName: "Alex",
      attentionCount: 0,
      missingCount: 0,
    };
    expect(renderEmail(event)).toBeNull();
  });

  it("subject includes child name", () => {
    const event: NotifyEvent = {
      type: "gradesAttention",
      childName: "Alex",
      attentionCount: 2,
      missingCount: 1,
    };
    expect(renderEmail(event)?.subject).toBe("Alex: Grade update");
  });

  it("textBody preserves the E1 plaintext contract", () => {
    const event: NotifyEvent = {
      type: "gradesAttention",
      childName: "Alex",
      attentionCount: 2,
      missingCount: 1,
    };
    expect(renderEmail(event)?.textBody).toBe("2 classes need attention, 1 missing assignment");
  });

  it("htmlBody contains child name and attention count phrase", () => {
    const event: NotifyEvent = {
      type: "gradesAttention",
      childName: "Alex",
      attentionCount: 3,
      missingCount: 0,
    };
    const html = renderEmail(event)?.htmlBody ?? "";
    expect(html).toContain("Alex");
    expect(html).toContain("3 classes need attention");
  });

  it("htmlBody escapes angle brackets in child name", () => {
    const event: NotifyEvent = {
      type: "gradesAttention",
      childName: "<script>evil()</script>",
      attentionCount: 1,
      missingCount: 0,
    };
    const html = renderEmail(event)?.htmlBody ?? "";
    expect(html).not.toContain("<script>evil()");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderEmail / newHomework", () => {
  it("returns null when subjectCount is zero", () => {
    const event: NotifyEvent = {
      type: "newHomework",
      childName: "Alex",
      isoDate: "2026-04-17",
      subjectCount: 0,
    };
    expect(renderEmail(event)).toBeNull();
  });

  it("subject includes child name", () => {
    const event: NotifyEvent = {
      type: "newHomework",
      childName: "Alex",
      isoDate: "2026-04-17",
      subjectCount: 3,
    };
    expect(renderEmail(event)?.subject).toBe("Alex: New homework");
  });

  it("textBody pluralizes correctly for >1 subjects", () => {
    const event: NotifyEvent = {
      type: "newHomework",
      childName: "Alex",
      isoDate: "2026-04-17",
      subjectCount: 3,
    };
    expect(renderEmail(event)?.textBody).toMatch(/^3 subjects posted for /);
  });

  it("textBody singularizes correctly for 1 subject", () => {
    const event: NotifyEvent = {
      type: "newHomework",
      childName: "Alex",
      isoDate: "2026-04-17",
      subjectCount: 1,
    };
    expect(renderEmail(event)?.textBody).toMatch(/^1 subject posted for /);
  });

  it("htmlBody contains the subject count", () => {
    const event: NotifyEvent = {
      type: "newHomework",
      childName: "Alex",
      isoDate: "2026-04-17",
      subjectCount: 3,
    };
    expect(renderEmail(event)?.htmlBody).toContain("3 subjects posted for");
  });
});

describe("renderEmail / fetchFailed", () => {
  it("always renders (never null)", () => {
    const event: NotifyEvent = {
      type: "fetchFailed",
      childName: "Alex",
      source: "teacherease",
      error: "Network timeout",
    };
    const rendered = renderEmail(event);
    expect(rendered).not.toBeNull();
    expect(rendered?.textBody).toBe("teacherease: Network timeout");
  });

  it("htmlBody escapes <script> injected into the error string", () => {
    const event: NotifyEvent = {
      type: "fetchFailed",
      childName: "Alex",
      source: "teacherease",
      error: "<script>alert(1)</script>",
    };
    const html = renderEmail(event)?.htmlBody ?? "";
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });

  it("htmlBody escapes angle brackets in the source name", () => {
    const event: NotifyEvent = {
      type: "fetchFailed",
      childName: "Alex",
      source: "<evil>",
      error: "boom",
    };
    const html = renderEmail(event)?.htmlBody ?? "";
    expect(html).not.toContain("<evil>");
    expect(html).toContain("&lt;evil&gt;");
  });
});
