"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Menu, Search } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { UnreadCountResponse } from "@/types/notification";
import { OrgSwitcher } from "./org-switcher";
import { UserNav } from "./user-nav";
import { MobileNav } from "./mobile-nav";

export function AppHeader() {
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const { currentOrganization, permissions } = useOrganization();
  const [unreadCount, setUnreadCount] = React.useState<number>(0);

  const canViewNotifications = permissions.includes("notifications.view");

  React.useEffect(() => {
    if (!currentOrganization?.id || !canViewNotifications) {
      setUnreadCount(0);
      return;
    }

    let isMounted = true;
    apiClient
      .get<UnreadCountResponse>(API_ENDPOINTS.notifications.unreadCount, {
        organizationId: currentOrganization.id,
      })
      .then((res) => {
        if (isMounted && res && typeof res.unread_count === "number") {
          setUnreadCount(res.unread_count);
        }
      })
      .catch(() => {
        // Silently ignore notification count errors
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrganization?.id, canViewNotifications]);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 sm:px-6 backdrop-blur-md shadow-subtle transition-all duration-200">
        {/* Left Section: Mobile Menu Trigger + Org Switcher */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 md:hidden transition-colors"
            aria-label="Open mobile navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <OrgSwitcher />
        </div>

        {/* Center / Search Placeholder (Optional) */}
        <div className="hidden lg:flex items-center max-w-sm flex-1 mx-8">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Quick search... (Press ⌘K)"
              className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/70 pl-9 pr-4 text-xs text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-500/10 transition-all duration-150"
              readOnly
            />
          </div>
        </div>

        {/* Right Section: Notifications + User Menu */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <Link
            href={ROUTES.NOTIFICATIONS}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          <UserNav />
        </div>
      </header>

      {/* Mobile Drawer */}
      <MobileNav isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)} />
    </>
  );
}
