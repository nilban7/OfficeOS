import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProcurementPage from "@/app/(protected)/procurement/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization } from "@/types/organization";
import type {
  PurchaseOrderListResponse,
  PurchaseRequestListResponse,
  VendorListResponse,
} from "@/types/procurement";

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

describe("ProcurementPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockRequestsResponse: PurchaseRequestListResponse = {
    items: [
      {
        id: "pr-1",
        organization_id: "org-uuid-1",
        request_number: "PR-202609-0001",
        requester_id: "emp-1",
        requester_name: "Jane Doe",
        purpose: "Dell Server Upgrade",
        priority: "high",
        status: "draft",
        estimated_amount: 4500,
        currency: "USD",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ],
    meta: { total: 1, page: 1, page_size: 20, total_pages: 1 },
  };

  const mockOrdersResponse: PurchaseOrderListResponse = {
    items: [
      {
        id: "po-1",
        organization_id: "org-uuid-1",
        po_number: "PO-202609-0001",
        vendor_id: "v-1",
        vendor_name: "Global Hardware Co",
        vendor_code: "VND-GHW",
        order_date: "2026-09-15",
        status: "issued",
        subtotal: 5000,
        tax_amount: 500,
        total_amount: 5500,
        currency: "USD",
        items_count: 2,
        created_at: "2026-09-15T00:00:00Z",
        updated_at: "2026-09-15T00:00:00Z",
      },
    ],
    meta: { total: 1, page: 1, page_size: 20, total_pages: 1 },
  };

  const mockVendorsResponse: VendorListResponse = {
    items: [
      {
        id: "v-1",
        organization_id: "org-uuid-1",
        vendor_code: "VND-GHW",
        name: "Global Hardware Co",
        contact_person: "Alice Vendor",
        email: "alice@ghw.com",
        phone: "+1-555-0199",
        is_active: true,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ],
    meta: { total: 1, page: 1, page_size: 50, total_pages: 1 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "procurement.view",
        "procurement.create",
        "procurement.approve",
        "purchase_orders.view",
        "purchase_orders.manage",
        "vendors.view",
        "vendors.manage",
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useOrganization>);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === "/purchase-requests") {
        return Promise.resolve(mockRequestsResponse);
      }
      if (url === "/purchase-orders") {
        return Promise.resolve(mockOrdersResponse);
      }
      if (url === "/vendors") {
        return Promise.resolve(mockVendorsResponse);
      }
      if (url === "/departments") {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve(null);
    });
  });

  it("renders procurement page title and metrics correctly", async () => {
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("Procurement & Purchases")).toBeInTheDocument();
      expect(screen.getByText("PR-202609-0001")).toBeInTheDocument();
      expect(screen.getByText("Dell Server Upgrade")).toBeInTheDocument();
    });
  });

  it("switches tabs between requests, orders, and vendors", async () => {
    const user = userEvent.setup();
    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("PR-202609-0001")).toBeInTheDocument();
    });

    // Switch to Purchase Orders
    const ordersTab = screen.getByRole("button", { name: /Purchase Orders/i });
    await user.click(ordersTab);

    await waitFor(() => {
      expect(screen.getByText("PO-202609-0001")).toBeInTheDocument();
      expect(screen.getByText("Global Hardware Co")).toBeInTheDocument();
    });

    // Switch to Vendors
    const vendorsTab = screen.getByRole("button", { name: /Vendors/i });
    await user.click(vendorsTab);

    await waitFor(() => {
      expect(screen.getByText("VND-GHW")).toBeInTheDocument();
      expect(screen.getByText("Alice Vendor")).toBeInTheDocument();
    });
  });

  it("opens the create purchase request modal and submits", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({});

    render(<ProcurementPage />);

    await waitFor(() => {
      expect(screen.getByText("PR-202609-0001")).toBeInTheDocument();
    });

    const newBtn = screen.getByRole("button", { name: /New Purchase Request/i });
    await user.click(newBtn);

    expect(screen.getByText("Create Purchase Request")).toBeInTheDocument();

    const purposeInput = screen.getByLabelText(/Purpose \/ Description/i);
    await user.type(purposeInput, "Office Laptops Procurement");

    const submitBtn = screen.getByRole("button", { name: /Create Request/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/purchase-requests",
        expect.objectContaining({
          purpose: "Office Laptops Procurement",
        }),
        expect.anything()
      );
    });
  });
});
