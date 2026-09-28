import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeavePage from "@/app/(protected)/leave/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization, BranchResponse } from "@/types/organization";
import type {
  Holiday,
  LeaveRequest,
  LeaveSummary,
  LeaveType,
} from "@/types/leave";

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

describe("LeavePage Component", () => {
  const mockOrg: Organization = {
    id: "org-1111",
    name: "Acme Corp",
    slug: "acme-corp",
  };

  const mockBranches: BranchResponse[] = [
    {
      id: "branch-1",
      organization_id: "org-1111",
      name: "Main HQ",
      code: "HQ",
      address: "100 Main St",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockLeaveTypes: LeaveType[] = [
    {
      id: "type-vacation",
      organization_id: "org-1111",
      name: "Annual Vacation",
      code: "VAC",
      description: "Paid annual holidays",
      annual_allocation: 20,
      is_paid: true,
      requires_approval: true,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "type-sick",
      organization_id: "org-1111",
      name: "Sick Leave",
      code: "SICK",
      description: "Health recovery",
      annual_allocation: 10,
      is_paid: true,
      requires_approval: true,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockSummary: LeaveSummary = {
    total_allocated_days: 30,
    total_used_days: 5,
    total_pending_days: 3,
    total_available_days: 22,
    balances_by_type: [
      {
        leave_type_id: "type-vacation",
        leave_type_name: "Annual Vacation",
        leave_type_code: "VAC",
        annual_allocation: 20,
        used_days: 5,
        pending_days: 3,
        available_days: 12,
      },
      {
        leave_type_id: "type-sick",
        leave_type_name: "Sick Leave",
        leave_type_code: "SICK",
        annual_allocation: 10,
        used_days: 0,
        pending_days: 0,
        available_days: 10,
      },
    ],
  };

  const mockHolidays: Holiday[] = [
    {
      id: "hol-1",
      organization_id: "org-1111",
      name: "New Year's Day",
      holiday_date: "2026-01-01",
      is_optional: false,
      description: "National Holiday",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockLeaveRequests: LeaveRequest[] = [
    {
      id: "req-1",
      organization_id: "org-1111",
      employee_id: "emp-1",
      employee: {
        id: "emp-1",
        employee_code: "EMP-001",
        first_name: "Alice",
        last_name: "Smith",
        designation: "Software Engineer",
      },
      leave_type_id: "type-vacation",
      leave_type: {
        id: "type-vacation",
        name: "Annual Vacation",
        code: "VAC",
        is_paid: true,
      },
      start_date: "2026-10-01",
      end_date: "2026-10-03",
      total_days: 3,
      reason: "Family trip",
      status: "pending",
      created_at: "2026-09-25T00:00:00Z",
      updated_at: "2026-09-25T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useOrganization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "leave.view",
        "leave.request",
        "leave.approve",
        "leave.cancel",
        "leave_types.manage",
        "holidays.view",
        "holidays.manage",
      ],
      isLoading: false,
    });

    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/leave-requests/summary")) return Promise.resolve(mockSummary);
      if (url.includes("/leave-types")) return Promise.resolve(mockLeaveTypes);
      if (url.includes("/holidays")) return Promise.resolve(mockHolidays);
      if (url.includes("/leave-requests")) return Promise.resolve(mockLeaveRequests);
      if (url.includes("/branches")) return Promise.resolve(mockBranches);
      if (url.includes("/employees")) {
        return Promise.resolve({
          items: [
            {
              id: "emp-1",
              employee_code: "EMP-001",
              first_name: "Alice",
              last_name: "Smith",
              designation: "Software Engineer",
            },
          ],
          meta: { total: 1, page: 1, page_size: 100, total_pages: 1 },
        });
      }
      return Promise.resolve([]);
    });
  });

  it("renders loading state when organization is loading", () => {
    (useOrganization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentOrganization: null,
      permissions: [],
      isLoading: true,
    });

    render(<LeavePage />);
    expect(screen.getByText(/loading leave balances/i)).toBeInTheDocument();
  });

  it("renders access denied when user lacks leave permissions", async () => {
    (useOrganization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [],
      isLoading: false,
    });

    render(<LeavePage />);
    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
  });

  it("renders KPI summary cards and leave breakdown", async () => {
    render(<LeavePage />);

    await waitFor(() => {
      expect(screen.getByText("Available Days")).toBeInTheDocument();
      expect(screen.getByText("22")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("Family trip")).toBeInTheDocument();
    });
  });

  it("submits a new leave request via modal", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "req-new",
      status: "pending",
    });

    render(<LeavePage />);

    await waitFor(() => {
      expect(screen.getByText("Request Leave")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Request Leave"));

    expect(screen.getByRole("heading", { name: "Request Leave" })).toBeInTheDocument();

    const leaveTypeSelect = screen.getByLabelText(/leave type \*/i);
    await user.selectOptions(leaveTypeSelect, "type-vacation");

    const startInput = screen.getByLabelText(/start date \*/i);
    fireEvent.change(startInput, { target: { value: "2026-11-01" } });

    const endInput = screen.getByLabelText(/end date \*/i);
    fireEvent.change(endInput, { target: { value: "2026-11-05" } });

    const submitBtn = screen.getByRole("button", { name: /submit request/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/leave-requests",
        expect.objectContaining({
          leave_type_id: "type-vacation",
          start_date: "2026-11-01",
          end_date: "2026-11-05",
        }),
        expect.anything()
      );
    });
  });

  it("allows employee to cancel a pending leave request", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "req-1",
      status: "cancelled",
    });

    render(<LeavePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "Cancel Leave Request" })).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /confirm cancellation/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/leave-requests/req-1/cancel",
        expect.anything(),
        expect.anything()
      );
    });
  });

  it("allows manager to approve a request in the approval queue", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "req-1",
      status: "approved",
    });

    render(<LeavePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Approval Queue" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Approval Queue" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /approve/i }));

    expect(screen.getByRole("heading", { name: "Approve Leave Request" })).toBeInTheDocument();

    const confirmApproveBtn = screen.getByRole("button", { name: "Approve Leave" });
    await user.click(confirmApproveBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/leave-requests/req-1/approve",
        expect.anything(),
        expect.anything()
      );
    });
  });

  it("renders holidays tab and allows adding a holiday", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "hol-2",
      name: "Independence Day",
      holiday_date: "2026-07-04",
      is_optional: false,
    });

    render(<LeavePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Holidays" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Holidays" }));

    await waitFor(() => {
      expect(screen.getByText("New Year's Day")).toBeInTheDocument();
    });

    const addHolidayBtns = screen.getAllByRole("button", { name: /add holiday/i });
    await user.click(addHolidayBtns[0]!);

    expect(screen.getByRole("heading", { name: "Add Holiday" })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/holiday name \*/i);
    await user.type(nameInput, "Independence Day");

    const dateInput = screen.getByLabelText(/date \*/i);
    fireEvent.change(dateInput, { target: { value: "2026-07-04" } });

    const submitBtn = screen.getByRole("button", { name: "Create Holiday" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/holidays",
        expect.objectContaining({
          name: "Independence Day",
          holiday_date: "2026-07-04",
        }),
        expect.anything()
      );
    });
  });
});

