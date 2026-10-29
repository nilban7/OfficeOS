"use client";

import * as React from "react";
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
      className={cn("flex items-center gap-1.5", className)}
      title={
        isLight
          ? "Light Mode is ON (Click to switch OFF for Dark Mode)"
          : "Dark Mode is active / Light Mode is OFF (Click to switch ON for Light Mode)"
      }
    >
      <button
        type="button"
        role="switch"
        aria-checked={isLight}
        onClick={toggleTheme}
        className={cn(
          "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          isLight
            ? "bg-primary-600 shadow-xs"
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
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
            isLight ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>

      {/* Clean text indicator without any sun or moon emoji */}
      <span className="hidden lg:inline text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
        {isLight ? "ON" : "OFF"}
      </span>
    </div>
  );
}
