import { RefreshCw, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

interface HeaderProps {
  lastRunAt?: string | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onSettings?: () => void;
  children?: ReactNode;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Header({ lastRunAt, isRefreshing, onRefresh, onSettings, children }: HeaderProps) {
  return (
    <header className="relative border-b bg-card/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <span
                className="text-base font-semibold text-primary"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                T
              </span>
            </div>
            <div>
              <h1 className="text-[15px] font-semibold leading-tight tracking-tight">
                Parent Companion
              </h1>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {lastRunAt ? `Checked ${formatTimeAgo(lastRunAt)}` : "Not checked yet"}
              </p>
            </div>
          </div>
          {children}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={isRefreshing}
            onClick={onRefresh}
            className="h-8 gap-1.5 px-2.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Checking" : "Refresh"}
          </Button>
          <Button variant="ghost" size="icon" onClick={onSettings} className="h-8 w-8">
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
