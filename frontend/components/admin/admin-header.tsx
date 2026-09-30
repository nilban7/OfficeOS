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

      {/* Admin Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-1 scrollbar-none" aria-label="Admin Tabs">
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
                  "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
