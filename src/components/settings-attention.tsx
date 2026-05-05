"use client";

import type { LucideIcon } from "lucide-react";
import { BookX, CheckCircle2, CircleDashed, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { useT } from "@/components/shell/locale-provider";
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
  labelKey: string;
  descKey: string;
}> = [
  {
    icon: BookX,
    className: "text-attention",
    labelKey: "settings.attention.icons.missingRecent.label",
    descKey: "settings.attention.icons.missingRecent.desc",
  },
  {
    icon: BookX,
    className: "text-muted-foreground",
    labelKey: "settings.attention.icons.missingOlder.label",
    descKey: "settings.attention.icons.missingOlder.desc",
  },
  {
    icon: TrendingDown,
    className: "text-attention/70",
    labelKey: "settings.attention.icons.lowRecent.label",
    descKey: "settings.attention.icons.lowRecent.desc",
  },
  {
    icon: TrendingDown,
    className: "text-muted-foreground",
    labelKey: "settings.attention.icons.lowOlder.label",
    descKey: "settings.attention.icons.lowOlder.desc",
  },
  {
    icon: CheckCircle2,
    className: "text-meeting",
    labelKey: "settings.attention.icons.meeting.label",
    descKey: "settings.attention.icons.meeting.desc",
  },
  {
    icon: CircleDashed,
    className: "text-muted-foreground",
    labelKey: "settings.attention.icons.notGraded.label",
    descKey: "settings.attention.icons.notGraded.desc",
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
  const t = useT();
  const [cfg, setCfg] = useState<AttentionConfig>({
    forgivenessWeeks: DEFAULT_FORGIVENESS_WEEKS,
    lowScoreThreshold: DEFAULT_LOW_SCORE_THRESHOLD,
  });
  const [weeksInput, setWeeksInput] = useState(String(DEFAULT_FORGIVENESS_WEEKS));
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_LOW_SCORE_THRESHOLD));

  useEffect(() => {
    void Promise.all([getSettingString(WEEKS_KEY, ""), getSettingString(THRESHOLD_KEY, "")]).then(
      ([w, th]) => {
        const parsed = parseAttentionConfig(w, th);
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
    <div className="space-y-5">
      <SettingsSection
        title={t("settings.attention.forgiveness.title")}
        help={t("settings.attention.forgiveness.help")}
      >
        <div className="flex items-center gap-2">
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
            aria-label={t("settings.attention.forgiveness.ariaLabel")}
            className="h-8 w-20 rounded-md border border-input bg-card px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <span className="text-[12px] text-muted-foreground">
            {t("settings.attention.forgiveness.unit")}
          </span>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.attention.threshold.title")}
        help={t("settings.attention.threshold.help")}
      >
        <div className="flex items-center gap-2">
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
            aria-label={t("settings.attention.threshold.ariaLabel")}
            className="h-8 w-20 rounded-md border border-input bg-card px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <span className="text-[12px] text-muted-foreground">
            {t("settings.attention.threshold.unit")}
          </span>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.attention.icons.title")}
        help={t("settings.attention.icons.help")}
      >
        <div className="space-y-2">
          {ICON_REFERENCE.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.labelKey} className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${row.className}`} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{t(row.labelKey)}</p>
                  <p className="text-[12px] text-muted-foreground">{t(row.descKey)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}
