"use client";

import * as React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils/cn";

export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR or before mount, default to light mode switch state
  const isLight = mounted ? theme === "light" : true;

  return (
    <div
      className={cn("flex items-center gap-1.5 sm:gap-2", className)}
      title={
        isLight
          ? "Light Mode is active (Click to switch to Dark Mode)"
          : "Dark Mode is active (Click to switch to Light Mode)"
      }
    >
      {/* Sun Icon */}
      <Sun
        aria-hidden="true"
        data-testid="sun-icon"
        className={cn(
          "h-4 w-4 transition-colors duration-200",
          isLight
            ? "text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]"
            : "text-slate-400 dark:text-slate-500 hover:text-slate-300"
        )}
      />

      {/* Switch Button */}
      <button
        type="button"
        role="switch"
        aria-checked={isLight}
        onClick={toggleTheme}
        className={cn(
          "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          isLight
            ? "bg-amber-400/90 hover:bg-amber-400 shadow-xs"
            : "bg-slate-700 hover:bg-slate-600 border border-slate-600/60"
        )}
        aria-label={
          isLight
            ? "Light Mode is ON. Toggle to switch to Dark Mode."
            : "Dark Mode is active. Toggle to switch ON Light Mode."
        }
      >
        <span className="sr-only">Toggle theme</span>
        <span
          data-keep-white
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
            isLight ? "translate-x-5" : "translate-x-0"
          )}
        >
          {isLight ? (
            <Sun className="h-3 w-3 text-amber-500" />
          ) : (
            <Moon className="h-3 w-3 text-indigo-600" />
          )}
        </span>
      </button>

      {/* Moon Icon */}
      <Moon
        aria-hidden="true"
        data-testid="moon-icon"
        className={cn(
          "h-4 w-4 transition-colors duration-200",
          !isLight
            ? "text-indigo-400 drop-shadow-[0_0_6px_rgba(129,140,248,0.5)]"
            : "text-slate-400 dark:text-slate-500 hover:text-slate-500"
        )}
      />

      {/* Clean text indicator for accessibility and clarity */}
      <span className="hidden lg:inline text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
        {isLight ? "ON" : "OFF"}
      </span>
    </div>
  );
}
