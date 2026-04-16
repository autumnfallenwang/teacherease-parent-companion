import type { ChildRecord } from "@/lib/scraper/types";

interface ChildSwitcherProps {
  items: ChildRecord[];
  selectedId: number;
  onSelect: (childId: number) => void;
}

export function ChildSwitcher({ items, selectedId, onSelect }: ChildSwitcherProps) {
  if (items.length <= 1) return null;

  return (
    <select
      className="rounded-md border bg-background px-2 py-1 text-sm"
      value={selectedId}
      onChange={(e) => onSelect(Number(e.target.value))}
    >
      {items.map((child) => (
        <option key={child.id} value={child.id}>
          {child.displayName}
        </option>
      ))}
    </select>
  );
}
