"use client";

import type { LucideIcon } from "lucide-react";
import { BookX, CheckCircle2, CircleDashed, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type AttentionConfig,
  DEFAULT_FORGIVENESS_WEEKS,
  DEFAULT_LOW_SCORE_THRESHOLD,
  parseAttentionConfig,
} from "@/lib/core/attention-engine";
import { getSettingString, log, logErr, setSettingString } from "@/lib/ipc";

// Read-only icon legend (D-04). Mirrors `resolveAssignmentIcon` in standards-
// tree.tsx — if that resolver changes, update this array to keep them in sync.
const ICON_REFERENCE: Array<{
  icon: LucideIcon;
  className: string;
  label: string;
  description: string;
}> = [
  {
    icon: BookX,
    className: "text-attention",
    label: "Missing (recent)",
    description: "Assignment flagged as not turned in, within the forgiveness window.",
  },
  {
    icon: BookX,
    className: "text-muted-foreground",
    label: "Missing (older)",
    description: "Missing item past the forgiveness window — no longer demanding action.",
  },
  {
    icon: TrendingDown,
    className: "text-attention/70",
    label: "Low score (recent)",
    description: "Graded below the low-score threshold, within the forgiveness window.",
  },
  {
    icon: TrendingDown,
    className: "text-muted-foreground",
    label: "Low score (older)",
    description: "Low-score item past the forgiveness window.",
  },
  {
    icon: CheckCircle2,
    className: "text-meeting",
    label: "Meeting",
    description: "Graded at or above the threshold — no attention needed.",
  },
  {
    icon: CircleDashed,
    className: "text-muted-foreground",
    label: "Not graded",
    description: "Posted to the gradebook but no score entered yet (upcoming or pending).",
  },
];

const WEEKS_KEY = "attention.forgivenessWeeks";
const THRESHOLD_KEY = "attention.lowScoreThreshold";
// Dispatched on save for future live-refresh wiring.  AT5 itself doesn't wire
// listeners — Next.js App Router remounts the dashboard / classes views on
// route navigation, so returning from Settings → Attention triggers a fresh
// loadData → fresh getAttentionConfig() naturally.
const EVENT_NAME = "attention-config-change";

export function SettingsAttention() {
  const [cfg, setCfg] = useState<AttentionConfig>({
    forgivenessWeeks: DEFAULT_FORGIVENESS_WEEKS,
    lowScoreThreshold: DEFAULT_LOW_SCORE_THRESHOLD,
  });
  const [weeksInput, setWeeksInput] = useState(String(DEFAULT_FORGIVENESS_WEEKS));
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_LOW_SCORE_THRESHOLD));

  useEffect(() => {
    void Promise.all([getSettingString(WEEKS_KEY, ""), getSettingString(THRESHOLD_KEY, "")]).then(
      ([w, t]) => {
        const parsed = parseAttentionConfig(w, t);
        setCfg(parsed);
        setWeeksInput(String(parsed.forgivenessWeeks));
        setThresholdInput(String(parsed.lowScoreThreshold));
      },
    );
  }, []);

  const saveConfig = async (next: AttentionConfig) => {
    setCfg(next);
    setWeeksInput(String(next.forgivenessWeeks));
    setThresholdInput(String(next.lowScoreThreshold));
    try {
      await setSettingString(WEEKS_KEY, String(next.forgivenessWeeks));
      await setSettingString(THRESHOLD_KEY, String(next.lowScoreThreshold));
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
      await log(
        `settings: attention weeks=${next.forgivenessWeeks} threshold=${next.lowScoreThreshold}`,
      );
    } catch (e) {
      await logErr(
        `settings: attention save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  };

  const commitWeeks = () => {
    const next = parseAttentionConfig(weeksInput, String(cfg.lowScoreThreshold));
    if (next.forgivenessWeeks === cfg.forgivenessWeeks) {
      // Invalid (or unchanged) — revert display to the current saved value.
      setWeeksInput(String(cfg.forgivenessWeeks));
      return;
    }
    void saveConfig(next);
  };

  const commitThreshold = () => {
    const next = parseAttentionConfig(String(cfg.forgivenessWeeks), thresholdInput);
    if (next.lowScoreThreshold === cfg.lowScoreThreshold) {
      setThresholdInput(String(cfg.lowScoreThreshold));
      return;
    }
    void saveConfig(next);
  };

  return (
    <div className="space-y-6">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        These control how aggressive the app's attention signal is. They don't change TeacherEase's
        grade calculations — they shape the <code>!</code> / <code>✓</code> layer the app overlays
        on top.
      </p>

      <div className="space-y-2">
        <h2 className="text-[14px] font-medium">Forgiveness window</h2>
        <p className="text-[12px] text-muted-foreground">
          How long a missing or low-score item keeps demanding attention before quietly aging into
          the "Older" list. Default 2 weeks.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <input
            type="number"
            min={1}
            max={12}
            step={1}
            value={weeksInput}
            onChange={(e) => setWeeksInput(e.target.value)}
            onBlur={commitWeeks}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitWeeks();
              }
            }}
            aria-label="Forgiveness window in weeks"
            className="h-8 w-20 rounded-md border border-input bg-card px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <span className="text-[12px] text-muted-foreground">
            weeks (1–12, press Enter to apply)
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-[14px] font-medium">Low-score threshold</h2>
        <p className="text-[12px] text-muted-foreground">
          Numeric scores strictly below this count as attention-worthy. TeacherEase's rubric caps at
          3 (Meeting); default is 3.0 so anything below Meeting counts. Lower to 2.0 if you only
          want to flag clearly-below-Progressing.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <input
            type="number"
            min={0}
            max={4}
            step={0.5}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            onBlur={commitThreshold}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitThreshold();
              }
            }}
            aria-label="Low-score threshold"
            className="h-8 w-20 rounded-md border border-input bg-card px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <span className="text-[12px] text-muted-foreground">(0.0–4.0, press Enter to apply)</span>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-[14px] font-medium">Icon reference</h2>
        <p className="text-[12px] text-muted-foreground">
          What the icons in the Classes drilldown mean.
        </p>
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {ICON_REFERENCE.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.label} className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${row.className}`} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{row.label}</p>
                  <p className="text-[12px] text-muted-foreground">{row.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
