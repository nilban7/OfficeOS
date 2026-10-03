"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ROUTES } from "@/constants/routes";
import type { Payslip } from "@/types/payroll";

export default function PayslipDetailPage() {
  const params = useParams();
  const slipId = params.id as string;
  const { currentOrganization, isLoading: isOrgLoading } = useOrganization();

  const [slip, setSlip] = React.useState<Payslip | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchPayslip = React.useCallback(async () => {
    if (!currentOrganization || !slipId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Payslip>(API_ENDPOINTS.payroll.payslipDetail(slipId));
      setSlip(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load payslip");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, slipId]);

  React.useEffect(() => {
    fetchPayslip();
  }, [fetchPayslip]);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Generating printable payslip..." />;
  }

  if (error || !slip) {
    return <ErrorState message={error || "Payslip not found"} onRetry={fetchPayslip} />;
  }

  const earningsList = Object.entries(slip.earnings_breakdown || {});
  const deductionsList = Object.entries(slip.deductions_breakdown || {});

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top bar with back & print actions (hidden in print media) */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={ROUTES.PAYROLL}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Payroll Hub
        </Link>
        <div className="flex items-center gap-2">
          <Button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Official Printable Payslip Document */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm print:border-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-emerald-600" />
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                {currentOrganization?.name || "OfficeOS Organization"}
              </h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">Official Employee Salary Statement</p>
          </div>
          <div className="text-left sm:text-right">
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <CheckCircle className="h-3.5 w-3.5" />
              {slip.status}
            </span>
            <p className="text-xs text-slate-400 mt-2">Payslip #: {slip.payslip_number}</p>
            <p className="text-xs text-slate-400">Date: {new Date(slip.created_at).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Employee & Pay Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 border-b border-slate-200 text-sm">
          <div>
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Employee Name</span>
            <p className="font-semibold text-slate-900 mt-0.5">{slip.employee_name || "Employee"}</p>
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Employee Code</span>
            <p className="font-semibold text-slate-900 mt-0.5">{slip.employee_code || "—"}</p>
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Department</span>
            <p className="font-semibold text-slate-900 mt-0.5">{slip.department_name || "General"}</p>
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Paid / Total Days</span>
            <p className="font-semibold text-slate-900 mt-0.5">{slip.paid_days} Days</p>
          </div>
        </div>

        {/* Earnings & Deductions Breakdown Tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6 border-b border-slate-200">
          {/* Earnings (Left) */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50/60 px-3 py-2 rounded">
              Earnings Breakdown
            </h3>
            <table className="w-full mt-3 text-sm">
              <tbody className="divide-y divide-slate-100">
                {earningsList.map(([title, amount]) => (
                  <tr key={title} className="py-2 flex justify-between items-center">
                    <td className="text-slate-600">{title}</td>
                    <td className="font-medium text-slate-900 text-right">
                      ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 pt-2 flex justify-between items-center font-bold text-slate-900">
                  <td>Gross Earnings</td>
                  <td className="text-emerald-700">
                    ${Number(slip.gross_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deductions (Right) */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-rose-800 bg-rose-50/60 px-3 py-2 rounded">
              Deductions Breakdown
            </h3>
            <table className="w-full mt-3 text-sm">
              <tbody className="divide-y divide-slate-100">
                {deductionsList.length === 0 ? (
                  <tr className="py-2 text-slate-400 text-xs italic">
                    <td>No deductions applied</td>
                  </tr>
                ) : (
                  deductionsList.map(([title, amount]) => (
                    <tr key={title} className="py-2 flex justify-between items-center">
                      <td className="text-slate-600">{title}</td>
                      <td className="font-medium text-rose-600 text-right">
                        -${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 pt-2 flex justify-between items-center font-bold text-slate-900">
                  <td>Total Deductions</td>
                  <td className="text-rose-600">
                    -${Number(slip.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Net Pay Callout */}
        <div className="bg-slate-50 rounded-xl p-6 my-6 flex flex-col sm:flex-row items-center justify-between border border-slate-200">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Net Payout
            </span>
            <p className="text-sm text-slate-500 mt-0.5">Disbursed via {slip.payment_method.replace("_", " ")}</p>
          </div>
          <div className="mt-4 sm:mt-0 text-right">
            <span className="text-3xl font-extrabold text-emerald-600">
              ${Number(slip.net_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Footer Notes & Signatures */}
        <div className="pt-6 text-xs text-slate-400 flex flex-col sm:flex-row justify-between items-end gap-6">
          <div>
            <p>This is a computer-generated salary slip and requires no physical signature.</p>
            <p className="mt-1">Generated by OfficeOS Enterprise SaaS Platform.</p>
          </div>
          <div className="text-right">
            <div className="h-10 border-b border-slate-300 w-48 mb-1"></div>
            <p className="text-slate-500 font-medium">Authorized Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
