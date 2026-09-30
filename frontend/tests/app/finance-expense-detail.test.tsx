import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExpenseDetailPage from "@/app/(protected)/finance/expenses/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { ExpenseDetail } from "@/types/finance";
import type { Organization } from "@/types/organization";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "exp-1" }),
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

describe("ExpenseDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockExpense: ExpenseDetail = {
    id: "exp-1",
    organization_id: "org-uuid-1",
    expense_number: "EXP-2025-001",
    employee_id: "emp-1",
    category_id: "cat-1",
    expense_date: "2025-03-15",
    description: "Annual industry summit flights and accommodation",
    amount: "700.00",
    tax_amount: "70.00",
    total_amount: "770.00",
    currency: "USD",
    status: "submitted",
    created_at: "2025-03-15T00:00:00Z",
    updated_at: "2025-03-15T00:00:00Z",
    submitted_at: "2025-03-15T10:00:00Z",
    employee: {
      id: "emp-1",
      employee_code: "EMP-001",
      first_name: "Alice",
      last_name: "Smith",
      designation: "Principal Consultant",
    },
    category: {
      id: "cat-1",
      name: "Travel & Lodging",
      code: "TRAVEL",
    },
    items_count: 2,
    items: [
      {
        id: "item-1",
        organization_id: "org-uuid-1",
        expense_id: "exp-1",
        description: "Roundtrip Flight NYC-SFO",
        quantity: "1.00",
        unit_price: "500.00",
        tax_amount: "50.00",
        line_total: "550.00",
        created_at: "2025-03-15T00:00:00Z",
      },
      {
        id: "item-2",
        organization_id: "org-uuid-1",
        expense_id: "exp-1",
        description: "Hotel 1 Night",
        quantity: "1.00",
        unit_price: "200.00",
        tax_amount: "20.00",
        line_total: "220.00",
        created_at: "2025-03-15T00:00:00Z",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "finance.view",
        "finance.create",
        "finance.update",
        "finance.delete",
        "finance.approve",
        "finance.manage",
        "finance.pay",
      ],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockResolvedValue({
      data: mockExpense,
    } as any);
  });

  it("renders expense detail with number, category, and items breakdown", async () => {
    render(<ExpenseDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("EXP-2025-001")).toBeInTheDocument();
    });

    expect(screen.getByText("Travel & Lodging (TRAVEL)")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith (EMP-001)")).toBeInTheDocument();
    expect(screen.getByText("Roundtrip Flight NYC-SFO")).toBeInTheDocument();
    expect(screen.getByText("Hotel 1 Night")).toBeInTheDocument();
    expect(screen.getByText("$770.00 USD")).toBeInTheDocument();
  });

  it("displays approval action buttons for submitted expense", async () => {
    render(<ExpenseDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Approve")).toBeInTheDocument();
    });

    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("triggers approve action when Approve button is clicked", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ...mockExpense, status: "approved" } } as any);
    const user = userEvent.setup();

    render(<ExpenseDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Approve")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Approve"));

    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining("/finance/expenses/exp-1/approve"),
      expect.any(Object)
    );
  });

  it("opens reject modal when Reject button is clicked", async () => {
    const user = userEvent.setup();
    render(<ExpenseDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Reject")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Reject"));
    expect(screen.getByText("Reject Expense Request", { selector: "[role='dialog'] *" })).toBeInTheDocument();
  });
});
