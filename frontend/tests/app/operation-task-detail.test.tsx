import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import OperationTaskDetailPage from "@/app/(protected)/operations/tasks/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { OperationTaskDetail } from "@/types/operation";
import type { Organization } from "@/types/organization";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "task-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

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

describe("OperationTaskDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockTask: OperationTaskDetail = {
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
    checklists_count: 2,
    completed_checklists_count: 1,
    assignees_count: 1,
    checklists: [
      {
        id: "chk-1",
        organization_id: "org-uuid-1",
        task_id: "task-1",
        title: "Check HVAC units",
        sequence_order: 1,
        is_required: true,
        is_completed: true,
        completed_by_id: "emp-1",
        completed_at: "2025-01-01T10:00:00Z",
        notes: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_by: {
          id: "emp-1",
          employee_code: "EMP-001",
          first_name: "Alice",
          last_name: "Smith",
        },
      },
      {
        id: "chk-2",
        organization_id: "org-uuid-1",
        task_id: "task-1",
        title: "Verify emergency lighting",
        sequence_order: 2,
        is_required: false,
        is_completed: false,
        completed_by_id: null,
        completed_at: null,
        notes: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_by: null,
      },
    ],
    assignees: [
      {
        id: "asg-1",
        organization_id: "org-uuid-1",
        task_id: "task-1",
        employee_id: "emp-1",
        role: "primary_assignee",
        assigned_at: "2025-01-01T00:00:00Z",
        employee: {
          id: "emp-1",
          employee_code: "EMP-001",
          first_name: "Alice",
          last_name: "Smith",
        },
      },
    ],
  };

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

    vi.mocked(apiClient.get).mockResolvedValue({ data: mockTask } as any);
  });

  it("renders task title, task number, and badges", async () => {
    render(<OperationTaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Quarterly Facility Audit")).toBeInTheDocument();
    });

    expect(screen.getByText(/OPT-001/)).toBeInTheDocument();
    expect(screen.getByText("High", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("In Progress", { selector: "span" })).toBeInTheDocument();
  });

  it("renders checklist items and required badges", async () => {
    render(<OperationTaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Check HVAC units")).toBeInTheDocument();
    });

    expect(screen.getByText("Verify emergency lighting")).toBeInTheDocument();
    expect(screen.getByText("*required")).toBeInTheDocument();
  });

  it("renders action buttons for in_progress task", async () => {
    render(<OperationTaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Assign")).toBeInTheDocument();
  });

  it("renders assignees history list", async () => {
    render(<OperationTaskDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Assignees History")).toBeInTheDocument();
    });

    expect(screen.getByText("primary_assignee")).toBeInTheDocument();
  });
});
