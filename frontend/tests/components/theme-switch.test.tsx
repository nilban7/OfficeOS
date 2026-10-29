import * as React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { ThemeSwitch } from "@/components/layout/theme-switch";

describe("ThemeSwitch Component", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("renders switch ON for light mode initially and does NOT contain any sun or moon emojis", () => {
    render(
      <ThemeProvider>
        <ThemeSwitch />
      </ThemeProvider>
    );

    const switchBtn = screen.getByRole("switch");
    expect(switchBtn).toBeInTheDocument();
    expect(switchBtn).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("ON")).toBeInTheDocument();

    // Verify absolutely no sun or moon emoji in text content
    const containerText = screen.getByRole("switch").parentElement?.textContent || "";
    expect(containerText).not.toMatch(/[☀️🌙]/);
  });

  it("toggles to dark mode (switch OFF) on click and adds dark class to documentElement", async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeSwitch />
      </ThemeProvider>
    );

    const switchBtn = screen.getByRole("switch");

    // Initially light mode (ON)
    expect(switchBtn).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Click to switch OFF for Dark Mode
    await user.click(switchBtn);

    expect(switchBtn).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.body.classList.contains("dark")).toBe(true);
    expect(screen.getByText("OFF")).toBeInTheDocument();
    expect(localStorage.getItem("officeos_theme")).toBe("dark");

    // Click again to switch ON for Light Mode
    await user.click(switchBtn);

    expect(switchBtn).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.body.classList.contains("dark")).toBe(false);
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(localStorage.getItem("officeos_theme")).toBe("light");
  });
});
