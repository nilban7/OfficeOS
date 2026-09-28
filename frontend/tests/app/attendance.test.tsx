import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttendancePage from "@/app/(protected)/attendance/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization, BranchResponse } from "@/types/organization";
import type { Department, Employee } from "@/types/employee";
import type {
  AttendanceRecord,
  AttendanceSummary,
  PaginatedAttendance,
} from "@/types/attendance";

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

describe("AttendancePage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1111",
    name: "Acme Global",
    slug: "acme-global",
  };

  const mockBranches: BranchResponse[] = [
    {
      id: "branch-uuid-1",
      organization_id: "org-uuid-1111",
      name: "Headquarters",
      code: "HQ",
      address: "100 Broadway, NY",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockDepartments: Department[] = [
    {
      id: "dept-uuid-1",
      organization_id: "org-uuid-1111",
      name: "Engineering",
      code: "ENG",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockEmployees: Employee[] = [
    {
      id: "emp-uuid-1",
      organization_id: "org-uuid-1111",
      employee_code: "EMP-001",
      first_name: "Alice",
      last_name: "Smith",
      designation: "Staff Engineer",
      employment_type: "full_time",
      status: "active",
      date_of_joining: "2024-01-01",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockSummary: AttendanceSummary = {
    date: "2026-09-28",
    total_active_employees: 12,
    present_count: 8,
    late_count: 2,
    half_day_count: 1,
    absent_count: 1,
    on_leave_count: 0,
    marked_count: 12,
  };

  const mockAttendanceItem: AttendanceRecord = {
    id: "att-uuid-1",
    organization_id: "org-uuid-1111",
    employee_id: "emp-uuid-1",
    employee: {
      id: "emp-uuid-1",
      employee_code: "EMP-001",
      first_name: "Alice",
      last_name: "Smith",
      designation: "Staff Engineer",
      department_name: "Engineering",
      branch_name: "Headquarters",
    },
    branch_id: "branch-uuid-1",
    branch: {
      id: "branch-uuid-1",
      name: "Headquarters",
      code: "HQ",
    },
    work_date: "2026-09-28",
    check_in_at: "2026-09-28T09:00:00Z",
    check_out_at: "2026-09-28T17:30:00Z",
    status: "present",
    notes: "Regular shift",
    created_at: "2026-09-28T09:00:00Z",
    updated_at: "2026-09-28T17:30:00Z",
  };

  const mockAttendanceData: PaginatedAttendance = {
    items: [mockAttendanceItem],
    meta: {
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      membership: {
        id: "mem-uuid-1",
        organizationId: "org-uuid-1111",
        organization: mockOrg,
        userId: "user-uuid-1",
        role: null,
        permissions: [
          "attendance.view",
          "attendance.create",
          "attendance.update",
          "attendance.delete",
        ],
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      permissions: [
        "attendance.view",
        "attendance.create",
        "attendance.update",
        "attendance.delete",
      ],
      isLoading: false,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockImplementation((endpoint: string) => {
      if (endpoint === "/departments") {
        return Promise.resolve(mockDepartments);
      }
      if (endpoint === "/organizations/current/branches") {
        return Promise.resolve(mockBranches);
      }
      if (endpoint === "/employees") {
        return Promise.resolve({ items: mockEmployees, meta: { total: 1, page: 1, page_size: 100, total_pages: 1 } });
      }
      if (endpoint === "/attendance/summary") {
        return Promise.resolve(mockSummary);
      }
      if (endpoint === "/attendance/today") {
        return Promise.resolve(null);
      }
      if (endpoint === "/attendance") {
        return Promise.resolve(mockAttendanceData);
      }
      return Promise.resolve(null);
    });
  });

  it("renders loading state when organization context is loading", () => {
    vi.mocked(useOrganization).mockReturnValueOnce({
      currentOrganization: null,
      organizations: [],
      membership: null,
      permissions: [],
      isLoading: true,
      isLoadingOrgs: true,
      isLoadingPermissions: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    render(<AttendancePage />);
    expect(screen.getByText(/loading organization context/i)).toBeInTheDocument();
  });

  it("renders access restricted when user lacks attendance.view", () => {
    vi.mocked(useOrganization).mockReturnValueOnce({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      membership: null,
      permissions: [],
      isLoading: false,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    render(<AttendancePage />);
    expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
  });

  it("loads and displays attendance metrics and records table", async () => {
    render(<AttendancePage />);

    await waitFor(() => {
      expect(screen.getByText(/Attendance & Time Tracking/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Present Today")).toBeInTheDocument();
    expect(screen.getByText("Late Today")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("EMP-001 • Staff Engineer")).toBeInTheDocument();
    expect(screen.getByText("Regular shift")).toBeInTheDocument();
  });

  it("renders empty state when attendance list is empty", async () => {
    vi.mocked(apiClient.get).mockImplementation((endpoint: string) => {
      if (endpoint === "/attendance") {
        return Promise.resolve({ items: [], meta: { total: 0, page: 1, page_size: 20, total_pages: 1 } });
      }
      return Promise.resolve(null);
    });

    render(<AttendancePage />);

    await waitFor(() => {
      expect(screen.getByText(/No Attendance Records Found/i)).toBeInTheDocument();
    });
  });

  it("executes quick Clock In successfully", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockAttendanceItem);

    render(<AttendancePage />);

    await waitFor(() => {
      expect(screen.getByText("Clock In Now")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Clock In Now"));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/attendance/clock-in",
        expect.objectContaining({
          organizationId: "org-uuid-1111",
        })
      );
    });
  });

  it("opens Mark Attendance modal and creates record", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockAttendanceItem);

    render(<AttendancePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mark Attendance/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Mark Attendance/i }));

    expect(screen.getByText("Mark Attendance Record")).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: /Save Record/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/attendance",
        expect.objectContaining({
          organizationId: "org-uuid-1111",
        })
      );
    });
  });

  it("opens Edit modal and updates attendance record", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValueOnce(mockAttendanceItem);

    render(<AttendancePage />);

    await waitFor(() => {
      expect(screen.getByTitle("Edit attendance")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Edit attendance"));

    expect(screen.getByText("Edit Attendance Record")).toBeInTheDocument();

    const updateBtn = screen.getByRole("button", { name: /Update Record/i });
    await user.click(updateBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/attendance/att-uuid-1",
        expect.objectContaining({
          organizationId: "org-uuid-1111",
        })
      );
    });
  });

  it("opens Delete modal and deletes attendance record", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValueOnce({ id: "att-uuid-1" });

    render(<AttendancePage />);

    await waitFor(() => {
      expect(screen.getByTitle("Delete record")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Delete record"));

    expect(screen.getByText("Delete Attendance Record")).toBeInTheDocument();

    const deleteBtns = screen.getAllByRole("button", { name: /Delete Record/i });
    const modalDeleteBtn = deleteBtns[deleteBtns.length - 1];
    if (modalDeleteBtn) {
      await user.click(modalDeleteBtn);
    }

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        "/attendance/att-uuid-1",
        expect.objectContaining({
          organizationId: "org-uuid-1111",
        })
      );
    });
  });

  it("renders read-only mode when user has attendance.view but lacks create/update/delete", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      membership: {
        id: "mem-uuid-1",
        organizationId: "org-uuid-1111",
        organization: mockOrg,
        userId: "user-uuid-1",
        role: null,
        permissions: ["attendance.view"],
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      permissions: ["attendance.view"],
      isLoading: false,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    render(<AttendancePage />);

    await waitFor(() => {
      expect(screen.getByText(/Attendance & Time Tracking/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Mark Attendance/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Edit attendance")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete record")).not.toBeInTheDocument();
  });
});
