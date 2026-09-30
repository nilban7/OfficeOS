import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectDetailPage from "@/app/(protected)/projects/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization } from "@/types/organization";
import type { ProjectDetail, ProjectMember } from "@/types/project";
import type { Employee } from "@/types/employee";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "proj-uuid-1" }),
  useRouter: () => ({
    push: mockPush,
  }),
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

describe("ProjectDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockMembers: ProjectMember[] = [
    {
      id: "member-uuid-1",
      organization_id: "org-uuid-1",
      project_id: "proj-uuid-1",
      employee_id: "emp-uuid-1",
      employee_name: "Alice Johnson",
      employee_code: "EMP-001",
      employee_designation: "Principal Architect",
      role: "Lead Architect",
      allocation_percentage: 100,
      start_date: "2026-01-01",
      end_date: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "member-uuid-2",
      organization_id: "org-uuid-1",
      project_id: "proj-uuid-1",
      employee_id: "emp-uuid-2",
      employee_name: "Bob Williams",
      employee_code: "EMP-002",
      employee_designation: "Senior Frontend Engineer",
      role: "Frontend Lead",
      allocation_percentage: 50,
      start_date: "2026-02-01",
      end_date: null,
      created_at: "2026-02-01T00:00:00Z",
      updated_at: "2026-02-01T00:00:00Z",
    },
  ];

  const mockProjectDetail: ProjectDetail = {
    id: "proj-uuid-1",
    organization_id: "org-uuid-1",
    project_code: "PRJ-ALPHA",
    name: "Alpha Initiative",
    description: "Next generation core platform",
    status: "active",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    budget: 150000,
    client_name: "Global Tech Corp",
    client_code: "GTC",
    project_manager_name: "Alice Johnson",
    project_manager_code: "EMP-001",
    members_count: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    members: mockMembers,
  };

  const mockAvailableEmployees: Employee[] = [
    {
      id: "emp-uuid-3",
      organization_id: "org-uuid-1",
      employee_code: "EMP-003",
      first_name: "Charlie",
      last_name: "Davis",
      designation: "QA Engineer",
      employment_type: "full_time",
      status: "active",
      date_of_joining: "2025-05-01",
      is_active: true,
      created_at: "2025-05-01T00:00:00Z",
      updated_at: "2025-05-01T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      membership: null,
      permissions: [
        "projects.view",
        "projects.update",
        "projects.delete",
        "project_members.view",
        "project_members.manage",
      ],
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === `/projects/${mockProjectDetail.id}`) {
        return Promise.resolve(mockProjectDetail);
      }
      if (url === "/employees") {
        return Promise.resolve({
          items: mockAvailableEmployees,
          meta: { total: 1, page: 1, page_size: 100, total_pages: 1 },
        });
      }
      return Promise.resolve(null);
    });
  });

  it("renders project detail and team members list correctly", async () => {
    render(<ProjectDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Initiative")).toBeInTheDocument();
      expect(screen.getByText("PRJ-ALPHA")).toBeInTheDocument();
      expect(screen.getAllByText("Alice Johnson").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Bob Williams")).toBeInTheDocument();
    });

    expect(screen.getByText("Lead Architect")).toBeInTheDocument();
    expect(screen.getByText("Frontend Lead")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("opens Add Team Member modal and adds a new member", async () => {
    const user = userEvent.setup();
    const newMember: ProjectMember = {
      id: "member-uuid-3",
      organization_id: "org-uuid-1",
      project_id: "proj-uuid-1",
      employee_id: "emp-uuid-3",
      employee_name: "Charlie Davis",
      employee_code: "EMP-003",
      employee_designation: "QA Engineer",
      role: "QA Lead",
      allocation_percentage: 100,
      start_date: "2026-03-01",
      end_date: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };

    vi.mocked(apiClient.post).mockResolvedValue(newMember);

    render(<ProjectDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Initiative")).toBeInTheDocument();
    });

    const addBtn = screen.getByRole("button", { name: /add team member/i });
    await user.click(addBtn);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: "Add Team Member" })).toBeInTheDocument();

    const empSelect = within(modal).getByLabelText(/select employee/i);
    const roleInput = within(modal).getByLabelText(/role on project/i);

    await user.selectOptions(empSelect, "emp-uuid-3");
    await user.type(roleInput, "QA Lead");

    const submitBtn = within(modal).getByRole("button", { name: "Add Member" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining(`/projects/${mockProjectDetail.id}/members`),
        expect.objectContaining({
          employee_id: "emp-uuid-3",
          role: "QA Lead",
          allocation_percentage: 100,
        }),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });

  it("opens Edit Member modal and updates allocation percentage", async () => {
    const user = userEvent.setup();
    const member0 = mockMembers[0]!;
    const updatedMember: ProjectMember = {
      ...member0,
      allocation_percentage: 80,
    };

    vi.mocked(apiClient.patch).mockResolvedValue(updatedMember);

    render(<ProjectDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Initiative")).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTitle("Edit Member");
    expect(editBtns[0]).toBeDefined();
    await user.click(editBtns[0]!);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /edit member/i })).toBeInTheDocument();

    const allocInput = within(modal).getByLabelText(/allocation %/i);
    await user.clear(allocInput);
    await user.type(allocInput, "80");

    const saveBtn = within(modal).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        expect.stringContaining(`/projects/${mockProjectDetail.id}/members/${member0.id}`),
        expect.objectContaining({
          allocation_percentage: 80,
        }),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });

  it("opens Remove Member modal and confirms removal", async () => {
    const user = userEvent.setup();
    const member1 = mockMembers[1]!;
    vi.mocked(apiClient.delete).mockResolvedValue({
      deleted: true,
      message: "Project member removed successfully",
    });

    render(<ProjectDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob Williams")).toBeInTheDocument();
    });

    const removeBtns = screen.getAllByTitle("Remove Member");
    expect(removeBtns[1]).toBeDefined();
    await user.click(removeBtns[1]!);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /remove member from project/i })).toBeInTheDocument();

    const confirmBtn = within(modal).getByRole("button", { name: "Remove Member" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/projects/${mockProjectDetail.id}/members/${member1.id}`),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });
});
