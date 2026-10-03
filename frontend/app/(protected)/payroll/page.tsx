"use client";

import * as React from "react";
import Link from "next/link";
import {
  Banknote,
  Plus,
  Search,
  Eye,
  CheckCircle,
  Clock,
  DollarSign,
  Users,
  Calendar,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ROUTES } from "@/constants/routes";
import type {
  PayrollRun,
  PayrollRunCreate,
  PayrollStatus,
  PayrollSummaryKPI,
  Payslip,
  SalaryStructure,
  SalaryStructureCreate,
} from "@/types/payroll";

const STATUS_CONFIG: Record<PayrollStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  processing: { label: "Processing", className: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", className: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function PayrollPage() {
  const { currentOrganization, isLoading: isOrgLoading } = useOrganization();

  // Active Tab: 'runs' | 'structures' | 'payslips'
  const [activeTab, setActiveTab] = React.useState<"runs" | "structures" | "payslips">("runs");

  // Data states
  const [kpi, setKpi] = React.useState<PayrollSummaryKPI | null>(null);
  const [runs, setRuns] = React.useState<PayrollRun[]>([]);
  const [structures, setStructures] = React.useState<SalaryStructure[]>([]);
  const [payslips, setPayslips] = React.useState<Payslip[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = React.useState("");

  // Process Run Modal
  const [showRunModal, setShowRunModal] = React.useState(false);
  const [runLoading, setRunLoading] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [runForm, setRunForm] = React.useState<PayrollRunCreate>({
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    title: "",
    notes: "",
  });

  // Structure Modal
  const [showStructureModal, setShowStructureModal] = React.useState(false);
  const [structureLoading, setStructureLoading] = React.useState(false);
  const [structureError, setStructureError] = React.useState<string | null>(null);
  const [structureForm, setStructureForm] = React.useState<SalaryStructureCreate>({
    employee_id: "",
    currency: "USD",
    base_salary: 5000,
    hra: 1000,
    payment_frequency: "monthly",
    effective_from: new Date().toISOString().split("T")[0] as string,
  });

  // Load Data
  const fetchData = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading((prev) => (runs.length === 0 ? true : prev));
    setError(null);
    try {
      const [kpiRes, runsRes, structuresRes, slipsRes] = await Promise.all([
        apiClient.get<PayrollSummaryKPI>(API_ENDPOINTS.payroll.summary).catch(() => null),
        apiClient.get<PayrollRun[]>(API_ENDPOINTS.payroll.runs).catch(() => []),
        apiClient.get<SalaryStructure[]>(API_ENDPOINTS.payroll.structures).catch(() => []),
        apiClient.get<Payslip[]>(API_ENDPOINTS.payroll.payslips).catch(() => []),
      ]);

      if (kpiRes) setKpi(kpiRes);
      setRuns(runsRes || []);
      setStructures(structuresRes || []);
      setPayslips(slipsRes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load payroll data");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, runs.length]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Process Run Submit
  const handleProcessRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunLoading(true);
    setRunError(null);
    try {
      await apiClient.post(API_ENDPOINTS.payroll.runs, runForm);
      setShowRunModal(false);
      setRunForm({
        period_month: new Date().getMonth() + 1,
        period_year: new Date().getFullYear(),
        title: "",
        notes: "",
      });
      fetchData();
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : "Failed to generate payroll run");
    } finally {
      setRunLoading(false);
    }
  };

  // Handle Salary Structure Submit
  const handleSaveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    setStructureLoading(true);
    setStructureError(null);
    try {
      await apiClient.post(API_ENDPOINTS.payroll.structures, structureForm);
      setShowStructureModal(false);
      fetchData();
    } catch (err: unknown) {
      setStructureError(err instanceof Error ? err.message : "Failed to save salary structure");
    } finally {
      setStructureLoading(false);
    }
  };

  if (isOrgLoading || (isLoading && runs.length === 0 && !error)) {
    return <LoadingState message="Loading payroll management..." />;
  }

  if (error && runs.length === 0) {
    return <ErrorState message={error} onRetry={fetchData} />;
  }

  // Filtered runs
  const filteredRuns = runs.filter((r) =>
    r.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtered structures
  const filteredStructures = structures.filter(
    (s) =>
      s.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.employee_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtered payslips
  const filteredSlips = payslips.filter(
    (p) =>
      p.payslip_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.employee_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Banknote className="h-7 w-7 text-emerald-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Payroll & Salary Management
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage compensation structures, automated monthly payroll calculations, and printable payslips.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => setShowStructureModal(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Configure Salary
          </Button>
          <Button
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setShowRunModal(true)}
          >
            <Plus className="h-4 w-4" />
            Process New Payroll
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Latest Monthly Total
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                ${Number(kpi?.monthly_payroll_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-emerald-600 mt-0.5">Calculated net payout</p>
            </div>
            <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
              <DollarSign className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pending Approvals
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {kpi?.pending_approvals_count ?? 0}
              </h3>
              <p className="text-xs text-amber-600 mt-0.5">Awaiting disbursement review</p>
            </div>
            <div className="rounded-full bg-amber-50 p-3 text-amber-600">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Disbursed (YTD)
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                ${Number(kpi?.total_disbursed_ytd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-blue-600 mt-0.5">Successfully disbursed</p>
            </div>
            <div className="rounded-full bg-blue-50 p-3 text-blue-600">
              <CheckCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Employees
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {kpi?.active_employees_count ?? 0}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Enrolled on organization payroll</p>
            </div>
            <div className="rounded-full bg-indigo-50 p-3 text-indigo-600">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === "runs" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("runs")}
          >
            Payroll Runs ({runs.length})
          </Button>
          <Button
            variant={activeTab === "structures" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("structures")}
          >
            Salary Structures ({structures.length})
          </Button>
          <Button
            variant={activeTab === "payslips" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("payslips")}
          >
            All Payslips ({payslips.length})
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Tab 1: Payroll Runs */}
      {activeTab === "runs" && (
        <>
          {filteredRuns.length === 0 ? (
            <EmptyState
              title="No payroll runs found"
              description="Click 'Process New Payroll' to calculate and generate the first compensation run for your team."
              actionLabel="Process New Payroll"
              onAction={() => setShowRunModal(true)}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Run Title</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Employees</th>
                    <th className="px-4 py-3">Gross Total</th>
                    <th className="px-4 py-3">Deductions</th>
                    <th className="px-4 py-3">Net Pay</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRuns.map((r) => {
                    const statusInfo = STATUS_CONFIG[r.status] || STATUS_CONFIG.draft;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            <span>{r.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {r.period_month}/{r.period_year}
                        </td>
                        <td className="px-4 py-3">{r.employee_count} staff</td>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          ${Number(r.total_gross_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-rose-600 font-medium">
                          -${Number(r.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600">
                          ${Number(r.total_net_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${statusInfo.className}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`${ROUTES.PAYROLL_RUNS}/${r.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                              <Eye className="h-3.5 w-3.5" />
                              View Run
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Tab 2: Salary Structures */}
      {activeTab === "structures" && (
        <>
          {filteredStructures.length === 0 ? (
            <EmptyState
              title="No salary structures configured"
              description="Configure base pay, HRA, and allowances for employees to enable automated payroll processing."
              actionLabel="Configure Salary"
              onAction={() => setShowStructureModal(true)}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Base Salary</th>
                    <th className="px-4 py-3">HRA</th>
                    <th className="px-4 py-3">Frequency</th>
                    <th className="px-4 py-3">Effective Date</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStructures.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{s.employee_name || "Employee"}</div>
                        <div className="text-xs text-slate-400">{s.employee_code || "—"}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        ${Number(s.base_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        ${Number(s.hra).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 capitalize">{s.payment_frequency}</td>
                      <td className="px-4 py-3">{s.effective_from}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Tab 3: All Payslips */}
      {activeTab === "payslips" && (
        <>
          {filteredSlips.length === 0 ? (
            <EmptyState
              title="No payslips generated yet"
              description="Payslips are automatically generated whenever you process a new monthly payroll run."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Payslip #</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Gross Pay</th>
                    <th className="px-4 py-3">Deductions</th>
                    <th className="px-4 py-3">Net Pay</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSlips.map((slip) => (
                    <tr key={slip.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-slate-400" />
                          <span>{slip.payslip_number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {slip.employee_name || "Employee"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {slip.department_name || "General"}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        ${Number(slip.gross_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 font-medium text-rose-600">
                        -${Number(slip.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-600">
                        ${Number(slip.net_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border capitalize bg-slate-50 text-slate-700 border-slate-200">
                          {slip.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`${ROUTES.PAYROLL_SLIPS}/${slip.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            View & Print
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal: Process New Payroll Run */}
      <Modal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        title="Process New Monthly Payroll Run"
      >
        <form onSubmit={handleProcessRun} className="space-y-4">
          {runError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600 border border-rose-200">
              {runError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="period_month">Month</Label>
              <select
                id="period_month"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={runForm.period_month}
                onChange={(e) =>
                  setRunForm((prev) => ({ ...prev, period_month: Number(e.target.value) }))
                }
              >
                {[
                  "January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"
                ].map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="period_year">Year</Label>
              <Input
                id="period_year"
                type="number"
                value={runForm.period_year}
                onChange={(e) =>
                  setRunForm((prev) => ({ ...prev, period_year: Number(e.target.value) }))
                }
                min={2020}
                max={2030}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="run_title">Run Title (Optional)</Label>
            <Input
              id="run_title"
              placeholder="e.g. October 2026 Regular Payroll"
              value={runForm.title || ""}
              onChange={(e) => setRunForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="run_notes">Notes / Memo</Label>
            <Input
              id="run_notes"
              placeholder="e.g. Approved seasonal bonuses included"
              value={runForm.notes || ""}
              onChange={(e) => setRunForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRunModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={runLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {runLoading ? "Calculating..." : "Calculate & Generate Run"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Configure Salary Structure */}
      <Modal
        isOpen={showStructureModal}
        onClose={() => setShowStructureModal(false)}
        title="Configure Employee Salary Structure"
      >
        <form onSubmit={handleSaveStructure} className="space-y-4">
          {structureError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600 border border-rose-200">
              {structureError}
            </div>
          )}

          <div>
            <Label htmlFor="struct_emp_id">Employee ID (UUID)</Label>
            <Input
              id="struct_emp_id"
              placeholder="Enter Employee UUID"
              value={structureForm.employee_id}
              onChange={(e) =>
                setStructureForm((prev) => ({ ...prev, employee_id: e.target.value }))
              }
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="struct_base">Base Monthly Salary ($)</Label>
              <Input
                id="struct_base"
                type="number"
                value={structureForm.base_salary}
                onChange={(e) =>
                  setStructureForm((prev) => ({
                    ...prev,
                    base_salary: Number(e.target.value),
                  }))
                }
                min={0}
                required
              />
            </div>
            <div>
              <Label htmlFor="struct_hra">HRA Allowance ($)</Label>
              <Input
                id="struct_hra"
                type="number"
                value={structureForm.hra}
                onChange={(e) =>
                  setStructureForm((prev) => ({ ...prev, hra: Number(e.target.value) }))
                }
                min={0}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="struct_freq">Payment Frequency</Label>
              <select
                id="struct_freq"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={structureForm.payment_frequency}
                onChange={(e) =>
                  setStructureForm((prev) => ({
                    ...prev,
                    payment_frequency: e.target.value,
                  }))
                }
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="weekly">Weekly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <Label htmlFor="struct_date">Effective From</Label>
              <Input
                id="struct_date"
                type="date"
                value={structureForm.effective_from}
                onChange={(e) =>
                  setStructureForm((prev) => ({
                    ...prev,
                    effective_from: e.target.value,
                  }))
                }
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowStructureModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={structureLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {structureLoading ? "Saving..." : "Save Salary Structure"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
