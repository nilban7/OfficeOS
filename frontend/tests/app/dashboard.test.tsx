import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardPage from "@/app/(protected)/dashboard/page";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api/client";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe("DashboardPage Component", () => {
  const mockOrg = {
    id: "org-1",
    name: "OsOffice Organization Workflow",
    slug: "osoffice-org",
    createdAt: "2026-01-01T00:00:00Z",
  };

  const mockUser = {
    id: "user-1",
    email: "osofficesupport@gmail.com",
    fullName: "OsOffice",
    firstName: "OsOffice",
    lastName: "",
    createdAt: "2026-01-01T00:00:00Z",
  };

  const mockOverview = {
    organization_id: "org-1",
    active_employees_count: 4,
    attendance_today_count: 4,
    attendance_rate_today: 100,
    leave_pending_count: 0,
    active_projects_count: 4,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      organizations: [mockOrg],
      membership: null,
      permissions: ["dashboard.view", "reports.view"],
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      session: null,
      status: "authenticated",
      isLoading: false,
      isAuthenticated: true,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUserPassword: vi.fn(),
      refreshSession: vi.fn(),
    });

    vi.mocked(apiClient.get).mockImplementation((endpoint: string) => {
      if (endpoint.includes("/reports/overview")) {
        return Promise.resolve(mockOverview);
      }
      return Promise.resolve({});
    });
  });

  it("renders welcome header with branded OsOffice greeting and organization workflow pill", async () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: /Welcome back/i })).toBeInTheDocument();
    expect(screen.getByText("OsOffice")).toBeInTheDocument();
    expect(screen.getByText("OsOffice Organization Workflow")).toBeInTheDocument();
  });

  it("renders 4 executive KPI metric cards and analytical sections", async () => {
    render(<DashboardPage />);

    expect(screen.getByText("Total Employees")).toBeInTheDocument();
    expect(screen.getByText("Active Today")).toBeInTheDocument();
    expect(screen.getByText("Active Projects")).toBeInTheDocument();
    expect(screen.getByText("Commercial Pipeline")).toBeInTheDocument();

    // Analytical cards
    expect(screen.getByText(/Workday Attendance \(Mon – Fri\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Project Delivery Status/i)).toBeInTheDocument();
    expect(screen.getByText("RFID Smart Store")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });
});
