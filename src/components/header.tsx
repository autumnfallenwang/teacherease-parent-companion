import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

interface HeaderProps {
  lastRunAt?: string | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export function Header({ lastRunAt, isRefreshing, onRefresh }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold">TeacherEase Parent Companion</h1>
        <p className="text-sm text-muted-foreground">
          {lastRunAt ? `Last checked: ${lastRunAt}` : "No data yet"}
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={isRefreshing} onClick={onRefresh}>
        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        {isRefreshing ? "Checking..." : "Refresh now"}
      </Button>
    </header>
  );
}
