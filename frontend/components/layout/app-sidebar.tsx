"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAVIGATION } from "@/constants/navigation";
import { cn } from "@/lib/utils/cn";
import { useOrganization } from "@/hooks/use-organization";
import { useSidebar } from "./sidebar-context";
import { Building2, ChevronLeft, ChevronRight } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  const { membership, permissions } = useOrganization();
  const { isCollapsed, toggleCollapsed } = useSidebar();

  const userPermissions = React.useMemo(() => {
    return new Set([...(membership?.permissions || []), ...(permissions || [])]);
  }, [membership, permissions]);

  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-subtle z-30 transition-[width] duration-200 ease-out",
        isCollapsed ? "md:w-16" : "md:w-64"
      )}
      aria-label="Sidebar Navigation"
    >
      {/* Brand / Logo + Collapse Toggle */}
      <div className="flex h-16 items-center justify-between px-3.5 border-b border-slate-100/90 dark:border-slate-800">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center space-x-3 overflow-hidden rounded-lg p-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors",
            isCollapsed && "justify-center w-full space-x-0"
          )}
          title="OfficeOS Enterprise"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-indigo-700 text-white shadow-subtle">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col truncate">
              <span className="font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                OfficeOS
              </span>
              <span className="text-[10px] text-primary-600 font-semibold uppercase tracking-wider">
                Enterprise
              </span>
            </div>
          )}
        </Link>

        {!isCollapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200/80 dark:border-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {MAIN_NAVIGATION.map((section, idx) => {
          const visibleItems = section.items.filter((item) => {
            if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
              return true;
            }
            return item.requiredPermissions.some((p) => userPermissions.has(p));
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title || idx} className="space-y-0.5">
              {!isCollapsed && section.title && (
                <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                  {section.title}
                </div>
              )}
              {isCollapsed && (
                <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
              )}
              {visibleItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.disabled ? "#" : item.href}
                    title={isCollapsed ? item.title : undefined}
                    className={cn(
                      "group relative flex items-center rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 ease-out",
                      isCollapsed
                        ? "h-9 w-9 mx-auto justify-center"
                        : "px-2.5 py-2 justify-between",
                      isActive
                        ? "bg-primary-50/90 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 shadow-subtle font-semibold"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100",
                      item.disabled && "pointer-events-none opacity-50"
                    )}
                  >
                    <div className={cn("flex items-center", isCollapsed ? "justify-center" : "space-x-2.5")}>
                      <Icon
                        className={cn(
                          "h-4 w-4 flex-shrink-0 transition-colors",
                          isActive ? "text-primary-600 dark:text-primary-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                        )}
                      />
                      {!isCollapsed && <span className="truncate">{item.title}</span>}
                    </div>

                    {!isCollapsed && item.badge && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        {item.badge}
                      </span>
                    )}

                    {/* Active Left Indicator Bar */}
                    {isActive && (
                      <span
                        className={cn(
                          "absolute bg-primary-600 rounded-r-full transition-all",
                          isCollapsed ? "left-0 top-1.5 bottom-1.5 w-1" : "-left-2.5 top-2 bottom-2 w-1"
                        )}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer */}
      <div className="border-t border-slate-100 dark:border-slate-800 p-2.5 flex flex-col items-center">
        {isCollapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200/80 dark:border-slate-700 text-slate-400 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <div className="w-full rounded-lg bg-slate-50/80 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-2 text-center">
            <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">OfficeOS Platform</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Enterprise Cloud • v1.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
