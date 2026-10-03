import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PayrollPage from "@/app/(protected)/payroll/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { PayrollRun, PayrollSummaryKPI, Payslip, SalaryStructure } from "@/types/payroll";
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

describe("PayrollPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockKpi: PayrollSummaryKPI = {
    monthly_payroll_total: 75000,
    pending_approvals_count: 2,
    total_disbursed_ytd: 600000,
    active_employees_count: 25,
    currency: "USD",
  };

  const mockRuns: PayrollRun[] = [
    {
      id: "run-1",
      organization_id: "org-uuid-1",
      title: "October 2026 Regular Payroll",
      period_month: 10,
      period_year: 2026,
      status: "approved",
      total_gross_pay: 85000,
      total_deductions: 10000,
      total_net_pay: 75000,
      employee_count: 25,
      processed_by: "user-1",
      approved_by: "user-1",
      payment_date: null,
      notes: "Standard monthly run",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ];

  const mockStructures: SalaryStructure[] = [
    {
      id: "struct-1",
      organization_id: "org-uuid-1",
      employee_id: "emp-1",
      employee_name: "Jane Doe",
      employee_code: "EMP-001",
      currency: "USD",
      base_salary: 6000,
      hra: 1200,
      allowances: { Transport: 300 },
      deductions: { PF: 300 },
      payment_frequency: "monthly",
      effective_from: "2026-01-01",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockPayslips: Payslip[] = [
    {
      id: "slip-1",
      organization_id: "org-uuid-1",
      payroll_id: "run-1",
      employee_id: "emp-1",
      employee_name: "Jane Doe",
      employee_code: "EMP-001",
      department_name: "Engineering",
      payslip_number: "PS-202610-0001",
      base_salary: 6000,
      gross_pay: 7500,
      total_deductions: 900,
      net_pay: 6600,
      paid_days: 31,
      unpaid_days: 0,
      earnings_breakdown: { "Base Salary": 6000, HRA: 1200 },
      deductions_breakdown: { PF: 300, Tax: 600 },
      status: "draft",
      payment_method: "bank_transfer",
      payment_reference: null,
      disbursement_date: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useOrganization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: ["payroll.view", "payroll.create", "payroll.approve"],
      isLoading: false,
    });

    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/summary")) return Promise.resolve(mockKpi);
      if (url.includes("/runs")) return Promise.resolve(mockRuns);
      if (url.includes("/structures")) return Promise.resolve(mockStructures);
      if (url.includes("/payslips")) return Promise.resolve(mockPayslips);
      return Promise.resolve([]);
    });

    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "run-2",
      title: "November 2026 Payroll",
    });
  });

  it("renders payroll hub title and summary KPIs", async () => {
    render(<PayrollPage />);

    expect(await screen.findByText("Payroll & Salary Management")).toBeInTheDocument();
    expect(screen.getByText("Latest Monthly Total")).toBeInTheDocument();
    expect(screen.getByText("Pending Approvals")).toBeInTheDocument();
    expect(screen.getByText("Total Disbursed (YTD)")).toBeInTheDocument();
  });

  it("renders payroll runs list with status badge", async () => {
    render(<PayrollPage />);

    expect(await screen.findByText("October 2026 Regular Payroll")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("View Run")).toBeInTheDocument();
  });

  it("switches to Salary Structures tab and displays employee structure", async () => {
    const user = userEvent.setup();
    render(<PayrollPage />);

    await screen.findByText("Payroll & Salary Management");
    const structuresTab = screen.getByRole("button", { name: /Salary Structures/i });
    await user.click(structuresTab);

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("EMP-001")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("switches to All Payslips tab and displays payslip number", async () => {
    const user = userEvent.setup();
    render(<PayrollPage />);

    await screen.findByText("Payroll & Salary Management");
    const payslipsTab = screen.getByRole("button", { name: /All Payslips/i });
    await user.click(payslipsTab);

    expect(await screen.findByText("PS-202610-0001")).toBeInTheDocument();
    expect(screen.getByText("View & Print")).toBeInTheDocument();
  });

  it("opens Process New Payroll modal on button click", async () => {
    const user = userEvent.setup();
    render(<PayrollPage />);

    await screen.findByText("Payroll & Salary Management");
    const newRunButton = screen.getByRole("button", { name: /Process New Payroll/i });
    await user.click(newRunButton);

    expect(await screen.findByText("Process New Monthly Payroll Run")).toBeInTheDocument();
    expect(screen.getByLabelText("Month")).toBeInTheDocument();
    expect(screen.getByLabelText("Year")).toBeInTheDocument();
  });
});
