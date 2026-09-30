import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaintenanceRequestDetailPage from "@/app/(protected)/maintenance/requests/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { MaintenanceRequestDetail } from "@/types/maintenance";
import type { Organization } from "@/types/organization";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "req-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("MaintenanceRequestDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockRequestDetail: MaintenanceRequestDetail = {
    id: "req-1",
    organization_id: "org-uuid-1",
    request_number: "MTR-2026-001",
    asset_id: "asset-1",
    requester_id: "emp-1",
    issue_title: "Screen glitching continuously",
    issue_description: "Display has horizontal lines and random flickering",
    priority: "high",
    requested_date: "2026-02-01",
    status: "submitted",
    notes: "Requires quick turnaround for QA lead",
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    asset: {
      id: "asset-1",
      asset_code: "AST-2026-001",
      name: "MacBook Pro 16 M3 Max",
      status: "available",
      condition: "good",
    },
    requester: {
      id: "emp-1",
      employee_code: "EMP-001",
      first_name: "Alice",
      last_name: "Engineer",
    },
    records: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      membership: null,
      permissions: [
        "maintenance.view",
        "maintenance.create",
        "maintenance.update",
        "maintenance.delete",
        "maintenance.assign",
        "maintenance.complete",
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

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === "/maintenance-requests/req-1") {
        return Promise.resolve(mockRequestDetail as any);
      }
      return Promise.resolve({} as any);
    });
  });

  it("renders request overview and asset information", async () => {
    render(<MaintenanceRequestDetailPage />);

    expect(await screen.findByText("Screen glitching continuously")).toBeInTheDocument();
    expect(screen.getByText(/MTR-2026-001/)).toBeInTheDocument();
    expect(screen.getByText(/MacBook Pro 16 M3 Max/)).toBeInTheDocument();
    expect(screen.getByText("Alice Engineer")).toBeInTheDocument();
  });

  it("approves request via modal action", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({ success: true } as any);

    render(<MaintenanceRequestDetailPage />);

    const approveBtn = await screen.findByRole("button", { name: /^approve$/i });
    await user.click(approveBtn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Approve Maintenance Request" })).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", { name: /confirm approval/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/maintenance-requests/req-1/approve",
        expect.anything(),
        expect.anything()
      );
    });
  });
});
