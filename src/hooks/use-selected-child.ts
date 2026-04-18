import { useCallback, useEffect, useState } from "react";
import { getSettingString, setSettingString } from "@/lib/ipc";

export const SELECTED_CHILD_KEY = "ui.selectedChildId";
export const SELECTED_CHILD_EVENT = "selected-child-change";

export function parseChildId(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function writeSelectedChildId(id: number): Promise<void> {
  await setSettingString(SELECTED_CHILD_KEY, String(id));
  window.dispatchEvent(new CustomEvent(SELECTED_CHILD_EVENT));
}

export function useSelectedChild(): {
  selectedChildId: number | null;
  setSelectedChildId: (id: number) => Promise<void>;
} {
  const [selectedChildId, setLocal] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const readFromSettings = async () => {
      const raw = await getSettingString(SELECTED_CHILD_KEY, "");
      if (!active) return;
      setLocal(parseChildId(raw));
    };
    void readFromSettings();
    const handler = () => void readFromSettings();
    window.addEventListener(SELECTED_CHILD_EVENT, handler);
    return () => {
      active = false;
      window.removeEventListener(SELECTED_CHILD_EVENT, handler);
    };
  }, []);

  const setSelectedChildId = useCallback(async (id: number): Promise<void> => {
    setLocal(id);
    await writeSelectedChildId(id);
  }, []);

  return { selectedChildId, setSelectedChildId };
}
