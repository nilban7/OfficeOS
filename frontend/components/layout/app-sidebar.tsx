"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAVIGATION } from "@/constants/navigation";
import { cn } from "@/lib/utils/cn";
import { useOrganization } from "@/hooks/use-organization";
import { Building2 } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  const { membership } = useOrganization();

  const userPermissions = React.useMemo(() => {
    return new Set(membership?.permissions || []);
  }, [membership]);

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 bg-white shadow-sm z-30">
      {/* Brand / Logo */}
      <div className="flex h-16 items-center px-6 border-b border-slate-100">
        <Link href="/dashboard" className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white shadow-sm">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold text-lg text-slate-900 tracking-tight">OfficeOS</span>
            <span className="block text-[10px] text-primary-600 font-semibold uppercase tracking-wider">
              Enterprise
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {MAIN_NAVIGATION.map((section, idx) => {
          // Filter items based on permission (for UX/UI only)
          const visibleItems = section.items.filter((item) => {
            if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
              return true;
            }
            return item.requiredPermissions.some((p) => userPermissions.has(p));
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title || idx} className="space-y-1">
              {section.title && (
                <div className="px-3 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {section.title}
                </div>
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
                    className={cn(
                      "group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary-50 text-primary-700 shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      item.disabled && "pointer-events-none opacity-50"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon
                        className={cn(
                          "h-4 w-4 transition-colors",
                          isActive ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600"
                        )}
                      />
                      <span>{item.title}</span>
                    </div>
                    {item.badge && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer */}
      <div className="border-t border-slate-100 p-4">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 text-center">
          <p className="font-medium text-slate-700">OfficeOS SaaS Platform</p>
          <p className="text-[11px] text-slate-400 mt-0.5">v0.1.0 • Multi-tenant</p>
        </div>
      </div>
    </aside>
  );
}
