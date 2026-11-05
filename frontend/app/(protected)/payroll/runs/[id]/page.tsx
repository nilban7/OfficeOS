"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  Eye,
  FileText,
  GraduationCap,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
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
import type { Internship, StipendCreateDisburseRequest, StipendDisbursement } from "@/types/internship";

const STATUS_CONFIG: Record<PayrollStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  processing: { label: "Processing", className: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", className: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function PayrollRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;
  const { currentOrganization, isLoading: isOrgLoading } = useOrganization();

  const [run, setRun] = React.useState<PayrollRun | null>(null);
  const [payslips, setPayslips] = React.useState<Payslip[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Sync / Recalculate
  const [isSyncing, setIsSyncing] = React.useState(false);

  // Approve and Delete actions
  const [isApproving, setIsApproving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Disburse modal
  const [showDisburseModal, setShowDisburseModal] = React.useState(false);
  const [isDisbursing, setIsDisbursing] = React.useState(false);
  const [disburseError, setDisburseError] = React.useState<string | null>(null);
  const [disburseForm, setDisburseForm] = React.useState<PayslipDisburseRequest>({
    payment_method: "bank_transfer",
    payment_reference: "",
  });

  // Intern Stipends in this Run
  const [stipends, setStipends] = React.useState<StipendDisbursement[]>([]);
  const [activeInternships, setActiveInternships] = React.useState<Internship[]>([]);
  const [showInternStipendModal, setShowInternStipendModal] = React.useState(false);
  const [internStipendLoading, setInternStipendLoading] = React.useState(false);
  const [internStipendError, setInternStipendError] = React.useState<string | null>(null);
  const [internStipendForm, setInternStipendForm] = React.useState<StipendCreateDisburseRequest>({
    internship_id: "",
    intern_name: "",
    period_month: 1,
    period_year: 2026,
    stipend_amount: "0.00",
    payroll_id: runId,
    payment_method: "bank_transfer",
    payment_reference: "",
    notes: "",
  });

  const fetchRunDetails = React.useCallback(async () => {
    if (!currentOrganization || !runId) return;
    setIsLoading(true);
    setError(null);
    try {
      // Fetch run detail first so any dynamic calculations sync before loading payslips
      const runRes = await apiClient.get<PayrollRun>(API_ENDPOINTS.payroll.runDetail(runId));
      const slipsRes = await apiClient.get<Payslip[]>(API_ENDPOINTS.payroll.payslips, {
        params: { payroll_id: runId },
      });
      setRun(runRes);
      setPayslips(slipsRes || []);

      // Fetch intern stipends for this run / period
      try {
        const stipendsRes = await apiClient.get<any>(API_ENDPOINTS.payroll.runStipends(runId));
        const stipendsData = (stipendsRes as any)?.data || stipendsRes;
        setStipends(Array.isArray(stipendsData) ? stipendsData : []);
      } catch {
        // non-blocking
      }

      // Fetch active internships for the disbursement dropdown
      try {
        const intRes = await apiClient.get<any>(`${API_ENDPOINTS.internships.list}?page_size=100`);
        const intData = (intRes as any)?.data || intRes;
        setActiveInternships(intData?.items || []);
      } catch {
        // non-blocking
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load payroll run details");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, runId]);

  React.useEffect(() => {
    fetchRunDetails();
  }, [fetchRunDetails]);

  // When run loads, pre-populate period in internStipendForm
  React.useEffect(() => {
    if (run) {
      setInternStipendForm((prev) => ({
        ...prev,
        period_month: run.period_month,
        period_year: run.period_year,
      }));
    }
  }, [run]);

  const handleDisburseInternStipend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runId || !internStipendForm.internship_id) return;
    setInternStipendLoading(true);
    setInternStipendError(null);
    try {
      await apiClient.post(API_ENDPOINTS.payroll.disburseRunStipend(runId), {
        ...internStipendForm,
        payroll_id: runId,
        period_month: run?.period_month || internStipendForm.period_month,
        period_year: run?.period_year || internStipendForm.period_year,
      });
      setShowInternStipendModal(false);
      await fetchRunDetails();
    } catch (err: unknown) {
      setInternStipendError(err instanceof Error ? err.message : "Failed to disburse intern stipend");
    } finally {
      setInternStipendLoading(false);
    }
  };

  // Handle Sync / Recalculate
  const handleSyncRun = async () => {
    if (!runId) return;
    setIsSyncing(true);
    try {
      await apiClient.post(API_ENDPOINTS.payroll.syncRun(runId));
      await fetchRunDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to recalculate payroll run");
    } finally {
      setIsSyncing(false);
    }
  };

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

  // Handle Delete Draft Run
  const handleDeleteRun = async () => {
    if (!confirm("Are you sure you want to delete this draft payroll run? You can then re-generate it with only the declared employees.")) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(API_ENDPOINTS.payroll.deleteRun(runId));
      router.push(ROUTES.PAYROLL);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete payroll run");
      setIsDeleting(false);
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

  const totalBonusInRun = React.useMemo(() => {
    return payslips.reduce((acc, slip) => {
      const bSum = Object.entries(slip.earnings_breakdown || {})
        .filter(([k]) => k.toLowerCase().startsWith("bonus"))
        .reduce((sum, [, val]) => sum + Number(val || 0), 0);
      return acc + bSum;
    }, 0);
  }, [payslips]);

  const totalStipendsInRun = React.useMemo(() => {
    return stipends.reduce((acc, s) => acc + Number(s.stipend_amount || 0), 0);
  }, [stipends]);

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
            {run.status !== "paid" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Sparkles className="h-3 w-3" />
                Dynamic
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Period: {run.period_month}/{run.period_year} • {run.employee_count} Employees Included
          </p>
        </div>

        <div className="flex items-center gap-3">
          {run.status !== "paid" && run.status !== "cancelled" && (
            <Button
              variant="outline"
              onClick={handleSyncRun}
              disabled={isSyncing || isApproving || isDeleting}
              className="border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
              title="Recalculate bonuses, salary structures, and deductions"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Recalculating..." : "Recalculate Run"}
            </Button>
          )}

          {(run.status === "draft" || run.status === "processing") && (
            <>
              <Button
                variant="outline"
                onClick={handleDeleteRun}
                disabled={isDeleting || isApproving || isSyncing}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? "Deleting..." : "Delete Draft"}
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isApproving || isDeleting || isSyncing}
                className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                {isApproving ? "Approving..." : "Approve for Disbursement"}
              </Button>
            </>
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
              Disbursed on {run.payment_date || "today"} (Locked)
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className={`grid grid-cols-1 gap-4 ${totalBonusInRun > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        <Card className="border border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gross Total</p>
            <h3 className="text-xl font-bold text-slate-900 mt-1">
              ${Number(run.total_gross_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
          </CardContent>
        </Card>
        {totalBonusInRun > 0 && (
          <Card className="border border-amber-200 bg-amber-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                  Bonuses Included
                </p>
                <Sparkles className="h-4 w-4 text-amber-500" />
              </div>
              <h3 className="text-xl font-bold text-amber-700 mt-1">
                +${totalBonusInRun.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
            </CardContent>
          </Card>
        )}
        {totalStipendsInRun > 0 && (
          <Card className="border border-indigo-200 bg-indigo-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-800">
                  Intern Stipends
                </p>
                <GraduationCap className="h-4 w-4 text-indigo-500" />
              </div>
              <h3 className="text-xl font-bold text-indigo-700 mt-1">
                ${totalStipendsInRun.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
            </CardContent>
          </Card>
        )}
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

      {/* Bonus Callout Banner */}
      {totalBonusInRun > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">Approved Bonuses Included in this Run</h4>
              <p className="text-xs text-amber-700">
                All approved bonus allocations for period {run.period_month}/{run.period_year} are automatically calculated and itemized in recipient payslips.
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider block">
              Total Run Bonus
            </span>
            <span className="text-lg font-extrabold text-amber-700">
              +${totalBonusInRun.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

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
                <th className="px-4 py-3">Bonus</th>
                <th className="px-4 py-3">Gross Pay</th>
                <th className="px-4 py-3">Deductions</th>
                <th className="px-4 py-3">Net Pay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payslips.map((slip) => {
                const slipBonus = Object.entries(slip.earnings_breakdown || {})
                  .filter(([k]) => k.toLowerCase().startsWith("bonus"))
                  .reduce((sum, [, val]) => sum + Number(val || 0), 0);

                return (
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
                    <td className="px-4 py-3">
                      {slipBonus > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs border border-amber-200">
                          <Sparkles className="h-3 w-3 text-amber-500" />
                          +${slipBonus.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intern Stipend Disbursements Section */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Intern Stipend Payroll Disbursements</h2>
              <span className="rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 text-xs font-semibold">
                {stipends.length} {stipends.length === 1 ? "Disbursement" : "Disbursements"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Track and disburse stipends for interns enrolled during period {run.period_month}/{run.period_year}
            </p>
          </div>

          <Button
            onClick={() => {
              if (activeInternships.length > 0 && !internStipendForm.internship_id) {
                const first = activeInternships[0];
                if (first) {
                  setInternStipendForm((prev) => ({
                    ...prev,
                    internship_id: first.id,
                    intern_name: first.intern_name,
                    stipend_amount: first.stipend || "0.00",
                  }));
                }
              }
              setShowInternStipendModal(true);
            }}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Disburse Intern Stipend
          </Button>
        </div>

        {stipends.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
            <GraduationCap className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No intern stipends disbursed for this period yet.</p>
            <p className="text-xs text-slate-500 mt-1">
              Click &quot;Disburse Intern Stipend&quot; above to disburse monthly stipends to active interns.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Intern Name</th>
                  <th className="px-4 py-3">Internship Program</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Stipend Amount</th>
                  <th className="px-4 py-3">Payment Method & Ref</th>
                  <th className="px-4 py-3">Disbursed Date</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stipends.map((stipend) => (
                  <tr key={stipend.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {stipend.intern_name}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {stipend.internship_title || "Internship Program"}
                      {stipend.internship_code && (
                        <span className="block font-mono text-slate-400">{stipend.internship_code}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {run.period_month}/{run.period_year}
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-600">
                      ${Number(stipend.stipend_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <span className="capitalize">{stipend.payment_method.replace("_", " ")}</span>
                      {stipend.payment_reference && (
                        <span className="block font-mono text-slate-400">Ref: {stipend.payment_reference}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {stipend.disbursed_at ? stipend.disbursed_at.slice(0, 10) : "Pending"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        {stipend.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

      {/* Disburse Intern Stipend Modal */}
      <Modal
        isOpen={showInternStipendModal}
        onClose={() => { setShowInternStipendModal(false); setInternStipendError(null); }}
        title="Disburse Intern Stipend in Payroll Run"
        size="md"
      >
        <form onSubmit={handleDisburseInternStipend} className="space-y-4">
          {internStipendError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600 border border-rose-200">
              {internStipendError}
            </div>
          )}

          <div>
            <Label htmlFor="stipend_program">Select Internship *</Label>
            <select
              id="stipend_program"
              required
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
              value={internStipendForm.internship_id}
              onChange={(e) => {
                const sel = activeInternships.find((i) => i.id === e.target.value);
                setInternStipendForm((prev) => ({
                  ...prev,
                  internship_id: e.target.value,
                  intern_name: sel?.intern_name || prev.intern_name,
                  stipend_amount: sel?.stipend || prev.stipend_amount,
                }));
              }}
            >
              <option value="">Select an internship program...</option>
              {activeInternships.map((int) => (
                <option key={int.id} value={int.id}>
                  {int.code} — {int.title} ({int.intern_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="stipend_intern_name">Intern Name *</Label>
            <Input
              id="stipend_intern_name"
              required
              value={internStipendForm.intern_name}
              onChange={(e) =>
                setInternStipendForm((prev) => ({ ...prev, intern_name: e.target.value }))
              }
              placeholder="e.g. Rahul Sharma"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="stipend_amount">Stipend Amount ($) *</Label>
              <Input
                id="stipend_amount"
                type="number"
                min={0}
                step="0.01"
                required
                value={internStipendForm.stipend_amount}
                onChange={(e) =>
                  setInternStipendForm((prev) => ({ ...prev, stipend_amount: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="stipend_pay_method">Payment Method</Label>
              <select
                id="stipend_pay_method"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                value={internStipendForm.payment_method}
                onChange={(e) =>
                  setInternStipendForm((prev) => ({ ...prev, payment_method: e.target.value }))
                }
              >
                <option value="bank_transfer">Direct Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="wire_transfer">Wire Transfer</option>
                <option value="cheque">Company Cheque</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="stipend_pay_ref">Payment Reference / UTR Number</Label>
            <Input
              id="stipend_pay_ref"
              placeholder="e.g. UTR-20261105-881"
              value={internStipendForm.payment_reference || ""}
              onChange={(e) =>
                setInternStipendForm((prev) => ({ ...prev, payment_reference: e.target.value }))
              }
            />
          </div>

          <div>
            <Label htmlFor="stipend_notes">Notes</Label>
            <Input
              id="stipend_notes"
              placeholder="Period stipend disbursement via payroll run"
              value={internStipendForm.notes || ""}
              onChange={(e) =>
                setInternStipendForm((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowInternStipendModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={internStipendLoading || !internStipendForm.internship_id}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {internStipendLoading ? "Disbursing..." : "Confirm Stipend Disbursement"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
