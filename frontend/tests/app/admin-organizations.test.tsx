import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SaaSAdminOrganizationsPage from "@/app/(protected)/admin/organizations/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { OrganizationDirectoryResponse } from "@/types/saas";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/organizations",
  useParams: () => ({}),
}));

describe("SaaSAdminOrganizationsPage Component", () => {
  const mockSysAdminContext = {
    currentOrganization: { id: "org-1", name: "SysAdmin Org", slug: "sysadmin-org" },
    membership: null,
    organizations: [],
    permissions: ["saas.view", "saas.manage"],
    userRole: "system_admin",
    isLoading: false,
    error: null,
    selectOrganization: vi.fn(),
    refetchOrganizations: vi.fn(),
    switchOrganization: vi.fn(),
  };

  const mockDirectory: OrganizationDirectoryResponse = {
    items: [
      {
        id: "org-alpha",
        name: "Alpha Corp",
        slug: "alpha-corp",
        status: "active",
        is_active: true,
        branch_count: 3,
        member_count: 12,
        employee_count: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "org-beta",
        name: "Beta Logistics",
        slug: "beta-logistics",
        status: "suspended",
        is_active: false,
        branch_count: 1,
        member_count: 4,
        employee_count: 3,
        suspension_reason: "Account review",
        suspended_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    total: 2,
    page: 1,
    page_size: 15,
    total_pages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders organizations list with statuses and metrics", async () => {
    vi.mocked(useOrganization).mockReturnValue(mockSysAdminContext as any);
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockDirectory as any);

    render(<SaaSAdminOrganizationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Corp")).toBeInTheDocument();
      expect(screen.getByText("alpha-corp")).toBeInTheDocument();
      expect(screen.getByText("Beta Logistics")).toBeInTheDocument();
      expect(screen.getByText("Account review")).toBeInTheDocument();
      expect(screen.getByText("Total: 2")).toBeInTheDocument();
    });
  });

  it("opens suspend modal, accepts reason, and executes suspension", async () => {
    vi.mocked(useOrganization).mockReturnValue(mockSysAdminContext as any);
    vi.mocked(apiClient.get).mockResolvedValue(mockDirectory as any);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ status: "success" } as any);

    const user = userEvent.setup();
    render(<SaaSAdminOrganizationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpha Corp")).toBeInTheDocument();
    });

    const suspendBtn = screen.getByRole("button", { name: /^Suspend$/ });
    await user.click(suspendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Suspend Organization: Alpha Corp/i)).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText(/Delinquent account/i);
    await user.type(reasonInput, "Non-payment of invoice");

    const confirmBtn = screen.getByRole("button", { name: /Confirm Suspension/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining("/admin/organizations/org-alpha/suspend"),
        expect.objectContaining({
          reason: "Non-payment of invoice",
        })
      );
    });
  });

  it("executes restore action for suspended organization", async () => {
    vi.mocked(useOrganization).mockReturnValue(mockSysAdminContext as any);
    vi.mocked(apiClient.get).mockResolvedValue(mockDirectory as any);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ status: "success" } as any);

    const user = userEvent.setup();
    render(<SaaSAdminOrganizationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Beta Logistics")).toBeInTheDocument();
    });

    const restoreBtn = screen.getByRole("button", { name: /Restore/i });
    await user.click(restoreBtn);

    await waitFor(() => {
      expect(screen.getByText(/Restore Organization: Beta Logistics/i)).toBeInTheDocument();
    });

    const confirmRestoreBtn = screen.getByRole("button", { name: /Confirm Restore/i });
    await user.click(confirmRestoreBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining("/admin/organizations/org-beta/restore"),
        {}
      );
    });
  });
});
