import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaintenancePage from "@/app/(protected)/maintenance/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { MaintenanceRecord, MaintenanceRequest } from "@/types/maintenance";
import type { Organization } from "@/types/organization";

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

describe("MaintenancePage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockRequests: MaintenanceRequest[] = [
    {
      id: "req-1",
      organization_id: "org-uuid-1",
      request_number: "MTR-2026-001",
      asset_id: "asset-1",
      requester_id: "emp-1",
      issue_title: "Broken laptop screen",
      issue_description: "Flickers when touched",
      priority: "high",
      requested_date: "2026-02-01",
      status: "submitted",
      created_at: "2026-02-01T10:00:00Z",
      updated_at: "2026-02-01T10:00:00Z",
      asset: {
        id: "asset-1",
        asset_code: "AST-001",
        name: "MacBook Pro 16",
        status: "available",
        condition: "good",
      },
      requester: {
        id: "emp-1",
        employee_code: "EMP-001",
        first_name: "Alice",
        last_name: "Engineer",
      },
    },
  ];

  const mockRecords: MaintenanceRecord[] = [
    {
      id: "rec-1",
      organization_id: "org-uuid-1",
      record_number: "MNT-2026-001",
      asset_id: "asset-1",
      maintenance_type: "corrective",
      start_date: "2026-02-02",
      status: "scheduled",
      labor_cost: 150,
      parts_cost: 300,
      other_cost: 25,
      total_cost: 475,
      created_at: "2026-02-02T10:00:00Z",
      updated_at: "2026-02-02T10:00:00Z",
      asset: {
        id: "asset-1",
        asset_code: "AST-001",
        name: "MacBook Pro 16",
        status: "under_maintenance",
        condition: "fair",
      },
    },
  ];

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
      if (url === "/maintenance-requests") {
        return Promise.resolve({ items: mockRequests, meta: { total: 1, page: 1, page_size: 20, total_pages: 1 } } as any);
      }
      if (url === "/maintenance-records") {
        return Promise.resolve({ items: mockRecords, meta: { total: 1, page: 1, page_size: 20, total_pages: 1 } } as any);
      }
      if (url === "/assets") {
        return Promise.resolve({
          items: [
            { id: "asset-1", asset_code: "AST-001", name: "MacBook Pro 16", status: "available", condition: "good" },
          ],
        } as any);
      }
      if (url === "/employees") {
        return Promise.resolve({
          items: [
            { id: "emp-1", employee_code: "EMP-001", first_name: "Alice", last_name: "Engineer" },
          ],
        } as any);
      }
      if (url === "/vendors") {
        return Promise.resolve({
          items: [
            { id: "ven-1", vendor_code: "VND-001", name: "Apple Service Center" },
          ],
        } as any);
      }
      return Promise.resolve({ items: [] } as any);
    });
  });

  it("renders maintenance hub header and requests by default", async () => {
    render(<MaintenancePage />);

    expect(await screen.findByText("Maintenance Management")).toBeInTheDocument();
    expect(screen.getByText("MTR-2026-001")).toBeInTheDocument();
    expect(screen.getByText("Broken laptop screen")).toBeInTheDocument();
    expect(screen.getAllByText("MacBook Pro 16")[0]).toBeInTheDocument();
  });

  it("switches to records tab and displays scheduled maintenance record", async () => {
    const user = userEvent.setup();
    render(<MaintenancePage />);

    const recordsTab = await screen.findByRole("button", { name: /maintenance work records/i });
    await user.click(recordsTab);

    expect(await screen.findByText("MNT-2026-001")).toBeInTheDocument();
    expect(screen.getAllByText("$475.00")[0]).toBeInTheDocument();
  });

  it("opens submit request modal and submits payload", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      id: "req-2",
      request_number: "MTR-2026-002",
      issue_title: "Faulty keyboard keys",
    } as any);

    render(<MaintenancePage />);

    const newReqBtn = await screen.findByRole("button", { name: /new request/i });
    await user.click(newReqBtn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Submit Maintenance Request" })).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText(/select asset/i), "asset-1");
    await user.type(within(dialog).getByLabelText(/issue title/i), "Faulty keyboard keys");

    const confirmBtn = within(dialog).getByRole("button", { name: /submit request/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/maintenance-requests",
        expect.objectContaining({
          asset_id: "asset-1",
          issue_title: "Faulty keyboard keys",
        }),
        expect.anything()
      );
    });
  });
});
