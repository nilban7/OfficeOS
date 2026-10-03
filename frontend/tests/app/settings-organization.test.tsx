import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizationSettingsPage from "@/app/(protected)/settings/organization/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { ApiException } from "@/types/api";
import type { Organization, OrganizationProfile, OrganizationSettings } from "@/types/organization";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

describe("OrganizationSettingsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1111",
    name: "Acme Global",
    slug: "acme-global",
    createdAt: "2026-01-01T00:00:00Z",
  };

  const mockProfile: OrganizationProfile = {
    id: "org-uuid-1111",
    name: "Acme Global",
    slug: "acme-global",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };

  const mockSettings: OrganizationSettings = {
    id: "settings-uuid-2222",
    organization_id: "org-uuid-1111",
    timezone: "UTC",
    currency: "USD",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };

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

    render(<OrganizationSettingsPage />);
    expect(screen.getByText(/loading organization settings/i)).toBeInTheDocument();
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

    render(<OrganizationSettingsPage />);
    expect(screen.getByText(/no organization selected/i)).toBeInTheDocument();
  });

  it("renders access denied error when lacking 'organizations.view' permission", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["employees.view"], // lacks organizations.view
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

    render(<OrganizationSettingsPage />);
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/requires 'organizations.view'/i)).toBeInTheDocument();
  });

  it("loads and displays organization profile and settings successfully with active organization context", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["organizations.view", "organizations.update", "organizations.settings_manage"],
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
      if (path === "/organizations/current") {
        return Promise.resolve(mockProfile);
      }
      if (path === "/organizations/current/settings") {
        return Promise.resolve(mockSettings);
      }
      return Promise.reject(new Error("Unknown path"));
    });

    render(<OrganizationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/organization name/i)).toHaveValue("Acme Global");
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue("acme-global");
      expect(screen.getByLabelText(/organization timezone/i)).toHaveValue("UTC");
      expect(screen.getByLabelText(/default currency/i)).toHaveValue("USD");
      expect(screen.getByText("Active Workspace")).toBeInTheDocument();
    });
  });

  it("disables profile and settings inputs when user has view but lacks update and settings_manage permissions", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["organizations.view"], // view-only
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

    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === "/organizations/current") {
        return Promise.resolve(mockProfile);
      }
      return Promise.resolve({});
    });

    render(<OrganizationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/organization name/i)).toBeDisabled();
      expect(screen.getByText("Read-Only")).toBeInTheDocument();
      expect(screen.getByText(/requires settings_manage permission/i)).toBeInTheDocument();
    });
  });

  it("updates organization profile successfully on submit", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["organizations.view", "organizations.update", "organizations.settings_manage"],
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

    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === "/organizations/current") return Promise.resolve(mockProfile);
      if (path === "/organizations/current/settings") return Promise.resolve(mockSettings);
      return Promise.reject(new Error("Unknown path"));
    });

    const updatedProfile: OrganizationProfile = {
      ...mockProfile,
      name: "Acme Global International",
    };

    vi.mocked(apiClient.patch).mockImplementation((path: string, body, options) => {
      expect(options?.organizationId).toBe("org-uuid-1111");
      if (path === "/organizations/current") {
        expect(body).toEqual({ name: "Acme Global International" });
        return Promise.resolve(updatedProfile);
      }
      return Promise.reject(new Error("Unknown path"));
    });

    render(<OrganizationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/organization name/i)).toHaveValue("Acme Global");
    });

    const nameInput = screen.getByLabelText(/organization name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Acme Global International");

    const saveProfileBtn = screen.getByRole("button", { name: /save profile/i });
    expect(saveProfileBtn).toBeEnabled();
    await user.click(saveProfileBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/organizations/current",
        { name: "Acme Global International" },
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/organization profile updated successfully/i)).toBeInTheDocument();
    });
  });

  it("updates organization settings successfully on submit", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["organizations.view", "organizations.update", "organizations.settings_manage"],
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

    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === "/organizations/current") return Promise.resolve(mockProfile);
      if (path === "/organizations/current/settings") return Promise.resolve(mockSettings);
      return Promise.reject(new Error("Unknown path"));
    });

    const updatedSettings: OrganizationSettings = {
      ...mockSettings,
      timezone: "America/New_York",
      currency: "EUR",
    };

    vi.mocked(apiClient.patch).mockImplementation((path: string, body, options) => {
      expect(options?.organizationId).toBe("org-uuid-1111");
      if (path === "/organizations/current/settings") {
        expect(body).toEqual({ timezone: "America/New_York", currency: "EUR" });
        return Promise.resolve(updatedSettings);
      }
      return Promise.reject(new Error("Unknown path"));
    });

    render(<OrganizationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/organization timezone/i)).toHaveValue("UTC");
    });

    const tzSelect = screen.getByLabelText(/organization timezone/i);
    const currSelect = screen.getByLabelText(/default currency/i);

    fireEvent.change(tzSelect, { target: { value: "America/New_York" } });
    fireEvent.change(currSelect, { target: { value: "EUR" } });

    const saveSettingsBtn = screen.getByRole("button", { name: /save settings/i });
    expect(saveSettingsBtn).toBeEnabled();
    await user.click(saveSettingsBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/organizations/current/settings",
        { timezone: "America/New_York", currency: "EUR" },
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/organization settings updated successfully/i)).toBeInTheDocument();
    });
  });

  it("handles API error feedback properly when profile save fails with 422 or 403", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["organizations.view", "organizations.update", "organizations.settings_manage"],
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

    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === "/organizations/current") return Promise.resolve(mockProfile);
      if (path === "/organizations/current/settings") return Promise.resolve(mockSettings);
      return Promise.reject(new Error("Unknown path"));
    });

    vi.mocked(apiClient.patch).mockRejectedValue(
      new ApiException("Organization name already in use", 422, "VALIDATION_ERROR")
    );

    render(<OrganizationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/organization name/i)).toHaveValue("Acme Global");
    });

    const nameInput = screen.getByLabelText(/organization name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Existing Corp");

    const saveProfileBtn = screen.getByRole("button", { name: /save profile/i });
    await user.click(saveProfileBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/validation error: organization name already in use/i);
    });
  });
});
