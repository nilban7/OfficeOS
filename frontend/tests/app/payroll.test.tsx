import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PayrollPage from "@/app/(protected)/payroll/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Bonus, PayrollRun, PayrollSummaryKPI, Payslip, SalaryStructure } from "@/types/payroll";
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
    {
      id: "run-2",
      organization_id: "org-uuid-1",
      title: "November 2026 Draft Payroll",
      period_month: 11,
      period_year: 2026,
      status: "draft",
      total_gross_pay: 45000,
      total_deductions: 5000,
      total_net_pay: 40000,
      employee_count: 15,
      processed_by: "user-1",
      approved_by: null,
      payment_date: null,
      notes: "Draft run to delete",
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
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

  const mockBonuses: Bonus[] = [
    {
      id: "bonus-1",
      organization_id: "org-uuid-1",
      name: "Durga Puja Bonus 2026",
      description: "Annual festival bonus for staff",
      bonus_type: "bulk",
      calculation_type: "fixed",
      calculation_base: "base_salary",
      rate_or_amount: 1000,
      currency: "USD",
      period_month: 10,
      period_year: 2026,
      status: "approved",
      total_amount: 10000,
      employee_count: 10,
      project_id: null,
      project_reference: null,
      target_department_id: null,
      rejection_reason: null,
      notes: null,
      created_by: "user-1",
      approved_by: "user-1",
      rejected_by: null,
      cancelled_by: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
      allocations: [
        {
          id: "alloc-1",
          organization_id: "org-uuid-1",
          bonus_id: "bonus-1",
          employee_id: "emp-1",
          employee_name: "Jane Doe",
          employee_code: "EMP-001",
          department_name: "Engineering",
          amount: 1000,
          currency: "USD",
          status: "approved",
          period_month: 10,
          period_year: 2026,
          notes: null,
          created_at: "2026-10-01T00:00:00Z",
          updated_at: "2026-10-01T00:00:00Z",
        },
      ],
    },
    {
      id: "bonus-2",
      organization_id: "org-uuid-1",
      name: "Website Redesign Delivery Bonus",
      description: "Project completion reward",
      bonus_type: "project",
      calculation_type: "percentage",
      calculation_base: "base_salary",
      rate_or_amount: 15,
      currency: "USD",
      period_month: 10,
      period_year: 2026,
      status: "draft",
      total_amount: 1500,
      employee_count: 2,
      project_id: "proj-1",
      project_reference: "Website Redesign (PRJ-01)",
      target_department_id: null,
      rejection_reason: null,
      notes: null,
      created_by: "user-1",
      approved_by: null,
      rejected_by: null,
      cancelled_by: null,
      created_at: "2026-10-02T00:00:00Z",
      updated_at: "2026-10-02T00:00:00Z",
      allocations: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useOrganization as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: ["payroll.view", "payroll.create", "payroll.approve", "payroll.delete", "payroll.manage"],
      isLoading: false,
    });

    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/summary")) return Promise.resolve(mockKpi);
      if (url.includes("/runs")) return Promise.resolve(mockRuns);
      if (url.includes("/structures")) return Promise.resolve(mockStructures);
      if (url.includes("/payslips")) return Promise.resolve(mockPayslips);
      if (url.includes("/bonuses")) return Promise.resolve(mockBonuses);
      if (url.includes("/departments")) return Promise.resolve([{ id: "dept-1", name: "Engineering" }]);
      if (url.includes("/projects")) return Promise.resolve([{ id: "proj-1", name: "Website Redesign", project_code: "PRJ-01" }]);
      if (url.includes("/employees")) return Promise.resolve([{ id: "emp-1", first_name: "Jane", last_name: "Doe", email: "jane@example.com" }]);
      return Promise.resolve([]);
    });

    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "run-2",
      title: "November 2026 Payroll",
    });

    (apiClient.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
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
    expect(screen.getAllByText("View Run").length).toBe(2);
    expect(screen.getByText("November 2026 Draft Payroll")).toBeInTheDocument();
  });

  it("deletes a draft payroll run when delete is clicked and confirmed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PayrollPage />);

    await screen.findByText("November 2026 Draft Payroll");
    const deleteButton = screen.getByRole("button", { name: /Delete draft run/i });
    expect(deleteButton).toBeInTheDocument();

    await user.click(deleteButton);
    expect(window.confirm).toHaveBeenCalledWith(
      "Are you sure you want to delete this draft payroll run?"
    );
    expect(apiClient.delete).toHaveBeenCalledWith("/payroll/runs/run-2");
  });

  it("switches to Salary Structures tab and displays employee structure with edit action", async () => {
    const user = userEvent.setup();
    render(<PayrollPage />);

    await screen.findByText("Payroll & Salary Management");
    const structuresTab = screen.getByRole("button", { name: /Salary Structures/i });
    await user.click(structuresTab);

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("EMP-001")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: /Edit/i });
    expect(editBtn).toBeInTheDocument();
    await user.click(editBtn);

    expect(await screen.findByText("Configure Employee Salary Structure")).toBeInTheDocument();
    expect(screen.getByDisplayValue("6000")).toBeInTheDocument();
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

  it("switches to Bonuses tab and displays bonus campaigns with status and action buttons", async () => {
    const user = userEvent.setup();
    render(<PayrollPage />);

    await screen.findByText("Payroll & Salary Management");
    const bonusesTab = screen.getByRole("button", { name: /Bonuses/i });
    await user.click(bonusesTab);

    expect(await screen.findByText("Durga Puja Bonus 2026")).toBeInTheDocument();
    expect(screen.getByText("Website Redesign Delivery Bonus")).toBeInTheDocument();
    expect(screen.getByText("Company-Wide")).toBeInTheDocument();
    expect(screen.getByText("Ref: Website Redesign (PRJ-01)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Bonus Campaign/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Award Individual\/Project Bonus/i })).toBeInTheDocument();
  });

  it("opens Create Bonus Campaign modal and supports allocation preview", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      currency: "USD",
      total_estimated_amount: 10000,
      employee_count: 10,
      items: [
        {
          employee_id: "emp-1",
          employee_name: "Jane Doe",
          department_name: "Engineering",
          base_salary: 5000,
          bonus_amount: 1000,
        },
      ],
    });

    render(<PayrollPage />);

    await screen.findByText("Payroll & Salary Management");
    const bonusesTab = screen.getByRole("button", { name: /Bonuses/i });
    await user.click(bonusesTab);

    const createCampaignBtn = screen.getByRole("button", { name: /Create Bonus Campaign/i });
    await user.click(createCampaignBtn);

    expect(await screen.findByText("Create Bulk / Company-Wide Bonus Campaign")).toBeInTheDocument();
    expect(screen.getByLabelText(/Bonus Campaign Name/i)).toBeInTheDocument();

    const previewBtn = screen.getByRole("button", { name: /Preview Allocations/i });
    await user.click(previewBtn);

    expect(apiClient.post).toHaveBeenCalledWith(
      "/payroll/bonuses/preview",
      expect.objectContaining({ bonus_type: "bulk" })
    );
  });

  it("opens Award Individual/Project Bonus modal", async () => {
    const user = userEvent.setup();
    render(<PayrollPage />);

    await screen.findByText("Payroll & Salary Management");
    const bonusesTab = screen.getByRole("button", { name: /Bonuses/i });
    await user.click(bonusesTab);

    const awardBtn = screen.getByRole("button", { name: /Award Individual\/Project Bonus/i });
    await user.click(awardBtn);

    expect(await screen.findByText("Award Individual / Project Performance Bonus")).toBeInTheDocument();
    expect(screen.getByLabelText(/Bonus Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Award Target/i)).toBeInTheDocument();
  });

  it("approves a bonus campaign when approve button is clicked", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "bonus-2",
      status: "approved",
    });

    render(<PayrollPage />);

    await screen.findByText("Payroll & Salary Management");
    const bonusesTab = screen.getByRole("button", { name: /Bonuses/i });
    await user.click(bonusesTab);

    await screen.findByText("Website Redesign Delivery Bonus");
    const approveBtn = screen.getByTitle("Approve Bonus");
    await user.click(approveBtn);

    expect(apiClient.post).toHaveBeenCalledWith("/payroll/bonuses/bonus-2/approve");
  });
});
