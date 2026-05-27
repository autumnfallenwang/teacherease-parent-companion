"use client";

// Unified Notifications panel (Phase 19 CF5 + Phase 21 NS7). Absorbs the
// old "Email" sub-tab so every output channel lives in one place. Schedule
// section mirrors Settings → Fetch exactly (N×/day + first-slot-at +
// Skip-weekends) per Q31.

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { SettingsEmailSection } from "@/components/settings-email-section";
import { useLocale, useT } from "@/components/shell/locale-provider";
import { SCHEDULES_CHANGED_EVENT, SEND_DIGEST_NOW_EVENT } from "@/components/shell/schedulers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDateTime, formatRelative, type Locale } from "@/lib/i18n";
import {
  getSettingBool,
  getSettingString,
  log,
  logErr,
  setSettingBool,
  setSettingString,
} from "@/lib/ipc";
import { formatSlotMinutes } from "@/lib/schedule/fetch-schedule";
import {
  computeNotifyNextRun,
  computeNotifySlots,
  NOTIFY_FIRST_SLOT_DEFAULT,
  NOTIFY_RUNS_PER_DAY_DEFAULT,
  NOTIFY_RUNS_PER_DAY_MAX,
  NOTIFY_RUNS_PER_DAY_MIN,
  parseNotifyFirstSlot,
  parseNotifyRunsPerDay,
} from "@/lib/schedule/notify-schedule";
import { isWeekend } from "@/lib/schedule/weekday";

const OS_KEY = "notify.refreshDigest.os";
const OS_DEFAULT_ENABLED = true;
const NOTIFY_RUNS_PER_DAY_KEY = "notify.runsPerDay";
const NOTIFY_FIRST_SLOT_KEY = "notify.firstSlotAt";
const NOTIFY_WEEKDAYS_ONLY_KEY = "notify.weekdaysOnly";
const NOTIFY_FETCH_BEFORE_KEY = "notify.fetchBeforeDispatch";
const NOTIFY_FETCH_BEFORE_DEFAULT = true;
const NOTIFY_CATCHUP_KEY = "notify.catchupOnMiss";
const NOTIFY_CATCHUP_DEFAULT = true;
const NOTIFY_NEXT_RUN_KEY = "notify.nextRunAt";

function formatLocal(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDateTime(locale, d);
}

export function SettingsNotifications() {
  const locale = useLocale();
  const t = useT();
  const [osEnabled, setOsEnabled] = useState<boolean>(OS_DEFAULT_ENABLED);

  const [runsPerDay, setRunsPerDay] = useState<number>(NOTIFY_RUNS_PER_DAY_DEFAULT);
  const [runsDraft, setRunsDraft] = useState<string>(String(NOTIFY_RUNS_PER_DAY_DEFAULT));
  const [firstSlotAt, setFirstSlotAt] = useState<string>(NOTIFY_FIRST_SLOT_DEFAULT);
  const [firstSlotDraft, setFirstSlotDraft] = useState<string>(NOTIFY_FIRST_SLOT_DEFAULT);
  const [weekdaysOnly, setWeekdaysOnly] = useState<boolean>(false);
  const [fetchBefore, setFetchBefore] = useState<boolean>(NOTIFY_FETCH_BEFORE_DEFAULT);
  const [catchup, setCatchup] = useState<boolean>(NOTIFY_CATCHUP_DEFAULT);
  const [notifyNextRunAt, setNotifyNextRunAt] = useState<string | null>(null);

  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestResult, setDigestResult] = useState<{ kind: "ok" | "err"; message: string } | null>(
    null,
  );

  const reloadNextRun = useCallback(async () => {
    const iso = await getSettingString(NOTIFY_NEXT_RUN_KEY, "");
    setNotifyNextRunAt(iso || null);
  }, []);

  useEffect(() => {
    void (async () => {
      const [os, rawRuns, rawSlot, wd, fb, cu] = await Promise.all([
        getSettingBool(OS_KEY, OS_DEFAULT_ENABLED),
        getSettingString(NOTIFY_RUNS_PER_DAY_KEY, String(NOTIFY_RUNS_PER_DAY_DEFAULT)),
        getSettingString(NOTIFY_FIRST_SLOT_KEY, NOTIFY_FIRST_SLOT_DEFAULT),
        getSettingBool(NOTIFY_WEEKDAYS_ONLY_KEY, false),
        getSettingBool(NOTIFY_FETCH_BEFORE_KEY, NOTIFY_FETCH_BEFORE_DEFAULT),
        getSettingBool(NOTIFY_CATCHUP_KEY, NOTIFY_CATCHUP_DEFAULT),
      ]);
      setOsEnabled(os);
      const parsedRuns = parseNotifyRunsPerDay(rawRuns);
      const parsedSlot = parseNotifyFirstSlot(rawSlot);
      setRunsPerDay(parsedRuns);
      setRunsDraft(String(parsedRuns));
      setFirstSlotAt(parsedSlot);
      setFirstSlotDraft(parsedSlot);
      setWeekdaysOnly(wd);
      setFetchBefore(fb);
      setCatchup(cu);
      await reloadNextRun();
    })();
  }, [reloadNextRun]);

  const toggleOs = async (next: boolean) => {
    await setSettingBool(OS_KEY, next);
    await log(`settings: ${OS_KEY}=${next ? 1 : 0}`);
    setOsEnabled(next);
  };

  const commitRunsPerDay = () => {
    const parsed = parseNotifyRunsPerDay(runsDraft);
    setRunsDraft(String(parsed));
    if (parsed === runsPerDay) return;
    setRunsPerDay(parsed);
    void (async () => {
      try {
        await setSettingString(NOTIFY_RUNS_PER_DAY_KEY, String(parsed));
        await log(`settings: ${NOTIFY_RUNS_PER_DAY_KEY}=${parsed}`);
        window.dispatchEvent(new CustomEvent(SCHEDULES_CHANGED_EVENT));
        setTimeout(() => void reloadNextRun(), 500);
      } catch (e) {
        await logErr(
          `settings: notify.runsPerDay save failed — ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    })();
  };

  const commitFirstSlot = () => {
    const parsed = parseNotifyFirstSlot(firstSlotDraft);
    setFirstSlotDraft(parsed);
    if (parsed === firstSlotAt) return;
    setFirstSlotAt(parsed);
    void (async () => {
      try {
        await setSettingString(NOTIFY_FIRST_SLOT_KEY, parsed);
        await log(`settings: ${NOTIFY_FIRST_SLOT_KEY}=${parsed}`);
        window.dispatchEvent(new CustomEvent(SCHEDULES_CHANGED_EVENT));
        setTimeout(() => void reloadNextRun(), 500);
      } catch (e) {
        await logErr(
          `settings: notify.firstSlotAt save failed — ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    })();
  };

  const toggleWeekdays = async (next: boolean) => {
    setWeekdaysOnly(next);
    try {
      await setSettingBool(NOTIFY_WEEKDAYS_ONLY_KEY, next);
      await log(`settings: ${NOTIFY_WEEKDAYS_ONLY_KEY}=${next ? 1 : 0}`);
      window.dispatchEvent(new CustomEvent(SCHEDULES_CHANGED_EVENT));
      setTimeout(() => void reloadNextRun(), 500);
    } catch (e) {
      await logErr(
        `settings: notify.weekdaysOnly save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  };

  const toggleFetchBefore = async (next: boolean) => {
    setFetchBefore(next);
    try {
      await setSettingBool(NOTIFY_FETCH_BEFORE_KEY, next);
      await log(`settings: ${NOTIFY_FETCH_BEFORE_KEY}=${next ? 1 : 0}`);
    } catch (e) {
      await logErr(
        `settings: notify.fetchBeforeDispatch save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  };

  const toggleCatchup = async (next: boolean) => {
    setCatchup(next);
    try {
      await setSettingBool(NOTIFY_CATCHUP_KEY, next);
      await log(`settings: ${NOTIFY_CATCHUP_KEY}=${next ? 1 : 0}`);
    } catch (e) {
      await logErr(
        `settings: notify.catchupOnMiss save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  };

  const handleSendDigestNow = () => {
    setSendingDigest(true);
    setDigestResult(null);
    window.dispatchEvent(new CustomEvent(SEND_DIGEST_NOW_EVENT));
    setTimeout(() => {
      setSendingDigest(false);
      setDigestResult({
        kind: "ok",
        message: t("settings.notifications.send.dispatched"),
      });
      setTimeout(() => setDigestResult(null), 5000);
    }, 1500);
  };

  // Chip view: chronological list with "(tomorrow)" / "(Mon)" tags per slot.
  // When weekdaysOnly is on and "today" is Sat/Sun, show Monday's slots.
  const slotView = useMemo(() => {
    const raw = computeNotifySlots(runsPerDay, firstSlotAt);
    const now = new Date();
    const showMondayInstead = weekdaysOnly && isWeekend(now);
    if (showMondayInstead) {
      return [...raw].sort((a, b) => a - b).map((mins) => ({ mins, rollover: true as const }));
    }
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const todaySlots = [...raw].filter((s) => s > nowMins).sort((a, b) => a - b);
    const tomorrowSlots = [...raw].filter((s) => s <= nowMins).sort((a, b) => a - b);
    return [
      ...todaySlots.map((mins) => ({ mins, rollover: false as const })),
      ...tomorrowSlots.map((mins) => ({ mins, rollover: true as const })),
    ];
  }, [runsPerDay, firstSlotAt, weekdaysOnly]);

  const rolloverLabel = useMemo(() => {
    const now = new Date();
    return weekdaysOnly && isWeekend(now)
      ? t("settings.fetch.schedule.mondayShort")
      : t("settings.fetch.schedule.tomorrow");
  }, [weekdaysOnly, t]);

  const nextSlotMins = useMemo(() => {
    const d = computeNotifyNextRun(new Date(), runsPerDay, firstSlotAt, weekdaysOnly);
    return d.getHours() * 60 + d.getMinutes();
  }, [runsPerDay, firstSlotAt, weekdaysOnly]);

  return (
    <div className="space-y-5">
      <SettingsSection
        title={t("settings.notifications.desktop.title")}
        help={t("settings.notifications.desktop.help")}
        card={false}
      >
        <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">
                {t("settings.notifications.desktop.osDigestTitle")}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {t("settings.notifications.desktop.osDigestDesc")}
              </p>
            </div>
            <Switch
              checked={osEnabled}
              onChange={(next) => {
                void toggleOs(next);
              }}
              aria-label={t("settings.notifications.desktop.osDigestAria")}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.notifications.email.title")}
        help={t("settings.notifications.email.help")}
        card={false}
      >
        <SettingsEmailSection />
      </SettingsSection>

      <SettingsSection
        title={t("settings.notifications.schedule.title")}
        help={t("settings.notifications.schedule.help")}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="notify-runs-per-day" className="text-[13px]">
                {t("settings.notifications.schedule.runsPerDay", {
                  min: NOTIFY_RUNS_PER_DAY_MIN,
                  max: NOTIFY_RUNS_PER_DAY_MAX,
                })}
              </Label>
              <Input
                id="notify-runs-per-day"
                type="number"
                min={NOTIFY_RUNS_PER_DAY_MIN}
                max={NOTIFY_RUNS_PER_DAY_MAX}
                value={runsDraft}
                onChange={(e) => setRunsDraft(e.target.value)}
                onBlur={commitRunsPerDay}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitRunsPerDay();
                  }
                }}
                className="h-9 w-24 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notify-first-slot" className="text-[13px]">
                {t("settings.notifications.schedule.firstSlot")}
              </Label>
              <Input
                id="notify-first-slot"
                type="time"
                value={firstSlotDraft}
                onChange={(e) => setFirstSlotDraft(e.target.value)}
                onBlur={commitFirstSlot}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitFirstSlot();
                  }
                }}
                className="h-9 w-32 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("settings.notifications.schedule.timeSlots")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {slotView.map(({ mins, rollover }) => {
                const isNext = !rollover && mins === nextSlotMins;
                return (
                  <span
                    key={`${mins}-${rollover ? "r" : "t"}`}
                    className={`rounded-full border px-2.5 py-1 text-[12px] tabular-nums ${
                      isNext
                        ? "border-primary bg-primary/10 font-semibold text-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {formatSlotMinutes(mins)}
                    {rollover && (
                      <span className="ml-1 text-[10px] opacity-70">{rolloverLabel}</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Switch
              checked={weekdaysOnly}
              onChange={(next) => {
                void toggleWeekdays(next);
              }}
              aria-label={t("settings.notifications.schedule.skipWeekendsAria")}
            />
            <span className="text-[13px]">{t("settings.notifications.schedule.skipWeekends")}</span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Switch
              checked={fetchBefore}
              onChange={(next) => {
                void toggleFetchBefore(next);
              }}
              aria-label={t("settings.notifications.schedule.fetchFreshAria")}
            />
            <span className="text-[13px]">{t("settings.notifications.schedule.fetchFresh")}</span>
          </div>

          <div className="flex items-start gap-3 pt-1">
            <Switch
              checked={catchup}
              onChange={(next) => {
                void toggleCatchup(next);
              }}
              aria-label={t("settings.notifications.schedule.catchupAria")}
            />
            <div className="flex-1">
              <p className="text-[13px]">{t("settings.notifications.schedule.catchup")}</p>
              <p className="text-[12px] text-muted-foreground">
                {t("settings.notifications.schedule.catchupHelp")}
              </p>
            </div>
          </div>

          <p className="text-[12px] text-muted-foreground">
            {t("settings.notifications.schedule.nextRun")}{" "}
            <span className="font-medium text-foreground">
              {formatLocal(notifyNextRunAt, locale)}
            </span>
            {notifyNextRunAt && formatRelative(locale, notifyNextRunAt) && (
              <span className="ml-1.5">({formatRelative(locale, notifyNextRunAt)})</span>
            )}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.notifications.send.title")}
        help={t("settings.notifications.send.help")}
      >
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={sendingDigest}
            onClick={handleSendDigestNow}
            className="gap-1.5"
          >
            {sendingDigest && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {sendingDigest
              ? t("settings.notifications.send.sending")
              : t("settings.notifications.send.button")}
          </Button>
          {digestResult && (
            <p
              className={`text-[12px] ${
                digestResult.kind === "ok" ? "text-muted-foreground" : "text-destructive"
              }`}
            >
              {digestResult.message}
            </p>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
