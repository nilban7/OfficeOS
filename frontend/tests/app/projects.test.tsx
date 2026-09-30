import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectsPage from "@/app/(protected)/projects/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { ApiException } from "@/types/api";
import type { Organization } from "@/types/organization";
import type { Project, ProjectListResponse } from "@/types/project";

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

describe("ProjectsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockProjects: Project[] = [
    {
      id: "proj-uuid-1",
      organization_id: "org-uuid-1",
      project_code: "PRJ-ALPHA",
      name: "Alpha Initiative",
      description: "Strategic platform modernization",
      status: "active",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      budget: 120000,
      client_name: "Global Tech Corp",
      client_code: "GTC",
      project_manager_name: "Jane Doe",
      project_manager_code: "EMP-001",
      members_count: 5,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "proj-uuid-2",
      organization_id: "org-uuid-1",
      project_code: "PRJ-BETA",
      name: "Beta System",
      description: "Internal tooling build",
      status: "planned",
      start_date: "2026-06-01",
      end_date: "2026-11-30",
      budget: 45000,
      members_count: 2,
      created_at: "2026-02-01T00:00:00Z",
      updated_at: "2026-02-01T00:00:00Z",
    },
  ];

  const mockListResponse: ProjectListResponse = {
    items: mockProjects,
    meta: {
      total: 2,
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
      membership: null,
      permissions: ["projects.view", "projects.create", "projects.update", "projects.delete"],
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
      if (url === "/projects") {
        return Promise.resolve(mockListResponse);
      }
      if (url === "/clients") {
        return Promise.resolve({ items: [], meta: { total: 0, page: 1, page_size: 100, total_pages: 1 } });
      }
      if (url === "/employees") {
        return Promise.resolve({ items: [], meta: { total: 0, page: 1, page_size: 100, total_pages: 1 } });
      }
      return Promise.resolve(null);
    });
  });

  it("renders projects page and loads project data", async () => {
    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Initiative")).toBeInTheDocument();
      expect(screen.getByText("Beta System")).toBeInTheDocument();
      expect(screen.getByText("PRJ-ALPHA")).toBeInTheDocument();
      expect(screen.getByText("PRJ-BETA")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Projects")).toBeInTheDocument();
    expect(screen.getByText("Global Tech Corp")).toBeInTheDocument();
  });

  it("renders access restricted when user lacks projects.view", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      membership: null,
      permissions: [],
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    });
  });

  it("opens Add Project modal and submits a new project", async () => {
    const user = userEvent.setup();
    const newProject: Project = {
      id: "proj-uuid-3",
      organization_id: "org-uuid-1",
      project_code: "PRJ-GAMMA",
      name: "Gamma Initiative",
      description: "Cloud Migration",
      status: "planned",
      start_date: "2026-03-01",
      end_date: "2026-09-30",
      budget: 80000,
      members_count: 0,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };

    vi.mocked(apiClient.post).mockResolvedValue(newProject);

    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Initiative")).toBeInTheDocument();
    });

    const addBtn = screen.getByRole("button", { name: /add project/i });
    await user.click(addBtn);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: "Add New Project" })).toBeInTheDocument();

    const codeInput = within(modal).getByLabelText(/project code/i);
    const nameInput = within(modal).getByLabelText(/project name/i);
    const budgetInput = within(modal).getByLabelText(/budget/i);

    await user.type(codeInput, "PRJ-GAMMA");
    await user.type(nameInput, "Gamma Initiative");
    await user.type(budgetInput, "80000");

    const submitBtn = within(modal).getByRole("button", { name: "Create Project" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/projects",
        expect.objectContaining({
          project_code: "PRJ-GAMMA",
          name: "Gamma Initiative",
          budget: 80000,
        }),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });

  it("handles 409 conflict when creating project with duplicate code", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiException("Project with code 'PRJ-ALPHA' already exists in this organization", 409, "CONFLICT")
    );

    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Initiative")).toBeInTheDocument();
    });

    const addBtn = screen.getByRole("button", { name: /add project/i });
    await user.click(addBtn);

    const modal = screen.getByRole("dialog");
    const codeInput = within(modal).getByLabelText(/project code/i);
    const nameInput = within(modal).getByLabelText(/project name/i);

    await user.type(codeInput, "PRJ-ALPHA");
    await user.type(nameInput, "Duplicate Project");

    const submitBtn = within(modal).getByRole("button", { name: "Create Project" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        within(modal).getByText(/already exists in this organization/i)
      ).toBeInTheDocument();
    });
  });

  it("opens Edit Project modal and submits updates", async () => {
    const user = userEvent.setup();
    const proj0 = mockProjects[0]!;
    const updatedProj: Project = {
      ...proj0,
      name: "Alpha Initiative Modern",
    };

    vi.mocked(apiClient.patch).mockResolvedValue(updatedProj);

    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Initiative")).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTitle("Edit Project");
    expect(editBtns[0]).toBeDefined();
    await user.click(editBtns[0]!);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /edit project/i })).toBeInTheDocument();

    const nameInput = within(modal).getByLabelText(/project name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Alpha Initiative Modern");

    const saveBtn = within(modal).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        expect.stringContaining(`/projects/${proj0.id}`),
        expect.objectContaining({
          name: "Alpha Initiative Modern",
        }),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });

  it("opens Cancel modal and cancels project on confirmation", async () => {
    const user = userEvent.setup();
    const proj0 = mockProjects[0]!;
    vi.mocked(apiClient.delete).mockResolvedValue({
      id: proj0.id,
      status: "cancelled",
      message: "Project cancelled successfully",
    });

    render(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Initiative")).toBeInTheDocument();
    });

    const cancelBtns = screen.getAllByTitle("Cancel Project");
    expect(cancelBtns[0]).toBeDefined();
    await user.click(cancelBtns[0]!);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: "Cancel Project" })).toBeInTheDocument();

    const confirmBtn = within(modal).getByRole("button", { name: "Cancel Project" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/projects/${proj0.id}`),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });
});
