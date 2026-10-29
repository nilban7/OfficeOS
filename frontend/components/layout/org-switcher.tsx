"use client";

import * as React from "react";
import { Building2, ChevronsUpDown, Check } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { cn } from "@/lib/utils/cn";

export function OrgSwitcher() {
  const { organizations, currentOrganization, selectOrganization } = useOrganization();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary-100 dark:bg-primary-950/70 text-primary-700 dark:text-primary-300">
          <Building2 className="h-3.5 w-3.5" />
        </div>
        <span className="max-w-[140px] truncate text-slate-900 dark:text-slate-100">
          {currentOrganization?.name || "Select Organization"}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 z-50 w-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95">
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Organizations
          </div>
          <div className="space-y-0.5">
            {organizations.length === 0 ? (
              <div className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">No organizations found</div>
            ) : (
              organizations.map((org) => {
                const isSelected = org.id === currentOrganization?.id;
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => {
                      selectOrganization(org.id);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                      isSelected
                        ? "bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 font-medium"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <span className="truncate">{org.name}</span>
                    {isSelected && <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
