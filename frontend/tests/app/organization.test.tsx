import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizationPage from "@/app/(protected)/organization/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization, OrganizationProfile, OrganizationSettings, BranchResponse, MemberResponse, RoleResponse } from "@/types/organization";
import type { Department } from "@/types/employee";

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

describe("OrganizationPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1111",
    name: "Acme Global Enterprise",
    slug: "acme-global",
    createdAt: "2026-01-01T00:00:00Z",
  };

  const mockProfile: OrganizationProfile = {
    id: "org-uuid-1111",
    name: "Acme Global Enterprise",
    slug: "acme-global",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };

  const mockSettings: OrganizationSettings = {
    id: "settings-uuid-2222",
    organization_id: "org-uuid-1111",
    timezone: "Asia/Kolkata",
    currency: "INR",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };

  const mockBranches: BranchResponse[] = [
    {
      id: "branch-1",
      organization_id: "org-uuid-1111",
      name: "Global HQ",
      code: "HQ",
      address: "100 Main Boulevard",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockDepts: Department[] = [
    {
      id: "dept-1",
      organization_id: "org-uuid-1111",
      name: "Engineering & AI",
      code: "ENG",
      description: "Core platform engineering",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockRoles: RoleResponse[] = [
    {
      id: "role-admin",
      name: "organization_owner",
      description: "Full control",
      is_system: true,
    },
  ];

  const mockMembers: MemberResponse[] = [
    {
      id: "mem-1",
      organization_id: "org-uuid-1111",
      profile_id: "prof-1",
      status: "active",
      profile: {
        id: "prof-1",
        email: "owner@acme.com",
        first_name: "Niladri",
        last_name: "Banerjee",
      },
      roles: mockRoles,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useOrganization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "organizations.view",
        "organizations.update",
        "branches.view",
        "branches.manage",
        "departments.view",
        "departments.manage",
        "members.view",
        "members.manage",
      ],
      isLoading: false,
    });

    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/organizations/current") return Promise.resolve(mockProfile);
      if (url === "/organizations/current/settings") return Promise.resolve(mockSettings);
      if (url === "/organizations/current/branches") return Promise.resolve(mockBranches);
      if (url === "/departments") return Promise.resolve(mockDepts);
      if (url === "/organizations/current/members") return Promise.resolve(mockMembers);
      if (url === "/organizations/current/roles") return Promise.resolve(mockRoles);
      return Promise.resolve([]);
    });
  });

  it("renders organization overview with profile, metrics, and settings summary", async () => {
    render(<OrganizationPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Acme Global Enterprise").length).toBeGreaterThan(0);
      expect(screen.getByText("Corporate Hierarchy")).toBeInTheDocument();
      expect(screen.getByText("Active Tenant")).toBeInTheDocument();
    });

    expect(screen.getByText("Corporate Slug")).toBeInTheDocument();
    expect(screen.getByText("acme-global")).toBeInTheDocument();
    expect(screen.getByText(/INR • Asia\/Kolkata/i)).toBeInTheDocument();
  });

  it("allows switching tabs to Branches, Departments, and Members", async () => {
    const user = userEvent.setup();
    render(<OrganizationPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Acme Global Enterprise").length).toBeGreaterThan(0);
    });

    // 1. Switch to Branches Tab
    const branchesTab = screen.getByRole("button", { name: /^branches/i });
    await user.click(branchesTab);

    await waitFor(() => {
      expect(screen.getByText("Branch Name")).toBeInTheDocument();
      expect(screen.getByText("HQ")).toBeInTheDocument();
      expect(screen.getByText("Global HQ")).toBeInTheDocument();
    });

    // 2. Switch to Departments Tab
    const deptsTab = screen.getByRole("button", { name: /departments/i });
    await user.click(deptsTab);

    await waitFor(() => {
      expect(screen.getByText("Engineering & AI")).toBeInTheDocument();
      expect(screen.getByText("ENG")).toBeInTheDocument();
    });

    // 3. Switch to Members Tab
    const membersTab = screen.getByRole("button", { name: /members/i });
    await user.click(membersTab);

    await waitFor(() => {
      expect(screen.getByText("Niladri Banerjee")).toBeInTheDocument();
      expect(screen.getByText("owner@acme.com")).toBeInTheDocument();
    });
  });

  it("renders access denied if user lacks organizations.view permission", () => {
    (useOrganization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [],
      isLoading: false,
    });

    render(<OrganizationPage />);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });
});
