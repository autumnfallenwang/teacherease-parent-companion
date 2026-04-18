import type { ChildRecord } from "@/lib/scraper/types";

interface ChildTabsProps {
  items: ChildRecord[];
  selectedId: number;
  attentionChildIds: Set<number>;
  onSelect: (childId: number) => void;
}

export function ChildTabs({ items, selectedId, attentionChildIds, onSelect }: ChildTabsProps) {
  if (items.length <= 1) return null;

  return (
    <div className="flex gap-1 rounded-lg bg-secondary/50 p-1 shadow-inner">
      {items.map((child) => {
        const isSelected = child.id === selectedId;
        const needsAttention = attentionChildIds.has(child.id);

        return (
          <button
            key={child.id}
            type="button"
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] transition-all duration-200 ${
              isSelected
                ? "bg-card font-semibold text-foreground shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]"
                : "font-medium text-muted-foreground/60 hover:text-foreground"
            }`}
            onClick={() => onSelect(child.id)}
          >
            {needsAttention && (
              <span
                className={`h-1.5 w-1.5 rounded-full bg-attention ${isSelected ? "" : "opacity-60"}`}
              />
            )}
            {child.displayName}
          </button>
        );
      })}
    </div>
  );
}
