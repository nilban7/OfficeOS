import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportsPage from "@/app/(protected)/reports/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization } from "@/types/organization";
import type {
  ExecutiveOverviewReport,
  WorkforceReport,
  AttendanceReport,
  LeaveReport,
  FinanceReport,
} from "@/types/reports";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("ReportsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-123",
    name: "Acme Analytics Inc",
    slug: "acme-analytics",
  };

  const mockOverview: ExecutiveOverviewReport = {
    active_employees_count: 42,
    attendance_today_count: 38,
    attendance_rate_today: "90.5",
    pending_leaves_count: 3,
    active_projects_count: 7,
    active_clients_count: 12,
    pending_purchase_requests_count: 2,
    open_maintenance_requests_count: 1,
    open_operations_tasks_count: 5,
    upcoming_training_sessions_count: 3,
    active_internships_count: 4,
    documents_count: 15,
    unread_notifications_count: 2,
    finance_metrics_included: true,
    total_expenses_mtd: "15420.50",
    pending_expenses_count: 2,
  };

  const mockWorkforce: WorkforceReport = {
    total_employees: 50,
    active_employees: 45,
    probation_employees: 3,
    notice_period_employees: 1,
    on_leave_employees: 1,
    suspended_employees: 0,
    terminated_employees: 2,
    departments: [
      { department_id: "dept-1", department_name: "Engineering", count: 25 },
      { department_id: "dept-2", department_name: "Product & Design", count: 20 },
    ],
    branches: [
      { branch_id: "br-1", branch_name: "San Francisco", count: 50 },
    ],
  };

  const mockAttendance: AttendanceReport = {
    date_from: "2026-09-01",
    date_to: "2026-09-30",
    total_records: 280,
    present_count: 260,
    absent_count: 10,
    late_count: 8,
    half_day_count: 2,
    on_leave_count: 0,
    attendance_rate: "96.4",
    daily_trends: [
      {
        date: "2026-09-30",
        present_count: 38,
        absent_count: 2,
        late_count: 1,
        half_day_count: 1,
        on_leave_count: 0,
        total_records: 42,
        attendance_rate: "95.2",
      },
    ],
  };

  const mockLeave: LeaveReport = {
    date_from: "2026-09-01",
    date_to: "2026-09-30",
    pending_count: 4,
    approved_count: 12,
    rejected_count: 1,
    cancelled_count: 2,
    total_requests: 19,
    total_approved_days: "34.50",
    leave_types: [
      {
        leave_type_id: "lt-1",
        leave_type_name: "Annual Leave",
        request_count: 10,
        total_days: "25.00",
      },
    ],
  };

  const mockFinance: FinanceReport = {
    date_from: "2026-09-01",
    date_to: "2026-09-30",
    total_expenses: "12345.67",
    submitted_expenses_total: "2345.67",
    approved_expenses_total: "5000.00",
    paid_expenses_total: "5000.00",
    total_debits: "25000.00",
    total_credits: "18500.50",
    expenses_by_category: [
      {
        category_id: "cat-1",
        category_name: "Cloud Hosting",
        total_amount: "12345.67",
        expense_count: 4,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders executive overview metrics and cards with full permissions", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["reports.view", "reports.finance", "reports.workforce", "reports.attendance", "reports.leave", "reports.audit"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      success: true,
      data: mockOverview,
    });

    render(<ReportsPage />);

    expect(screen.getByText("Reports & Analytics")).toBeInTheDocument();
    expect(screen.getByText("Executive Overview")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument(); // active employees count
      expect(screen.getByText("$15420.50")).toBeInTheDocument(); // MTD expenses
    });
  });

  it("switches to Workforce & Talent tab and displays department distributions", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["reports.view", "reports.workforce"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    // 1st call for overview
    vi.mocked(apiClient.get).mockResolvedValueOnce({ success: true, data: mockOverview });
    // 2nd call for workforce, 3rd training, 4th internships
    vi.mocked(apiClient.get).mockResolvedValueOnce({ success: true, data: mockWorkforce });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ success: true, data: { total_programs: 5, completion_rate: "90.0" } });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ success: true, data: { active_internships: 3, total_stipend_committed: "5000.00" } });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const workforceTab = screen.getByRole("button", { name: /Workforce & Talent/i });
    await user.click(workforceTab);

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
      expect(screen.getByText("Product & Design")).toBeInTheDocument();
    });
  });

  it("switches to Attendance & Leave tab and renders metrics", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["reports.view", "reports.attendance", "reports.leave"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockResolvedValueOnce({ success: true, data: mockOverview });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ success: true, data: mockAttendance });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ success: true, data: mockLeave });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const attLeaveTab = screen.getByRole("button", { name: /Attendance & Leave/i });
    await user.click(attLeaveTab);

    await waitFor(() => {
      expect(screen.getByText("96.4%")).toBeInTheDocument();
      expect(screen.getByText("Annual Leave")).toBeInTheDocument();
      expect(screen.getByText("34.50")).toBeInTheDocument();
    });
  });

  it("renders access restricted when user lacks reports.view", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: [],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    render(<ReportsPage />);

    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    expect(screen.getByText(/You do not have permission to view organizational reports/i)).toBeInTheDocument();
  });

  it("switches to Finance tab and validates strict decimal precision", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["reports.view", "reports.finance"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockResolvedValueOnce({ success: true, data: mockOverview });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ success: true, data: mockFinance });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    const finTab = screen.getByRole("button", { name: /Finance & Cash Flow/i });
    await user.click(finTab);

    await waitFor(() => {
      expect(screen.getAllByText("$12345.67").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("$25000.00")).toBeInTheDocument();
      expect(screen.getByText("Cloud Hosting")).toBeInTheDocument();
    });
  });

  it("handles API failure gracefully with error retry state", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["reports.view"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Database connection timed out"));

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText("Database connection timed out")).toBeInTheDocument();
    });
  });
});
