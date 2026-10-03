"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  User,
  XCircle,
  CreditCard,
  Ban,
  Send,
  Building,
  Briefcase,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { ExpenseDetail, ExpenseStatus } from "@/types/finance";

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  submitted: { label: "Submitted", className: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", className: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-600 border-neutral-300" },
  paid: { label: "Paid", className: "bg-purple-50 text-purple-700 border-purple-200" },
};

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const expenseId = params?.id || "";

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canView = permissions.includes("finance.view");
  const canUpdate = permissions.includes("finance.update");
  const canApprove = permissions.includes("finance.approve");
  const canPay = permissions.includes("finance.pay");

  const [expense, setExpense] = React.useState<ExpenseDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Actions
  const [actionLoading, setActionLoading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Modals
  const [showRejectModal, setShowRejectModal] = React.useState(false);
  const [rejectComment, setRejectComment] = React.useState("");

  const [showPayModal, setShowPayModal] = React.useState(false);
  const [payNotes, setPayNotes] = React.useState("");

  const fetchExpense = React.useCallback(async () => {
    if (!currentOrganization?.id || !expenseId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.finance.expenseDetail(expenseId));
      const data = (res as any)?.data || res;
      setExpense(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load expense details.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, expenseId]);

  React.useEffect(() => {
    if (canView) fetchExpense();
  }, [canView, fetchExpense]);

  const handleSubmit = async () => {
    if (!expenseId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient.post(API_ENDPOINTS.finance.submitExpense(expenseId), {});
      fetchExpense();
    } catch (err: any) {
      setActionError(err?.message || "Failed to submit expense.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!expenseId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient.post(API_ENDPOINTS.finance.approveExpense(expenseId), { comment: "Approved" });
      fetchExpense();
    } catch (err: any) {
      setActionError(err?.message || "Failed to approve expense.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseId || !rejectComment.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient.post(API_ENDPOINTS.finance.rejectExpense(expenseId), {
        comment: rejectComment.trim(),
      });
      setShowRejectModal(false);
      setRejectComment("");
      fetchExpense();
    } catch (err: any) {
      setActionError(err?.message || "Failed to reject expense.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient.post(API_ENDPOINTS.finance.payExpense(expenseId), {
        notes: payNotes.trim() || undefined,
      });
      setShowPayModal(false);
      setPayNotes("");
      fetchExpense();
    } catch (err: any) {
      setActionError(err?.message || "Failed to process payment.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!expenseId) return;
    if (!confirm("Are you sure you want to cancel this expense?")) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient.post(API_ENDPOINTS.finance.cancelExpense(expenseId), {});
      fetchExpense();
    } catch (err: any) {
      setActionError(err?.message || "Failed to cancel expense.");
    } finally {
      setActionLoading(false);
    }
  };

  if (isOrgLoading) return <LoadingState message="Loading organization..." />;
  if (!canView) {
    return (
      <ErrorState
        title="Access Denied"
        message="You don't have permission to view this expense."
      />
    );
  }

  if (isLoading) return <LoadingState message="Loading expense details..." />;
  if (error || !expense) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <ErrorState
          title="Error"
          message={error || "Expense not found"}
          onRetry={fetchExpense}
        />
        <Link href="/finance">
          <Button variant="outline" size="sm">
            Back to Finance
          </Button>
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[expense.status] || STATUS_CONFIG.draft;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back Button & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance">
            <Button variant="ghost" size="sm" className="gap-1 text-slate-600">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{expense.expense_number}</h1>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusConfig.className}`}
              >
                {statusConfig.label}
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Date: {expense.expense_date} • Category: {expense.category?.name || "General"}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {actionError && (
            <span className="text-xs text-rose-600 mr-2">{actionError}</span>
          )}

          {(expense.status === "draft" || expense.status === "rejected") && canUpdate && (
            <Button
              onClick={handleSubmit}
              disabled={actionLoading}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4" />
              Submit for Approval
            </Button>
          )}

          {expense.status === "submitted" && canApprove && (
            <>
              <Button
                onClick={handleApprove}
                disabled={actionLoading}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRejectModal(true)}
                disabled={actionLoading}
                className="gap-1.5 text-rose-600 border-rose-300 hover:bg-rose-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </>
          )}

          {expense.status === "approved" && canPay && (
            <Button
              onClick={() => setShowPayModal(true)}
              disabled={actionLoading}
              className="gap-1.5 bg-purple-600 hover:bg-purple-700"
            >
              <CreditCard className="h-4 w-4" />
              Record Payment
            </Button>
          )}

          {expense.status !== "paid" && expense.status !== "cancelled" && canUpdate && (
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={actionLoading}
              className="gap-1.5 text-slate-600"
            >
              <Ban className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 spans): Details & Line Items */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Summary Card */}
          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-medium text-slate-900">
                Expense Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-slate-500">Employee</Label>
                <p className="mt-1 font-medium text-slate-900">
                  {expense.employee
                    ? `${expense.employee.first_name} ${expense.employee.last_name} (${expense.employee.employee_code})`
                    : "—"}
                </p>
                {expense.employee?.designation && (
                  <p className="text-xs text-slate-500">{expense.employee.designation}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-slate-500">Category</Label>
                <p className="mt-1 font-medium text-slate-900">
                  {expense.category?.name} ({expense.category?.code})
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-slate-500">Description</Label>
                <p className="mt-1 text-sm text-slate-700">
                  {expense.description || "No description provided."}
                </p>
              </div>
              {expense.notes && (
                <div className="sm:col-span-2">
                  <Label className="text-xs text-slate-500">Notes / Remarks</Label>
                  <p className="mt-1 text-sm text-slate-600 bg-slate-50 p-2.5 rounded-md border border-slate-200 whitespace-pre-wrap">
                    {expense.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items Table */}
          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-medium text-slate-900">
                Expense Line Items ({expense.items?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!expense.items || expense.items.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No individual line items listed. Single amount applied to this expense.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Description</th>
                        <th className="px-4 py-2.5 text-right">Qty</th>
                        <th className="px-4 py-2.5 text-right">Unit Price</th>
                        <th className="px-4 py-2.5 text-right">Tax</th>
                        <th className="px-4 py-2.5 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expense.items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{item.description}</td>
                          <td className="px-4 py-3 text-right">{Number(item.quantity).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">${Number(item.unit_price).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">${Number(item.tax_amount).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            ${Number(item.line_total).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Financial Totals & Lifecycle Information */}
        <div className="flex flex-col gap-6">
          {/* Totals Card */}
          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-medium text-slate-900">
                Financial Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal Amount:</span>
                <span className="font-medium text-slate-900">${Number(expense.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Tax Amount:</span>
                <span className="font-medium text-slate-900">${Number(expense.tax_amount).toFixed(2)}</span>
              </div>
              <div className="border-t border-slate-100 pt-3 flex justify-between text-base font-bold text-slate-900">
                <span>Total Amount:</span>
                <span className="text-emerald-700">
                  ${Number(expense.total_amount).toFixed(2)} {expense.currency}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Audit / Lifecycle Card */}
          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-medium text-slate-900">
                Status & Approvals
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4 text-sm">
              <div>
                <Label className="text-xs text-slate-500">Submitted At</Label>
                <p className="mt-0.5 text-slate-800">
                  {expense.submitted_at
                    ? new Date(expense.submitted_at).toLocaleString()
                    : "Not submitted yet"}
                </p>
              </div>

              {expense.reviewer && (
                <div>
                  <Label className="text-xs text-slate-500">Reviewed By</Label>
                  <p className="mt-0.5 font-medium text-slate-800">
                    {expense.reviewer.first_name} {expense.reviewer.last_name}
                  </p>
                </div>
              )}

              {expense.approved_at && (
                <div>
                  <Label className="text-xs text-slate-500">Approved Date</Label>
                  <p className="mt-0.5 text-emerald-700">
                    {new Date(expense.approved_at).toLocaleString()}
                  </p>
                </div>
              )}

              {expense.rejected_at && (
                <div>
                  <Label className="text-xs text-slate-500">Rejected Date</Label>
                  <p className="mt-0.5 text-rose-700">
                    {new Date(expense.rejected_at).toLocaleString()}
                  </p>
                  {expense.reviewer_comment && (
                    <p className="mt-1 text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
                      Reason: {expense.reviewer_comment}
                    </p>
                  )}
                </div>
              )}

              {expense.paid_at && (
                <div>
                  <Label className="text-xs text-slate-500">Paid Date</Label>
                  <p className="mt-0.5 text-purple-700 font-medium">
                    {new Date(expense.paid_at).toLocaleString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Context Links (Project, Client, Branch) */}
          {(expense.project || expense.client || expense.branch) && (
            <Card>
              <CardHeader className="border-b border-slate-100 pb-3">
                <CardTitle className="text-base font-medium text-slate-900">
                  Associations
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-4 text-sm">
                {expense.project && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-500">Project:</span>
                    <span className="font-medium text-slate-900">{expense.project.name}</span>
                  </div>
                )}
                {expense.client && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-500">Client:</span>
                    <span className="font-medium text-slate-900">{expense.client.name}</span>
                  </div>
                )}
                {expense.branch && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-500">Branch:</span>
                    <span className="font-medium text-slate-900">{expense.branch.name}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <Modal
          isOpen={showRejectModal}
          onClose={() => setShowRejectModal(false)}
          title="Reject Expense Request"
        >
          <form onSubmit={handleReject} className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              Please state a reason for rejecting this expense. This comment is required.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reject_comment">Reason for Rejection *</Label>
              <textarea
                id="reject_comment"
                required
                rows={3}
                placeholder="e.g. Missing receipt or exceeds allowable per diem..."
                className="rounded-md border border-slate-200 p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRejectModal(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading || !rejectComment.trim()}
                className="bg-rose-600 hover:bg-rose-700"
              >
                {actionLoading ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Pay Modal */}
      {showPayModal && (
        <Modal
          isOpen={showPayModal}
          onClose={() => setShowPayModal(false)}
          title="Record Expense Payment"
        >
          <form onSubmit={handlePay} className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              Mark this expense as paid. This will automatically record a corresponding financial transaction entry in the general ledger.
            </p>
            <div className="rounded-md bg-purple-50 p-3 text-sm text-purple-900">
              Total to Pay: <strong>${Number(expense.total_amount).toFixed(2)} {expense.currency}</strong>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay_notes">Payment Reference / Notes</Label>
              <Input
                id="pay_notes"
                placeholder="e.g. Bank transfer ref #12345"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPayModal(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {actionLoading ? "Recording..." : "Confirm Payment"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
