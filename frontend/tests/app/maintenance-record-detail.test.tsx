import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaintenanceRecordDetailPage from "@/app/(protected)/maintenance/records/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { MaintenanceRecordDetail } from "@/types/maintenance";
import type { Organization } from "@/types/organization";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "rec-1" }),
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

describe("MaintenanceRecordDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockRecordDetail: MaintenanceRecordDetail = {
    id: "rec-1",
    organization_id: "org-uuid-1",
    record_number: "MNT-2026-001",
    asset_id: "asset-1",
    maintenance_type: "corrective",
    start_date: "2026-02-02",
    status: "scheduled",
    description: "Display panel replacement and hinge tuning",
    parts_description: "Retina 16-inch LCD Assembly",
    labor_cost: 150,
    parts_cost: 300,
    other_cost: 25,
    total_cost: 475,
    notes: "Express repair turnaround",
    created_at: "2026-02-02T10:00:00Z",
    updated_at: "2026-02-02T10:00:00Z",
    asset: {
      id: "asset-1",
      asset_code: "AST-2026-001",
      name: "MacBook Pro 16",
      status: "available",
      condition: "fair",
    },
    technician: {
      id: "emp-2",
      employee_code: "EMP-002",
      first_name: "Bob",
      last_name: "Technician",
    },
    vendor: {
      id: "ven-1",
      vendor_code: "VND-001",
      name: "Official Apple Care",
    },
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
      if (url === "/maintenance-records/rec-1") {
        return Promise.resolve(mockRecordDetail as any);
      }
      if (url === "/employees") {
        return Promise.resolve({ items: [] } as any);
      }
      if (url === "/vendors") {
        return Promise.resolve({ items: [] } as any);
      }
      return Promise.resolve({} as any);
    });
  });

  it("renders record overview, asset details, and cost summary", async () => {
    render(<MaintenanceRecordDetailPage />);

    expect(await screen.findByText("MNT-2026-001")).toBeInTheDocument();
    expect(screen.getAllByText("$475.00")[0]).toBeInTheDocument();
    expect(screen.getByText("Retina 16-inch LCD Assembly")).toBeInTheDocument();
    expect(screen.getByText(/Bob Technician/)).toBeInTheDocument();
    expect(screen.getByText(/Official Apple Care/)).toBeInTheDocument();
  });

  it("starts maintenance work via modal action", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({ success: true } as any);

    render(<MaintenanceRecordDetailPage />);

    const startBtn = await screen.findByRole("button", { name: /start work/i });
    await user.click(startBtn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Start Maintenance Work" })).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", { name: /start maintenance/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/maintenance-records/rec-1/start",
        expect.anything(),
        expect.anything()
      );
    });
  });
});
