import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppSidebar } from "@/components/layout/app-sidebar";

const mockUseOrganization = vi.fn();
vi.mock("@/hooks/use-organization", () => ({
  useOrganization: () => mockUseOrganization(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("AppSidebar Component", () => {
  it("renders main navigation sections and dashboard for authenticated user", () => {
    mockUseOrganization.mockReturnValue({
      membership: {
        permissions: ["organizations.view", "employees.view", "reports.view"],
        role: "organization_admin",
      },
    });

    render(<AppSidebar />);

    expect(screen.getByText("OfficeOS")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Reports & Analytics")).toBeInTheDocument();
    expect(screen.getByText("Organization")).toBeInTheDocument();
    expect(screen.getByText("Employees")).toBeInTheDocument();
  });

  it("filters out navigation items when user lacks permissions", () => {
    mockUseOrganization.mockReturnValue({
      membership: {
        permissions: [],
        role: "employee",
      },
    });

    render(<AppSidebar />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
    expect(screen.queryByText("SaaS Overview")).not.toBeInTheDocument();
  });

  it("renders platform administration section for system_admin with saas permissions", () => {
    mockUseOrganization.mockReturnValue({
      membership: {
        permissions: ["saas.view", "saas.manage"],
        role: "system_admin",
      },
    });

    render(<AppSidebar />);

    expect(screen.getByText("Platform Administration")).toBeInTheDocument();
    expect(screen.getByText("SaaS Overview")).toBeInTheDocument();
    expect(screen.getByText("Organizations")).toBeInTheDocument();
    expect(screen.getByText("Platform Usage")).toBeInTheDocument();
    expect(screen.getByText("System Health")).toBeInTheDocument();
  });
});
