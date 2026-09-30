import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OperationsPage from "@/app/(protected)/operations/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { OperationTask } from "@/types/operation";
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

describe("OperationsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockTasks: OperationTask[] = [
    {
      id: "task-1",
      organization_id: "org-uuid-1",
      task_number: "OPT-001",
      title: "Quarterly Facility Audit",
      description: "Inspection of main warehouse utilities",
      category: "Facility",
      priority: "high",
      status: "in_progress",
      requester_id: null,
      assigned_to_id: "emp-1",
      department_id: null,
      branch_id: null,
      project_id: null,
      client_id: null,
      asset_id: null,
      due_date: "2025-09-30",
      completed_at: null,
      notes: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      assigned_to: {
        id: "emp-1",
        employee_code: "EMP-001",
        first_name: "Alice",
        last_name: "Smith",
      },
      checklists_count: 3,
      completed_checklists_count: 1,
      assignees_count: 1,
    },
    {
      id: "task-2",
      organization_id: "org-uuid-1",
      task_number: "OPT-002",
      title: "Server Backup Verification",
      description: "Check offsite storage snapshots",
      category: "IT",
      priority: "urgent",
      status: "open",
      requester_id: null,
      assigned_to_id: null,
      department_id: null,
      branch_id: null,
      project_id: null,
      client_id: null,
      asset_id: null,
      due_date: "2025-09-15",
      completed_at: null,
      notes: null,
      created_at: "2025-01-02T00:00:00Z",
      updated_at: "2025-01-02T00:00:00Z",
      checklists_count: 1,
      completed_checklists_count: 0,
      assignees_count: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "operations.view",
        "operations.create",
        "operations.update",
        "operations.delete",
        "operations.assign",
        "operations.complete",
        "operations.manage",
      ],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/operations/tasks")) {
        return Promise.resolve({
          data: { items: mockTasks, total: 2, page: 1, page_size: 20, total_pages: 1 },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });
  });

  it("renders operations hub, KPI metrics, and task list", async () => {
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Operations Management")).toBeInTheDocument();
    });

    expect(screen.getByText("Quarterly Facility Audit")).toBeInTheDocument();
    expect(screen.getByText("OPT-001")).toBeInTheDocument();
    expect(screen.getByText("Server Backup Verification")).toBeInTheDocument();
    expect(screen.getByText("OPT-002")).toBeInTheDocument();
  });

  it("displays priority and status badges correctly", async () => {
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("High", { selector: "span" })).toBeInTheDocument();
    });

    expect(screen.getByText("In Progress", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Urgent", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Open", { selector: "span" })).toBeInTheDocument();
  });

  it("shows empty state when no tasks are found", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 1 },
    } as any);

    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("No operation tasks found")).toBeInTheDocument();
    });
  });

  it("shows access denied when user lacks operations.view", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [],
      isLoading: false,
    } as any);

    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
    });
  });

  it("opens create task modal when New Task button is clicked", async () => {
    const user = userEvent.setup();
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("New Task")).toBeInTheDocument();
    });

    await user.click(screen.getByText("New Task"));
    expect(screen.getByText("New Operation Task", { selector: "[role='dialog'] *" })).toBeInTheDocument();
  });

  it("displays assignee name and checklist progress count", async () => {
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    expect(screen.getByText("Checklist: 1/3")).toBeInTheDocument();
  });
});
