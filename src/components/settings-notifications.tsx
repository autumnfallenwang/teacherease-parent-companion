"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { getSettingBool, log, setSettingBool } from "@/lib/ipc";

type EventKey = "gradesAttention" | "newHomework" | "fetchFailed";

const ROWS: Array<{ key: EventKey; label: string; help: string }> = [
  {
    key: "gradesAttention",
    label: "Grade changes",
    help: "Notify when classes need attention or missing assignments appear.",
  },
  {
    key: "newHomework",
    label: "New homework",
    help: "Notify when homework is posted for a new day.",
  },
  {
    key: "fetchFailed",
    label: "Fetch failures",
    help: "Notify when a scrape fails. Useful for debugging; noisier than the other two.",
  },
];

const DEFAULTS: Record<EventKey, boolean> = {
  gradesAttention: true,
  newHomework: true,
  fetchFailed: false,
};

export function SettingsNotifications() {
  const [values, setValues] = useState<Partial<Record<EventKey, boolean>>>({});

  useEffect(() => {
    void Promise.all(
      ROWS.map(
        async (r) => [r.key, await getSettingBool(`notify.${r.key}.os`, DEFAULTS[r.key])] as const,
      ),
    ).then((pairs) => {
      const next: Partial<Record<EventKey, boolean>> = {};
      for (const [k, v] of pairs) next[k] = v;
      setValues(next);
    });
  }, []);

  const toggle = async (key: EventKey, next: boolean) => {
    await setSettingBool(`notify.${key}.os`, next);
    await log(`settings: notify.${key}.os=${next ? 1 : 0}`);
    setValues((v) => ({ ...v, [key]: next }));
  };

  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">Desktop</p>
      <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{r.label}</p>
              <p className="text-[12px] text-muted-foreground">{r.help}</p>
            </div>
            <Switch
              checked={values[r.key] ?? DEFAULTS[r.key]}
              onChange={(next) => {
                void toggle(r.key, next);
              }}
              aria-label={`${r.label} desktop notifications`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
