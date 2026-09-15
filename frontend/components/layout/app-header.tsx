"use client";

import * as React from "react";
import { Menu, Search } from "lucide-react";
import { OrgSwitcher } from "./org-switcher";
import { UserNav } from "./user-nav";
import { MobileNav } from "./mobile-nav";

export function AppHeader() {
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur transition-all">
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
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-4 text-xs text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all"
              readOnly
            />
          </div>
        </div>

        {/* Right Section: User Menu */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <UserNav />
        </div>
      </header>

      {/* Mobile Drawer */}
      <MobileNav isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)} />
    </>
  );
}
