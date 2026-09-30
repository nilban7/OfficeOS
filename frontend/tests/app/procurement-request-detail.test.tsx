import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PurchaseRequestDetailPage from "@/app/(protected)/procurement/requests/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization } from "@/types/organization";
import type { PurchaseRequest } from "@/types/procurement";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "pr-uuid-1" }),
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

describe("PurchaseRequestDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockRequestDraft: PurchaseRequest = {
    id: "pr-uuid-1",
    organization_id: "org-uuid-1",
    request_number: "PR-202609-0001",
    requester_id: "emp-uuid-1",
    requester_name: "Jane Doe",
    requester_code: "EMP-001",
    requester_email: "jane@acme.com",
    department_name: "Infrastructure",
    required_date: "2026-10-15",
    priority: "high",
    purpose: "Dedicated Database Hardware Server",
    estimated_amount: 8500,
    currency: "USD",
    status: "draft",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "procurement.view",
        "procurement.create",
        "procurement.approve",
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useOrganization>);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === "/purchase-requests/pr-uuid-1") {
        return Promise.resolve(mockRequestDraft);
      }
      if (url === "/departments") {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve(null);
    });
  });

  it("renders purchase request details correctly", async () => {
    render(<PurchaseRequestDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("PR-202609-0001")).toBeInTheDocument();
      expect(screen.getByText("Dedicated Database Hardware Server")).toBeInTheDocument();
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    });
  });

  it("submits a draft request for approval", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      ...mockRequestDraft,
      status: "submitted",
    });

    render(<PurchaseRequestDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("PR-202609-0001")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /^Submit$/i });
    await user.click(submitBtn);

    expect(screen.getByText(/Are you sure you want to submit request/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /Submit for Approval/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/purchase-requests/pr-uuid-1/submit",
        {},
        expect.anything()
      );
    });
  });
});
