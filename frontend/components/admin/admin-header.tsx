"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Server,
  Building2,
  BarChart3,
  HeartPulse,
  ShieldCheck,
  Megaphone,
  SlidersHorizontal,
  Tablet,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { label: "Overview", href: "/admin", icon: Server },
  { label: "Organizations", href: "/admin/organizations", icon: Building2 },
  { label: "Platform Usage", href: "/admin/usage", icon: BarChart3 },
  { label: "System Health", href: "/admin/health", icon: HeartPulse },
  { label: "Platform Audit", href: "/admin/audit-logs", icon: ShieldCheck },
  { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
  { label: "Settings", href: "/admin/settings", icon: SlidersHorizontal },
  { label: "Attendance Kiosks", href: "/admin/kiosks", icon: Tablet },
];

interface AdminHeaderProps {
  title: string;
  description?: string;
  badgeText?: string;
  children?: React.ReactNode;
}

export function AdminHeader({ title, description, badgeText, children }: AdminHeaderProps) {
  const pathname = usePathname();

  return (
    <div className="space-y-6 mb-8">
      {/* Top Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            {badgeText && (
              <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {badgeText}
              </Badge>
            )}
            <Badge variant="destructive" className="text-[11px] font-semibold">
              Platform Admin
            </Badge>
          </div>
          {description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
        {children && <div className="flex items-center gap-3">{children}</div>}
      </div>

      {/* Admin Navigation Blocks (No Horizontal Scroll, Fixed Grid Display) */}
      <nav
        className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2 p-1.5 bg-slate-100/80 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm"
        aria-label="Admin Navigation Blocks"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center justify-center gap-2 px-2.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 select-none text-center",
                isActive
                  ? "bg-white text-slate-900 dark:bg-slate-800 dark:text-white shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60"
              )}
            >
              <div
                className={cn(
                  "p-1 rounded-md transition-colors shrink-0",
                  isActive
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "bg-slate-200/60 dark:bg-slate-800 text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="truncate tracking-tight font-medium">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
