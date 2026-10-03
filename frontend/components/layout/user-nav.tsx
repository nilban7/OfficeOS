"use client";

import * as React from "react";
import { LogOut, User as UserIcon, Shield, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants/routes";

export function UserNav() {
  const { user, signOut } = useAuth();
  const { membership } = useOrganization();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    router.push(ROUTES.LOGIN);
  };

  const displayName =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email?.split("@")[0] ||
    "User";
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-3 rounded-lg p-1.5 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        aria-expanded={isOpen}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 font-semibold text-white text-xs shadow-sm">
          {userInitial}
        </div>
        <div className="hidden text-left sm:block">
          <div className="text-sm font-medium text-slate-800 leading-tight truncate max-w-[120px]">
            {displayName}
          </div>
          <div className="text-xs text-slate-500 truncate max-w-[120px]">
            {user?.email || "Signed in"}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400 hidden sm:block" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg animate-in fade-in-0 zoom-in-95">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            {membership?.role && (
              <div className="mt-2 flex items-center space-x-1.5">
                <Shield className="h-3.5 w-3.5 text-primary-600" />
                <Badge variant="default" className="capitalize text-[10px] py-0 px-1.5">
                  {membership.role.replace("_", " ")}
                </Badge>
              </div>
            )}
          </div>

          <div className="pt-2 space-y-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                router.push(ROUTES.SETTINGS);
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <UserIcon className="mr-2.5 h-4 w-4 text-slate-400" />
              Account Settings
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="mr-2.5 h-4 w-4 text-red-500" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
