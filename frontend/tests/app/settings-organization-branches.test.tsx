import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizationBranchesPage from "@/app/(protected)/settings/organization/branches/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { ApiException } from "@/types/api";
import type { Organization, BranchResponse } from "@/types/organization";

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

describe("OrganizationBranchesPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1111",
    name: "Acme Global",
    slug: "acme-global",
  };

  const mockBranches: BranchResponse[] = [
    {
      id: "branch-uuid-1",
      organization_id: "org-uuid-1111",
      name: "Headquarters - New York",
      code: "HQ-NY",
      address: "100 Broadway, New York, NY 10005",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
    {
      id: "branch-uuid-2",
      organization_id: "org-uuid-1111",
      name: "West Coast Hub",
      code: "SF-01",
      address: "500 Market St, San Francisco, CA",
      is_active: false,
      created_at: "2026-01-05T00:00:00Z",
      updated_at: "2026-01-06T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state when organization context is loading", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: null,
      organizations: [],
      permissions: [],
      membership: null,
      isLoadingOrgs: true,
      isLoadingPermissions: false,
      isLoading: true,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    render(<OrganizationBranchesPage />);
    expect(screen.getByText(/loading organization branches/i)).toBeInTheDocument();
  });

  it("renders empty state when no organization is selected", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: null,
      organizations: [],
      permissions: [],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    render(<OrganizationBranchesPage />);
    expect(screen.getByText(/no organization selected/i)).toBeInTheDocument();
  });

  it("renders access denied error when user lacks 'branches.view' permission", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["organizations.view"], // lacks branches.view
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    render(<OrganizationBranchesPage />);
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/requires 'branches.view'/i)).toBeInTheDocument();
  });

  it("loads and displays branch list with active organization context", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["branches.view", "branches.manage"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockImplementation((path: string, options) => {
      expect(options?.organizationId).toBe("org-uuid-1111");
      if (path === "/organizations/current/branches") {
        return Promise.resolve(mockBranches);
      }
      return Promise.reject(new Error("Unknown path"));
    });

    render(<OrganizationBranchesPage />);

    await waitFor(() => {
      expect(screen.getByText("Headquarters - New York")).toBeInTheDocument();
      expect(screen.getByText("HQ-NY")).toBeInTheDocument();
      expect(screen.getByText("100 Broadway, New York, NY 10005")).toBeInTheDocument();
      expect(screen.getByText("West Coast Hub")).toBeInTheDocument();
      expect(screen.getByText("SF-01")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Inactive")).toBeInTheDocument();
    });
  });

  it("renders empty state when branch list is empty", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["branches.view", "branches.manage"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockResolvedValue([]);

    render(<OrganizationBranchesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no branches configured/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create first branch/i })).toBeInTheDocument();
    });
  });

  it("disables manage actions when user has 'branches.view' but lacks 'branches.manage'", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["branches.view"], // view-only
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockResolvedValue(mockBranches);

    render(<OrganizationBranchesPage />);

    await waitFor(() => {
      expect(screen.getByText("Headquarters - New York")).toBeInTheDocument();
      expect(screen.getByText("Read-Only Mode")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /add branch/i })).not.toBeInTheDocument();
      const editButtons = screen.getAllByRole("button", { name: /edit/i });
      expect(editButtons[0]).toBeDisabled();
      expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
    });
  });

  it("creates a new branch successfully via modal submission", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["branches.view", "branches.manage"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockResolvedValue(mockBranches);

    const newBranch: BranchResponse = {
      id: "branch-uuid-3",
      organization_id: "org-uuid-1111",
      name: "Austin Technology Hub",
      code: "ATX-01",
      address: "200 Congress Ave, Austin, TX",
      is_active: true,
      created_at: "2026-01-10T00:00:00Z",
      updated_at: "2026-01-10T00:00:00Z",
    };

    vi.mocked(apiClient.post).mockResolvedValue(newBranch);

    render(<OrganizationBranchesPage />);

    await waitFor(() => {
      expect(screen.getByText("Headquarters - New York")).toBeInTheDocument();
    });

    const addBranchBtn = screen.getByRole("button", { name: /add branch/i });
    await user.click(addBranchBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add New Branch")).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/branch name/i);
    const codeInput = screen.getByLabelText(/branch code/i);
    const addressInput = screen.getByLabelText(/address/i);

    await user.type(nameInput, "Austin Technology Hub");
    await user.type(codeInput, "ATX-01");
    await user.type(addressInput, "200 Congress Ave, Austin, TX");

    const submitBtn = screen.getByRole("button", { name: /create branch/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/organizations/current/branches",
        {
          name: "Austin Technology Hub",
          code: "ATX-01",
          address: "200 Congress Ave, Austin, TX",
          is_active: true,
        },
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/branch "austin technology hub" created successfully/i)).toBeInTheDocument();
    });
  });

  it("handles branch creation 409 conflict error when code already exists", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["branches.view", "branches.manage"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockResolvedValue(mockBranches);
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiException("Branch with this code already exists", 409, "CONFLICT")
    );

    render(<OrganizationBranchesPage />);

    await waitFor(() => {
      expect(screen.getByText("Headquarters - New York")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /add branch/i }));

    const nameInput = screen.getByLabelText(/branch name/i);
    const codeInput = screen.getByLabelText(/branch code/i);

    await user.type(nameInput, "Duplicate Branch");
    await user.type(codeInput, "HQ-NY");

    await user.click(screen.getByRole("button", { name: /create branch/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /branch code "hq-ny" is already in use for this organization/i
      );
    });
  });

  it("updates an existing branch successfully via edit modal", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["branches.view", "branches.manage"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockResolvedValue(mockBranches);

    const firstBranch = mockBranches[0]!;
    const updatedBranch: BranchResponse = {
      ...firstBranch,
      name: "Global HQ - Manhattan",
    };

    vi.mocked(apiClient.patch).mockResolvedValue(updatedBranch);

    render(<OrganizationBranchesPage />);

    await waitFor(() => {
      expect(screen.getByText("Headquarters - New York")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    expect(editButtons[0]).toBeDefined();
    await user.click(editButtons[0]!);

    expect(screen.getByText("Edit Branch")).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/branch name/i);
    expect(nameInput).toHaveValue("Headquarters - New York");

    await user.clear(nameInput);
    await user.type(nameInput, "Global HQ - Manhattan");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/organizations/current/branches/branch-uuid-1",
        {
          name: "Global HQ - Manhattan",
          code: "HQ-NY",
          address: "100 Broadway, New York, NY 10005",
          is_active: true,
        },
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/branch "global hq - manhattan" updated successfully/i)).toBeInTheDocument();
    });
  });

  it("deactivates a branch successfully with soft-delete confirmation", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["branches.view", "branches.manage"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockResolvedValue(mockBranches);

    const firstBranch = mockBranches[0]!;
    const deactivatedBranch: BranchResponse = {
      ...firstBranch,
      is_active: false,
    };

    vi.mocked(apiClient.delete).mockResolvedValue(deactivatedBranch);

    render(<OrganizationBranchesPage />);

    await waitFor(() => {
      expect(screen.getByText("Headquarters - New York")).toBeInTheDocument();
    });

    const deactivateBtn = screen.getByRole("button", { name: /deactivate/i });
    await user.click(deactivateBtn);

    expect(screen.getByRole("heading", { name: "Deactivate Branch" })).toBeInTheDocument();
    expect(screen.getByText(/physically delete/i)).toBeInTheDocument();

    const confirmDeactivateBtn = screen.getByRole("button", { name: /deactivate branch/i });
    await user.click(confirmDeactivateBtn);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        "/organizations/current/branches/branch-uuid-1",
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/branch "headquarters - new york" has been deactivated/i)).toBeInTheDocument();
    });
  });
});
