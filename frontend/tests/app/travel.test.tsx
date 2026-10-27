import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TravelPage from "@/app/(protected)/travel/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { TravelSummaryKPI, TravelTrip, TravelReportMetrics } from "@/types/travel";
import type { Organization } from "@/types/organization";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("TravelPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockKpi: TravelSummaryKPI = {
    total_trips: 4,
    upcoming_trips: 1,
    ongoing_trips: 1,
    past_trips: 1,
    pending_approvals: 1,
    pending_expense_reviews: 2,
    total_estimated_budget: "10500.00",
    total_actual_approved_expenses: "4200.00",
    total_advances_paid: "2000.00",
    total_submitted_expenses: "4500.00",
    total_reimbursements_pending: "1200.00",
    unsettled_trips: 2,
    currency: "USD",
  };

  const mockReports: TravelReportMetrics = {
    summary: mockKpi,
    monthly_trend: [
      { month: "2026-10", trip_count: 4, estimated_budget: 10500, approved_expenses: 4200 },
    ],
    by_department: [
      { department_name: "Engineering", trip_count: 2, total_cost: 2500 },
    ],
    by_transport_mode: [
      { mode: "Flight", count: 2, total_cost: 3000 },
    ],
    planned_vs_past: {
      planned: 3,
      past: 1,
    },
    status_counts: {
      draft: 0,
      pending_approval: 1,
      approved: 0,
      booked: 1,
      ongoing: 1,
      completed: 1,
      cancelled: 0,
      rejected: 0,
    },
  };

  const mockTrips: TravelTrip[] = [
    {
      id: "trip-1",
      organization_id: "org-uuid-1",
      trip_number: "TRV-2026-0001",
      title: "London Tech Summit",
      business_purpose: "Deliver keynote presentation and partner meetings",
      registration_type: "planned",
      status: "pending_approval",
      settlement_status: "unsettled",
      requester_id: "emp-1",
      requester_name: "Jane Doe",
      requester_code: "EMP-001",
      department_id: "dept-1",
      department_name: "Engineering",
      origin: "New York, USA",
      destination: "London, UK",
      planned_start_date: "2026-11-10",
      planned_end_date: "2026-11-15",
      preferred_transport_mode: "flight",
      estimated_budget: "4500.00",
      currency: "USD",
      advance_requested: "1000.00",
      advance_approved: "0.00",
      advance_paid: "0.00",
      advance_status: "requested",
      total_submitted_expenses: "0.00",
      total_approved_expenses: "0.00",
      total_reimbursable_expenses: "0.00",
      total_settled_amount: "0.00",
      settlement_balance: "0.00",
      budget_variance: "-4500.00",
      member_count: 1,
      created_at: "2026-10-25T10:00:00Z",
      updated_at: "2026-10-25T10:00:00Z",
    },
    {
      id: "trip-2",
      organization_id: "org-uuid-1",
      trip_number: "TRV-2026-0002",
      title: "Urgent Client Incident Onsite",
      business_purpose: "Emergency system recovery support at client HQ",
      registration_type: "past",
      status: "completed",
      settlement_status: "unsettled",
      requester_id: "emp-2",
      requester_name: "Bob Smith",
      requester_code: "EMP-002",
      department_id: "dept-1",
      department_name: "Engineering",
      origin: "Chicago, USA",
      destination: "Dallas, USA",
      actual_start_date: "2026-10-20",
      actual_end_date: "2026-10-22",
      actual_transport_mode: "flight",
      estimated_budget: "1800.00",
      currency: "USD",
      advance_requested: "0.00",
      advance_approved: "0.00",
      advance_paid: "0.00",
      advance_status: "none",
      total_submitted_expenses: "1450.00",
      total_approved_expenses: "1450.00",
      total_reimbursable_expenses: "1450.00",
      total_settled_amount: "0.00",
      settlement_balance: "1450.00",
      budget_variance: "-350.00",
      member_count: 1,
      created_at: "2026-10-23T14:00:00Z",
      updated_at: "2026-10-23T14:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    (useOrganization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "travel.view",
        "travel.create",
        "travel.update",
        "travel.delete",
        "travel.approve",
        "travel.settle",
        "travel.manage",
      ],
      isLoading: false,
    });

    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes("/summary")) {
        return mockKpi;
      }
      if (url.includes("/reports")) {
        return mockReports;
      }
      if (url.includes("/departments")) {
        return { items: [{ id: "dept-1", name: "Engineering" }] };
      }
      if (url.includes("/employees")) {
        return {
          items: [
            { id: "emp-1", first_name: "Jane", last_name: "Doe", employee_code: "EMP-001" },
            { id: "emp-2", first_name: "Bob", last_name: "Smith", employee_code: "EMP-002" },
          ],
        };
      }
      if (url.includes("/projects")) {
        return { items: [] };
      }
      if (url.includes("/clients")) {
        return { items: [] };
      }
      return {
        items: mockTrips,
        meta: {
          total: mockTrips.length,
          page: 1,
          page_size: 15,
          total_pages: 1,
        },
      };
    });
  });

  it("renders page header, unified HR tabs and KPI metrics", async () => {
    render(<TravelPage />);

    expect(screen.getByText("Travel Management")).toBeInTheDocument();
    expect(screen.getByText("People & HR")).toBeInTheDocument();

    // Verify all HR sub-tabs exist under one single Travel Management entry
    expect(screen.getByRole("button", { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^All Trips \(/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /My Travel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Expenses & Receipts/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approvals/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reports & Analytics/i })).toBeInTheDocument();

    // Check KPI counters
    await waitFor(() => {
      expect(screen.getByText("Total Trips")).toBeInTheDocument();
      expect(screen.getByText("Pending Approvals")).toBeInTheDocument();
      expect(screen.getByText("Post-Registered Trips")).toBeInTheDocument();
      expect(screen.getByText("Pending Expense Claims")).toBeInTheDocument();
    });
  });

  it("renders both primary action buttons for planned and past travel", async () => {
    render(<TravelPage />);

    expect(screen.getByRole("button", { name: /Request Planned Travel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Register Past Travel/i })).toBeInTheDocument();
  });

  it("opens Planned Travel pre-registration modal with authorization workflow info", async () => {
    const user = userEvent.setup();
    render(<TravelPage />);

    const plannedBtn = screen.getByRole("button", { name: /Request Planned Travel/i });
    await user.click(plannedBtn);

    expect(screen.getByText("Request Planned Travel (Pre-Registration)")).toBeInTheDocument();
    expect(screen.getByText(/Pre-Travel Authorization Workflow/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Trip Title \*/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save as Draft/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit for Approval/i })).toBeInTheDocument();
  });

  it("opens Past Travel post-registration modal bypassing prior travel approval", async () => {
    const user = userEvent.setup();
    render(<TravelPage />);

    const pastBtn = screen.getByRole("button", { name: /Register Past Travel/i });
    await user.click(pastBtn);

    expect(screen.getByText("Register Past Travel (Post-Registration)")).toBeInTheDocument();
    expect(screen.getByText(/Post-Registration Compliance Notice/i)).toBeInTheDocument();
    expect(screen.getByText(/Prior travel approval is bypassed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Complete Registration/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save Incomplete Draft/i })).toBeInTheDocument();
  });

  it("displays both planned and past trips with appropriate registration badges in All Trips registry", async () => {
    const user = userEvent.setup();
    render(<TravelPage />);

    const allTripsTab = screen.getByRole("button", { name: /All Trips \(/i });
    await user.click(allTripsTab);

    await waitFor(() => {
      expect(screen.getByText("TRV-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("London Tech Summit")).toBeInTheDocument();
      expect(screen.getAllByText("Pre-Travel")[0]).toBeInTheDocument();

      expect(screen.getByText("TRV-2026-0002")).toBeInTheDocument();
      expect(screen.getByText("Urgent Client Incident Onsite")).toBeInTheDocument();
      expect(screen.getAllByText("Post-Travel")[0]).toBeInTheDocument();
    });
  });

  it("navigates to Reports & Analytics tab and shows graphical summaries", async () => {
    const user = userEvent.setup();
    render(<TravelPage />);

    const reportsTab = screen.getByRole("button", { name: /Reports & Analytics/i });
    await user.click(reportsTab);

    await waitFor(() => {
      expect(screen.getByText("Budget Variance Analysis")).toBeInTheDocument();
      expect(screen.getByText("Monthly Travel Spend & Budget Trajectory")).toBeInTheDocument();
      expect(screen.getByText("Registration Profile")).toBeInTheDocument();
      expect(screen.getByText("Transport Modes")).toBeInTheDocument();
    });
  });
});
