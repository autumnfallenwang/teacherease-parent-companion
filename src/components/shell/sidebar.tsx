"use client";

import { BookOpen, History, Home, Info, PanelLeft, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { useT } from "@/components/shell/locale-provider";
import { SidebarChildSelector } from "@/components/shell/sidebar-child-selector";
import { Button } from "@/components/ui/button";
import { getSettingBool, setSettingBool } from "@/lib/ipc";

interface NavItem {
  href: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
}

const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/", labelKey: "shell.sidebar.today", icon: Home },
  { href: "/classes", labelKey: "shell.sidebar.classes", icon: BookOpen },
  { href: "/history", labelKey: "shell.sidebar.history", icon: History },
];

const UTILITY_NAV: readonly NavItem[] = [
  { href: "/settings", labelKey: "shell.sidebar.settings", icon: Settings },
  { href: "/about", labelKey: "shell.sidebar.about", icon: Info },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const t = useT();
  const Icon = item.icon;
  const label = t(item.labelKey);
  return (
    <Link
      href={item.href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
        active
          ? "bg-secondary font-medium text-foreground"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const t = useT();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void getSettingBool("ui.sidebarCollapsed", false).then(setCollapsed);
  }, []);

  return (
    <aside
      // Height compensates for the global `zoom: var(--font-scale)` on <html>
      // (globals.css). `100vh` is the unzoomed viewport, so when font-scale > 1
      // the unmodified `h-screen` aside ends up taller than what fits on
      // screen and `mt-auto`-pinned items at the bottom (Settings/About) get
      // pushed off the visible area. Dividing by --font-scale keeps the aside
      // exactly viewport-tall regardless of the user's font-size preference.
      className={`flex shrink-0 flex-col border-r bg-card/60 backdrop-blur-sm transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-48"
      }`}
      style={{ height: "calc(100vh / var(--font-scale, 1))" }}
    >
      <div className="flex items-center justify-between px-2.5 py-3">
        {!collapsed && (
          <div className="flex items-center gap-2 pl-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <span
                className="text-sm font-semibold text-primary"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                T
              </span>
            </div>
            <span
              className="text-[13px] font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {t("shell.brand.companion")}
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            setCollapsed((c) => {
              const next = !c;
              void setSettingBool("ui.sidebarCollapsed", next);
              return next;
            })
          }
          className="h-7 w-7 shrink-0"
          title={collapsed ? t("shell.sidebar.expand") : t("shell.sidebar.collapse")}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-1">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <SidebarChildSelector collapsed={collapsed} />

      <nav className="mt-auto flex flex-col gap-0.5 px-2 py-1">
        {UTILITY_NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </aside>
  );
}
