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
  const handleOpenMobile = React.useCallback(() => setIsMobileOpen(true), []);
  const handleCloseMobile = React.useCallback(() => setIsMobileOpen(false), []);

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
      <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 sm:px-6 backdrop-blur-md shadow-subtle transition-all duration-200">
        {/* Left Section: Mobile Menu Trigger + Org Switcher */}
        <div className="flex items-center space-x-2 sm:space-x-3.5">
          <button
            type="button"
            onClick={handleOpenMobile}
            className="rounded-lg h-10 w-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/80 pl-9 pr-12 text-xs text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/15 transition-all duration-150 cursor-pointer"
              readOnly
            />
            <kbd className="pointer-events-none absolute right-2.5 top-2.5 inline-flex h-4 items-center rounded border border-slate-200 bg-white px-1 font-sans text-[10px] font-medium text-slate-400 shadow-sm">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right Section: Notifications + User Menu */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5">
          <Link
            href={ROUTES.NOTIFICATIONS}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          <UserNav />
        </div>
      </header>

      {/* Mobile Drawer */}
      <MobileNav isOpen={isMobileOpen} onClose={handleCloseMobile} />
    </>
  );
}
