"use client";

import * as React from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("light");

  const applyThemeClasses = React.useCallback((t: Theme) => {
    if (typeof document === "undefined") return;
    const isDarkMode = t === "dark";
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
    }
  }, []);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("officeos_theme") as Theme | null;
      const initialTheme: Theme = stored === "dark" ? "dark" : "light";
      setThemeState(initialTheme);
      applyThemeClasses(initialTheme);
    } catch {
      applyThemeClasses("light");
    }
  }, [applyThemeClasses]);

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      setThemeState(nextTheme);
      applyThemeClasses(nextTheme);
      try {
        localStorage.setItem("officeos_theme", nextTheme);
      } catch {
        // Ignore localStorage restrictions
      }
    },
    [applyThemeClasses]
  );

  const toggleTheme = React.useCallback(() => {
    setThemeState((currentTheme) => {
      const nextTheme: Theme = currentTheme === "light" ? "dark" : "light";
      applyThemeClasses(nextTheme);
      try {
        localStorage.setItem("officeos_theme", nextTheme);
      } catch {
        // Ignore
      }
      return nextTheme;
    });
  }, [applyThemeClasses]);

  const value = React.useMemo<ThemeContextValue>(() => {
    return {
      theme,
      isDark: theme === "dark",
      toggleTheme,
      setTheme,
    };
  }, [theme, toggleTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) {
    return {
      theme: "light",
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return context;
}
