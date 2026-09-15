"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAVIGATION } from "@/constants/navigation";
import { cn } from "@/lib/utils/cn";
import { Building2, X } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";

export interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const pathname = usePathname();
  const { membership } = useOrganization();

  const userPermissions = React.useMemo(() => {
    return new Set(membership?.permissions || []);
  }, [membership]);

  React.useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-4/5 max-w-xs bg-white shadow-xl flex flex-col z-50 animate-in slide-in-from-left duration-200">
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-100">
          <Link href="/dashboard" className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="font-bold text-lg text-slate-900">OfficeOS</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 text-slate-600"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {MAIN_NAVIGATION.map((section, idx) => {
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
                      href={item.href}
                      className={cn(
                        "group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary-50 text-primary-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className={cn("h-4 w-4", isActive ? "text-primary-600" : "text-slate-400")} />
                        <span>{item.title}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
