import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AssetDetailPage from "@/app/(protected)/assets/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { AssetDetail } from "@/types/asset";
import type { Organization } from "@/types/organization";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "asset-1" }),
  useRouter: () => ({ push: vi.fn() }),
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

describe("AssetDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockAsset: AssetDetail = {
    id: "asset-1",
    organization_id: "org-uuid-1",
    asset_code: "AST-2026-001",
    name: "MacBook Pro 16 M3 Max",
    category: "it_equipment",
    description: "Engineering developer machine",
    serial_number: "SN-998877",
    model: "MacBookPro18,1",
    manufacturer: "Apple",
    purchase_cost: 3499,
    currency: "USD",
    purchase_date: "2026-01-15",
    warranty_start_date: "2026-01-15",
    warranty_end_date: "2029-01-15",
    status: "available",
    condition: "good",
    location: "Bay A-4",
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
  };

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
      if (url === "/assets/asset-1") {
        return Promise.resolve(mockAsset);
      }
      if (url === "/assets/asset-1/assignments") {
        return Promise.resolve({ items: [] });
      }
      if (url === "/employees") {
        return Promise.resolve({ items: [] });
      }
      if (url === "/vendors") {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({ items: [] });
    });
  });

  it("renders asset specifications, status, and overview", async () => {
    render(<AssetDetailPage />);

    expect(await screen.findByText("MacBook Pro 16 M3 Max")).toBeInTheDocument();
    expect(screen.getAllByText("AST-2026-001")[0]).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("SN-998877")).toBeInTheDocument();
    expect(screen.getByText("Bay A-4")).toBeInTheDocument();
  });
});
