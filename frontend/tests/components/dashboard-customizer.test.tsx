import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardCustomizerModal } from "@/components/dashboard/dashboard-customizer-modal";
import {
  MASTER_DASHBOARD_CONFIG,
  getStoredDashboardConfig,
  saveStoredDashboardConfig,
  resetToMasterDashboard,
} from "@/lib/dashboard/widget-registry";
import type { UserDashboardPreference } from "@/types/dashboard";

describe("Dashboard Customization System", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads Master Dashboard by default when no stored preference exists", () => {
    const pref = getStoredDashboardConfig("user-1", "org-1");
    expect(pref.preset).toBe("master");
    const visibleIds = pref.widgets.filter((w) => w.visible).map((w) => w.id);
    expect(visibleIds).toEqual([
      "kpi_metrics",
      "attendance",
      "projects",
      "workforce",
      "engagements",
    ]);
  });

  it("saves and loads custom preferences per user and org ID", () => {
    const customPref: UserDashboardPreference = {
      preset: "projects_only",
      widgets: MASTER_DASHBOARD_CONFIG.map((w) => ({
        ...w,
        visible: w.id === "projects",
      })),
      updatedAt: new Date().toISOString(),
    };

    saveStoredDashboardConfig(customPref, "user-1", "org-1");

    const loaded = getStoredDashboardConfig("user-1", "org-1");
    expect(loaded.preset).toBe("projects_only");
    const visibleWidgets = loaded.widgets.filter((w) => w.visible);
    expect(visibleWidgets).toHaveLength(1);
    expect(visibleWidgets[0]?.id).toBe("projects");

    // Other user/org gets clean Master Dashboard default
    const otherUser = getStoredDashboardConfig("user-2", "org-1");
    expect(otherUser.preset).toBe("master");
  });

  it("resets to master dashboard cleanly", () => {
    const customPref: UserDashboardPreference = {
      preset: "projects_only",
      widgets: MASTER_DASHBOARD_CONFIG.map((w) => ({
        ...w,
        visible: w.id === "projects",
      })),
      updatedAt: new Date().toISOString(),
    };
    saveStoredDashboardConfig(customPref, "user-1", "org-1");

    const resetPref = resetToMasterDashboard("user-1", "org-1");
    expect(resetPref.preset).toBe("master");
    const activeCount = resetPref.widgets.filter((w) => w.visible).length;
    expect(activeCount).toBe(5);
  });

  it("renders customizer modal with presets, search, and switches", async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn();
    const handleClose = vi.fn();

    const initialPref: UserDashboardPreference = {
      preset: "master",
      widgets: MASTER_DASHBOARD_CONFIG,
      updatedAt: new Date().toISOString(),
    };

    render(
      <DashboardCustomizerModal
        isOpen={true}
        onClose={handleClose}
        currentPreference={initialPref}
        onSave={handleSave}
      />
    );

    // Verify modal title and 1-Click Role Presets
    expect(screen.getByText("Customize Your Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Master Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Projects Only")).toBeInTheDocument();
    expect(screen.getByText("Manager Pulse")).toBeInTheDocument();
    expect(screen.getByText("Ops & Finance")).toBeInTheDocument();

    // Click "Projects Only" preset (Person 1 example)
    await user.click(screen.getByText("Projects Only"));

    // Click "Apply & Save Layout"
    await user.click(screen.getByText("Apply & Save Layout"));

    expect(handleSave).toHaveBeenCalledTimes(1);
    const savedConfig = handleSave.mock.calls[0]?.[0] as UserDashboardPreference;
    expect(savedConfig.preset).toBe("projects_only");
    const visibleIds = savedConfig.widgets.filter((w) => w.visible).map((w) => w.id);
    expect(visibleIds).toEqual(["projects"]);
  });

  it("applies Manager Pulse preset with Leave, Projects, Reports, Attendance", async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn();

    const initialPref: UserDashboardPreference = {
      preset: "master",
      widgets: MASTER_DASHBOARD_CONFIG,
      updatedAt: new Date().toISOString(),
    };

    render(
      <DashboardCustomizerModal
        isOpen={true}
        onClose={vi.fn()}
        currentPreference={initialPref}
        onSave={handleSave}
      />
    );

    // Click "Manager Pulse" preset (Manager example)
    await user.click(screen.getByText("Manager Pulse"));
    await user.click(screen.getByText("Apply & Save Layout"));

    expect(handleSave).toHaveBeenCalledTimes(1);
    const savedConfig = handleSave.mock.calls[0]?.[0] as UserDashboardPreference;
    expect(savedConfig.preset).toBe("manager_pulse");
    const visibleIds = savedConfig.widgets.filter((w) => w.visible).map((w) => w.id);
    expect(visibleIds).toContain("leave");
    expect(visibleIds).toContain("projects");
    expect(visibleIds).toContain("reports");
    expect(visibleIds).toContain("attendance");
  });
});
