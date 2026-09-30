import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AssetsPage from "@/app/(protected)/assets/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Asset } from "@/types/asset";
import type { Organization } from "@/types/organization";

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

describe("AssetsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockAssets: Asset[] = [
    {
      id: "asset-1",
      organization_id: "org-uuid-1",
      asset_code: "AST-2026-001",
      name: "MacBook Pro 16",
      category: "it_equipment",
      description: "Dev workstation",
      serial_number: "SN-998877",
      model: "MacBookPro18,1",
      manufacturer: "Apple",
      purchase_cost: 3499,
      currency: "USD",
      status: "available",
      condition: "good",
      created_at: "2026-01-15T00:00:00Z",
      updated_at: "2026-01-15T00:00:00Z",
    },
    {
      id: "asset-2",
      organization_id: "org-uuid-1",
      asset_code: "AST-2026-002",
      name: "Ergonomic Standing Desk",
      category: "furniture",
      purchase_cost: 650,
      currency: "USD",
      status: "assigned",
      condition: "new",
      current_custodian: {
        id: "emp-1",
        employee_code: "EMP-001",
        first_name: "Bob",
        last_name: "Smith",
      },
      created_at: "2026-01-16T00:00:00Z",
      updated_at: "2026-01-16T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      membership: null,
      permissions: ["assets.view", "assets.create", "assets.update", "assets.delete", "assets.assign", "assets.return"],
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
      if (url === "/assets") {
        return Promise.resolve({ items: mockAssets, meta: { total: 2, page: 1, page_size: 20, total_pages: 1 } });
      }
      if (url === "/employees") {
        return Promise.resolve({ items: [], meta: { total: 0, page: 1, page_size: 100, total_pages: 1 } });
      }
      if (url === "/vendors") {
        return Promise.resolve({ items: [], meta: { total: 0, page: 1, page_size: 100, total_pages: 1 } });
      }
      return Promise.resolve({ items: [] });
    });
  });

  it("renders asset directory header and KPI summary cards", async () => {
    render(<AssetsPage />);

    expect(await screen.findByText("Asset Management")).toBeInTheDocument();
    expect(screen.getByText("AST-2026-001")).toBeInTheDocument();
    expect(screen.getByText("AST-2026-002")).toBeInTheDocument();
    expect(screen.getByText("MacBook Pro 16")).toBeInTheDocument();
    expect(screen.getByText("Ergonomic Standing Desk")).toBeInTheDocument();
  });

  it("opens register asset modal and submits payload", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      id: "asset-3",
      organization_id: "org-uuid-1",
      asset_code: "AST-2026-003",
      name: "Dell UltraSharp 32",
      category: "it_equipment",
      status: "available",
      condition: "new",
      currency: "USD",
      created_at: "2026-01-17T00:00:00Z",
      updated_at: "2026-01-17T00:00:00Z",
    });

    render(<AssetsPage />);

    const registerBtn = await screen.findByRole("button", { name: /register asset/i });
    await user.click(registerBtn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Register New Asset" })).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/asset code/i), "AST-2026-003");
    await user.type(within(dialog).getByLabelText(/asset name/i), "Dell UltraSharp 32");

    const submitBtn = within(dialog).getByRole("button", { name: /register asset/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/assets", expect.objectContaining({
        asset_code: "AST-2026-003",
        name: "Dell UltraSharp 32",
      }));
    });
  });
});
