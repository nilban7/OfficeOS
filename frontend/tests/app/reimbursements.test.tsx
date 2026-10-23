import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReimbursementsPage from "@/app/(protected)/reimbursements/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type {
  ReimbursementClaim,
  ReimbursementSummaryKPI,
} from "@/types/reimbursement";
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

describe("ReimbursementsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockKpi: ReimbursementSummaryKPI = {
    total_claims_count: 5,
    pending_approval_count: 2,
    approved_unpaid_count: 1,
    paid_claims_count: 2,
    total_claimed_amount: "2500.00",
    pending_approval_amount: "800.00",
    total_reimbursed_amount: "1500.00",
    currency: "USD",
  };

  const mockClaims: ReimbursementClaim[] = [
    {
      id: "claim-1",
      organization_id: "org-uuid-1",
      employee_id: "emp-1",
      employee_name: "Jane Doe",
      employee_code: "EMP-001",
      claim_number: "CLM-202610-0001",
      title: "Conference Travel Tickets",
      category: "travel",
      claim_date: "2026-10-15",
      amount: "450.00",
      currency: "USD",
      status: "draft",
      receipt_url: "https://example.com/ticket.pdf",
      description: "Flight to client annual meeting",
      items: [
        {
          description: "Flight Ticket",
          amount: "450.00",
          category: "travel",
          expense_date: "2026-10-15",
        },
      ],
      submitted_at: null,
      reviewer_id: null,
      reviewer_name: null,
      reviewed_at: null,
      reviewer_comment: null,
      paid_at: null,
      payment_reference: null,
      created_at: "2026-10-15T00:00:00Z",
      updated_at: "2026-10-15T00:00:00Z",
    },
    {
      id: "claim-2",
      organization_id: "org-uuid-1",
      employee_id: "emp-2",
      employee_name: "Bob Smith",
      employee_code: "EMP-002",
      claim_number: "CLM-202610-0002",
      title: "Client Catering & Lunch",
      category: "meals",
      claim_date: "2026-10-16",
      amount: "120.00",
      currency: "USD",
      status: "submitted",
      receipt_url: null,
      description: "Lunch with vendor partners",
      items: [],
      submitted_at: "2026-10-16T10:00:00Z",
      reviewer_id: null,
      reviewer_name: null,
      reviewed_at: null,
      reviewer_comment: null,
      paid_at: null,
      payment_reference: null,
      created_at: "2026-10-16T00:00:00Z",
      updated_at: "2026-10-16T10:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    (useOrganization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "reimbursements.view",
        "reimbursements.create",
        "reimbursements.approve",
        "reimbursements.pay",
      ],
      isLoading: false,
    });

    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes("/summary")) {
        return mockKpi;
      }
      return {
        items: mockClaims,
        meta: {
          total: mockClaims.length,
          page: 1,
          page_size: 15,
          total_pages: 1,
        },
      };
    });
  });

  it("renders page title and KPI counters correctly", async () => {
    render(<ReimbursementsPage />);

    expect(screen.getByText("Reimbursements & Claims")).toBeInTheDocument();
    expect(screen.getByText("Total Claims")).toBeInTheDocument();
    expect(screen.getAllByText("Pending Approval")[0]).toBeInTheDocument();
    expect(screen.getByText("Ready to Disburse")).toBeInTheDocument();
    expect(screen.getByText("Total Reimbursed")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("CLM-202610-0001")).toBeInTheDocument();
      expect(screen.getByText("CLM-202610-0002")).toBeInTheDocument();
      expect(screen.getByText("Conference Travel Tickets")).toBeInTheDocument();
    });
  });

  it("displays claims table with status badges and action buttons", async () => {
    render(<ReimbursementsPage />);

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
      expect(screen.getByText("Draft")).toBeInTheDocument();
      expect(screen.getByText("Submit")).toBeInTheDocument();
      expect(screen.getByText("Review")).toBeInTheDocument();
    });
  });

  it("opens create claim modal on clicking Submit Claim", async () => {
    const user = userEvent.setup();
    render(<ReimbursementsPage />);

    const submitBtn = screen.getByRole("button", { name: /Submit Claim/i });
    await user.click(submitBtn);

    expect(screen.getByText("Submit Reimbursement Claim")).toBeInTheDocument();
    expect(screen.getByLabelText(/Claim Title \/ Purpose \*/i)).toBeInTheDocument();
  });

  it("submits a draft claim when clicking Submit button", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({});

    render(<ReimbursementsPage />);

    await waitFor(() => {
      expect(screen.getByText("Submit")).toBeInTheDocument();
    });

    const submitDraftBtn = screen.getByText("Submit");
    await user.click(submitDraftBtn);

    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining("/reimbursements/claim-1/submit")
    );
  });

  it("renders empty state when there are no claims", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes("/summary")) {
        return mockKpi;
      }
      return {
        items: [],
        meta: { total: 0, page: 1, page_size: 15, total_pages: 1 },
      };
    });

    render(<ReimbursementsPage />);

    await waitFor(() => {
      expect(screen.getByText("No reimbursement claims found")).toBeInTheDocument();
    });
  });
});
