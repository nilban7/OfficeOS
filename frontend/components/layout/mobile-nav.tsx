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
  const { membership, permissions } = useOrganization();

  const isSuperUser =
    membership?.role === "system_admin" ||
    membership?.role === "organization_owner" ||
    membership?.role === "organization_admin";

  const userPermissions = React.useMemo(() => {
    return new Set([...(membership?.permissions || []), ...(permissions || [])]);
  }, [membership, permissions]);

  // Only close mobile nav when user navigates to a different route
  const prevPathname = React.useRef(pathname);
  React.useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  // Prevent background page scrolling while mobile drawer is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div className="fixed inset-y-0 left-0 w-[85%] max-w-xs bg-white shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-250 ease-out">
        {/* Drawer Header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-100">
          <Link href="/dashboard" onClick={onClose} className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white shadow-md">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base text-slate-900 leading-tight">OfficeOS</span>
              <span className="text-[10px] text-primary-600 font-semibold uppercase tracking-wider">Enterprise</span>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items List */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 pb-16 space-y-5">
          {MAIN_NAVIGATION.map((section, idx) => {
            const visibleItems = section.items.filter((item) => {
              if (isSuperUser) return true;
              if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
                return true;
              }
              return item.requiredPermissions.some((p) => userPermissions.has(p));
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title || idx} className="space-y-1">
                {section.title && (
                  <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
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
                      onClick={onClose}
                      className={cn(
                        "group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]",
                        isActive
                          ? "bg-primary-50 text-primary-700 font-semibold"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className={cn("h-4.5 w-4.5", isActive ? "text-primary-600" : "text-slate-400")} />
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
