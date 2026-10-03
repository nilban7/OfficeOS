"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  FileText,
  Send,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ROUTES } from "@/constants/routes";
import type { PayrollRun, PayrollStatus, Payslip, PayslipDisburseRequest } from "@/types/payroll";

const STATUS_CONFIG: Record<PayrollStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  processing: { label: "Processing", className: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", className: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function PayrollRunDetailPage() {
  const params = useParams();
  const runId = params.id as string;
  const { currentOrganization, isLoading: isOrgLoading } = useOrganization();

  const [run, setRun] = React.useState<PayrollRun | null>(null);
  const [payslips, setPayslips] = React.useState<Payslip[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Approve action
  const [isApproving, setIsApproving] = React.useState(false);

  // Disburse modal
  const [showDisburseModal, setShowDisburseModal] = React.useState(false);
  const [isDisbursing, setIsDisbursing] = React.useState(false);
  const [disburseError, setDisburseError] = React.useState<string | null>(null);
  const [disburseForm, setDisburseForm] = React.useState<PayslipDisburseRequest>({
    payment_method: "bank_transfer",
    payment_reference: "",
  });

  const fetchRunDetails = React.useCallback(async () => {
    if (!currentOrganization || !runId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [runRes, slipsRes] = await Promise.all([
        apiClient.get<PayrollRun>(API_ENDPOINTS.payroll.runDetail(runId)),
        apiClient.get<Payslip[]>(API_ENDPOINTS.payroll.payslips, {
          params: { payroll_id: runId },
        }),
      ]);
      setRun(runRes);
      setPayslips(slipsRes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load payroll run details");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, runId]);

  React.useEffect(() => {
    fetchRunDetails();
  }, [fetchRunDetails]);

  // Handle Approve
  const handleApprove = async () => {
    if (!runId) return;
    setIsApproving(true);
    try {
      await apiClient.post(API_ENDPOINTS.payroll.approveRun(runId));
      fetchRunDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to approve payroll run");
    } finally {
      setIsApproving(false);
    }
  };

  // Handle Disburse
  const handleDisburse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runId) return;
    setIsDisbursing(true);
    setDisburseError(null);
    try {
      await apiClient.post(API_ENDPOINTS.payroll.disburseRun(runId), disburseForm);
      setShowDisburseModal(false);
      fetchRunDetails();
    } catch (err: unknown) {
      setDisburseError(err instanceof Error ? err.message : "Failed to disburse payroll");
    } finally {
      setIsDisbursing(false);
    }
  };

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading payroll batch details..." />;
  }

  if (error || !run) {
    return <ErrorState message={error || "Payroll run not found"} onRetry={fetchRunDetails} />;
  }

  const statusInfo = STATUS_CONFIG[run.status] || STATUS_CONFIG.draft;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href={ROUTES.PAYROLL}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Payroll Hub
        </Link>
      </div>

      {/* Header with Title and Workflow Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{run.title}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${statusInfo.className}`}
            >
              {statusInfo.label}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Period: {run.period_month}/{run.period_year} • {run.employee_count} Employees Included
          </p>
        </div>

        <div className="flex items-center gap-3">
          {(run.status === "draft" || run.status === "processing") && (
            <Button
              onClick={handleApprove}
              disabled={isApproving}
              className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              {isApproving ? "Approving..." : "Approve for Disbursement"}
            </Button>
          )}

          {run.status === "approved" && (
            <Button
              onClick={() => setShowDisburseModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Disburse & Mark Paid
            </Button>
          )}

          {run.status === "paid" && (
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <CheckCircle className="h-4 w-4" />
              Disbursed on {run.payment_date || "today"}
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="border border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gross Total</p>
            <h3 className="text-xl font-bold text-slate-900 mt-1">
              ${Number(run.total_gross_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
          </CardContent>
        </Card>
        <Card className="border border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Deductions</p>
            <h3 className="text-xl font-bold text-rose-600 mt-1">
              -${Number(run.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
          </CardContent>
        </Card>
        <Card className="border border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net Payable</p>
            <h3 className="text-xl font-bold text-emerald-600 mt-1">
              ${Number(run.total_net_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
          </CardContent>
        </Card>
        <Card className="border border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recipients</p>
            <h3 className="text-xl font-bold text-slate-900 mt-1">{run.employee_count} Staff</h3>
          </CardContent>
        </Card>
      </div>

      {/* Payslips Table */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Generated Payslips</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Payslip Number</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Base Pay</th>
                <th className="px-4 py-3">Gross Pay</th>
                <th className="px-4 py-3">Deductions</th>
                <th className="px-4 py-3">Net Pay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payslips.map((slip) => (
                <tr key={slip.id} className="hover:bg-slate-50/75 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span>{slip.payslip_number}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{slip.employee_name || "Employee"}</div>
                    <div className="text-xs text-slate-400">{slip.employee_code || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    ${Number(slip.base_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize bg-slate-50 text-slate-700 border border-slate-200">
                      {slip.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`${ROUTES.PAYROLL_SLIPS}/${slip.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                        <Eye className="h-3.5 w-3.5" />
                        Print / View
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disburse Modal */}
      <Modal
        isOpen={showDisburseModal}
        onClose={() => setShowDisburseModal(false)}
        title="Disburse Payroll & Mark as Paid"
      >
        <form onSubmit={handleDisburse} className="space-y-4">
          {disburseError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600 border border-rose-200">
              {disburseError}
            </div>
          )}

          <div>
            <Label htmlFor="pay_method">Payment Method</Label>
            <select
              id="pay_method"
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
              value={disburseForm.payment_method}
              onChange={(e) =>
                setDisburseForm((prev) => ({ ...prev, payment_method: e.target.value }))
              }
            >
              <option value="bank_transfer">Direct Bank Transfer</option>
              <option value="wire_transfer">Wire Transfer</option>
              <option value="cheque">Company Cheque</option>
              <option value="direct_deposit">Automated Direct Deposit (ACH)</option>
            </select>
          </div>

          <div>
            <Label htmlFor="pay_ref">Payment / Reference Number</Label>
            <Input
              id="pay_ref"
              placeholder="e.g. ACH-BATCH-20261001-99"
              value={disburseForm.payment_reference || ""}
              onChange={(e) =>
                setDisburseForm((prev) => ({ ...prev, payment_reference: e.target.value }))
              }
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDisburseModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isDisbursing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isDisbursing ? "Processing..." : "Confirm Disbursement"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
