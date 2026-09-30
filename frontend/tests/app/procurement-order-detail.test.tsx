import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PurchaseOrderDetailPage from "@/app/(protected)/procurement/orders/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization } from "@/types/organization";
import type { PurchaseOrderDetail } from "@/types/procurement";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "po-uuid-1" }),
  useRouter: () => ({
    push: mockPush,
  }),
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

describe("PurchaseOrderDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockOrderDetail: PurchaseOrderDetail = {
    id: "po-uuid-1",
    organization_id: "org-uuid-1",
    po_number: "PO-202609-0001",
    vendor_id: "v-uuid-1",
    vendor_name: "Dell Technologies Inc",
    vendor_code: "VND-DELL",
    order_date: "2026-09-20",
    expected_delivery_date: "2026-10-01",
    status: "draft",
    subtotal: 5000,
    tax_amount: 500,
    total_amount: 5500,
    currency: "USD",
    notes: "Direct site delivery to Server Room A",
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    items: [
      {
        id: "item-1",
        organization_id: "org-uuid-1",
        purchase_order_id: "po-uuid-1",
        item_description: "PowerEdge R750 Rack Server",
        quantity: 2,
        unit: "units",
        unit_price: 2500,
        tax_rate: 10,
        tax_amount: 500,
        line_total: 5500,
        created_at: "2026-09-20T00:00:00Z",
        updated_at: "2026-09-20T00:00:00Z",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "procurement.view",
        "purchase_orders.view",
        "purchase_orders.manage",
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useOrganization>);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === "/purchase-orders/po-uuid-1") {
        return Promise.resolve(mockOrderDetail);
      }
      if (url === "/vendors") {
        return Promise.resolve({ items: [], meta: { total: 0, page: 1, page_size: 100, total_pages: 1 } });
      }
      return Promise.resolve(null);
    });
  });

  it("renders purchase order details and line items correctly", async () => {
    render(<PurchaseOrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("PO-202609-0001")).toBeInTheDocument();
      expect(screen.getByText("Dell Technologies Inc")).toBeInTheDocument();
      expect(screen.getByText("PowerEdge R750 Rack Server")).toBeInTheDocument();
      expect(screen.getByText("Direct site delivery to Server Room A")).toBeInTheDocument();
    });
  });

  it("cancels a draft purchase order", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      ...mockOrderDetail,
      status: "cancelled",
    });

    render(<PurchaseOrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("PO-202609-0001")).toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole("button", { name: /Cancel Order/i });
    await user.click(cancelBtn);

    expect(screen.getByText(/Are you sure you want to cancel purchase order/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /Confirm Cancellation/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/purchase-orders/po-uuid-1/cancel",
        {},
        expect.anything()
      );
    });
  });
});
