import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FinancePage from "@/app/(protected)/finance/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Expense, ExpenseCategory, FinancialOverview } from "@/types/finance";
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

describe("FinancePage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockCategories: ExpenseCategory[] = [
    {
      id: "cat-1",
      organization_id: "org-uuid-1",
      name: "Travel & Entertainment",
      code: "TRAVEL",
      is_active: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "cat-2",
      organization_id: "org-uuid-1",
      name: "Office Supplies",
      code: "SUPPLY",
      is_active: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
  ];

  const mockExpenses: Expense[] = [
    {
      id: "exp-1",
      organization_id: "org-uuid-1",
      expense_number: "EXP-2025-001",
      employee_id: "emp-1",
      category_id: "cat-1",
      expense_date: "2025-03-15",
      description: "Flight tickets to NYC",
      amount: "500.00",
      tax_amount: "50.00",
      total_amount: "550.00",
      currency: "USD",
      status: "approved",
      created_at: "2025-03-15T00:00:00Z",
      updated_at: "2025-03-15T00:00:00Z",
      employee: {
        id: "emp-1",
        employee_code: "EMP-001",
        first_name: "Alice",
        last_name: "Smith",
        designation: "Lead Consultant",
      },
      category: {
        id: "cat-1",
        name: "Travel & Entertainment",
        code: "TRAVEL",
      },
      items_count: 1,
    },
    {
      id: "exp-2",
      organization_id: "org-uuid-1",
      expense_number: "EXP-2025-002",
      employee_id: "emp-2",
      category_id: "cat-2",
      expense_date: "2025-03-16",
      description: "Printer toner cartridges",
      amount: "150.00",
      tax_amount: "15.00",
      total_amount: "165.00",
      currency: "USD",
      status: "submitted",
      created_at: "2025-03-16T00:00:00Z",
      updated_at: "2025-03-16T00:00:00Z",
      employee: {
        id: "emp-2",
        employee_code: "EMP-002",
        first_name: "Bob",
        last_name: "Jones",
        designation: "Administrator",
      },
      category: {
        id: "cat-2",
        name: "Office Supplies",
        code: "SUPPLY",
      },
      items_count: 2,
    },
  ];

  const mockOverview: FinancialOverview = {
    total_expenses: "715.00",
    pending_approvals_count: 1,
    approved_expenses_count: 1,
    paid_expenses_count: 0,
    total_debits: "715.00",
    total_credits: "0.00",
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

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/finance/overview")) {
        return Promise.resolve({ data: mockOverview }) as any;
      }
      if (url.includes("/finance/expense-categories")) {
        return Promise.resolve({ data: mockCategories }) as any;
      }
      if (url.includes("/finance/expenses")) {
        return Promise.resolve({
          data: { items: mockExpenses, total: 2, page: 1, page_size: 20, total_pages: 1 },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });
  });

  it("renders finance hub header and KPI metrics", async () => {
    render(<FinancePage />);

    await waitFor(() => {
      expect(screen.getByText("Finance Management")).toBeInTheDocument();
    });

    expect(screen.getByText("$715.00")).toBeInTheDocument();
    expect(screen.getByText("Total Expenses")).toBeInTheDocument();
    expect(screen.getByText("Pending Approval")).toBeInTheDocument();
    expect(screen.getByText("Approved", { selector: "p" })).toBeInTheDocument();
  });

  it("renders list of expenses with status badges", async () => {
    render(<FinancePage />);

    await waitFor(() => {
      expect(screen.getByText("EXP-2025-001")).toBeInTheDocument();
    });

    expect(screen.getByText("EXP-2025-002")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Approved", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Submitted", { selector: "span" })).toBeInTheDocument();
  });

  it("shows empty state when no expenses exist", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/finance/expenses")) {
        return Promise.resolve({
          data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 1 },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });

    render(<FinancePage />);

    await waitFor(() => {
      expect(screen.getByText("No Expenses Found")).toBeInTheDocument();
    });
  });

  it("shows access denied when user lacks finance.view", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [],
      isLoading: false,
    } as any);

    render(<FinancePage />);

    await waitFor(() => {
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
    });
  });

  it("opens create expense modal on button click", async () => {
    const user = userEvent.setup();
    render(<FinancePage />);

    await waitFor(() => {
      expect(screen.getByText("New Expense")).toBeInTheDocument();
    });

    await user.click(screen.getByText("New Expense"));
    expect(screen.getByText("Create New Expense", { selector: "[role='dialog'] *" })).toBeInTheDocument();
  });
});
