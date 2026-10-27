"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import type { TravelSettlementCreate } from "@/types/travel";

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TravelSettlementCreate) => Promise<void>;
  tripNumber: string;
  currency: string;
  settlementBalance: number;
  approvedExpenses: number;
  advancePaid: number;
  requesterName?: string | null;
}

export function SettlementModal({
  isOpen,
  onClose,
  onSubmit,
  tripNumber,
  currency,
  settlementBalance,
  approvedExpenses,
  advancePaid,
  requesterName,
}: SettlementModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isReimbursement = settlementBalance >= 0;
  const absAmount = Math.abs(settlementBalance);

  const [form, setForm] = React.useState<TravelSettlementCreate>({
    settlement_type: isReimbursement ? "reimbursement" : "recovery",
    amount: absAmount,
    currency: currency || "USD",
    payment_date: new Date().toISOString().split("T")[0] as string,
    payment_reference: "",
    payment_method: "bank_transfer",
    notes: "",
    mark_trip_settled: true,
  });

  React.useEffect(() => {
    setForm((prev: TravelSettlementCreate) => ({
      ...prev,
      amount: absAmount,
      settlement_type: isReimbursement ? "reimbursement" : "recovery",
      currency: currency || "USD",
    }));
  }, [absAmount, isReimbursement, currency]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "number") {
      setForm((prev: TravelSettlementCreate) => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setForm((prev: TravelSettlementCreate) => ({ ...prev, [name]: checked }));
    } else {
      setForm((prev: TravelSettlementCreate) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.payment_reference.trim()) {
      setError("Please provide a payment reference (e.g. wire transfer #, receipt #, payroll voucher)");
      return;
    }
    if (form.amount <= 0 && settlementBalance !== 0) {
      setError("Settlement amount must be greater than zero");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(form);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record settlement";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(val);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Financial Settlement"
      description={`Finalize reconciliation and execute reimbursement/recovery for trip ${tripNumber}.`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Balance Breakdown Banner */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="text-slate-500 font-medium">Reconciled Trip Owner:</span>
            <span className="font-semibold text-slate-800">{requesterName || "Employee"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2 rounded bg-white border border-slate-100">
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
                Approved Claims
              </span>
              <span className="font-bold text-slate-800 text-xs">
                {formatCurrency(approvedExpenses)}
              </span>
            </div>
            <div className="p-2 rounded bg-white border border-slate-100">
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
                Advance Paid
              </span>
              <span className="font-bold text-slate-800 text-xs">
                {formatCurrency(advancePaid)}
              </span>
            </div>
            <div
              className={`p-2 rounded border ${
                settlementBalance > 0
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : settlementBalance < 0
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
            >
              <span className="text-[10px] uppercase tracking-wider block opacity-80">
                Settlement Balance
              </span>
              <span className="font-bold text-xs">
                {formatCurrency(settlementBalance)}
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2 text-[11px]">
            {settlementBalance > 0 ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <ArrowDownLeft className="h-3.5 w-3.5" />
                Company owes employee {formatCurrency(settlementBalance)} (Reimbursement due)
              </span>
            ) : settlementBalance < 0 ? (
              <span className="text-amber-700 font-semibold flex items-center gap-1">
                <ArrowUpRight className="h-3.5 w-3.5" />
                Employee owes company {formatCurrency(Math.abs(settlementBalance))} (Advance excess recovery)
              </span>
            ) : (
              <span className="text-blue-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Expenses precisely equal advances paid. Zero net balance.
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="settlement_type" className="text-xs font-semibold text-slate-700">
              Settlement Transaction Type
            </Label>
            <select
              id="settlement_type"
              name="settlement_type"
              value={form.settlement_type}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="reimbursement">Reimbursement Payment to Employee</option>
              <option value="recovery">Employee Recovery / Refund Returned</option>
              <option value="final_balance">Zero-Balance Final Closeout</option>
            </select>
          </div>

          <div>
            <Label htmlFor="amount" className="text-xs font-semibold text-slate-700">
              Settlement Amount ($) <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              className="mt-1 font-semibold"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="payment_reference" className="text-xs font-semibold text-slate-700">
              Payment Reference # <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="payment_reference"
              name="payment_reference"
              value={form.payment_reference}
              onChange={handleChange}
              placeholder="e.g. WIRE-89912 or PAYROLL-OCT-01"
              className="mt-1 font-mono uppercase"
              required
            />
          </div>

          <div>
            <Label htmlFor="payment_method" className="text-xs font-semibold text-slate-700">
              Payment Method
            </Label>
            <select
              id="payment_method"
              name="payment_method"
              value={form.payment_method || "bank_transfer"}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="bank_transfer">Direct Bank Transfer / ACH</option>
              <option value="payroll">Integrated Payroll Run</option>
              <option value="cheque">Company Cheque</option>
              <option value="cash">Petty Cash</option>
              <option value="other">Other Method</option>
            </select>
          </div>

          <div>
            <Label htmlFor="payment_date" className="text-xs font-semibold text-slate-700">
              Settlement Date
            </Label>
            <Input
              id="payment_date"
              type="date"
              name="payment_date"
              value={form.payment_date}
              onChange={handleChange}
              className="mt-1"
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
            Reconciliation Notes & Verification Comments
          </Label>
          <textarea
            id="notes"
            name="notes"
            value={form.notes || ""}
            onChange={handleChange}
            rows={2}
            placeholder="Verified receipts match approved claims and advance deductions..."
            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
          />
        </div>

        <div className="pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
            <input
              type="checkbox"
              name="mark_trip_settled"
              checked={form.mark_trip_settled}
              onChange={handleChange}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Mark this trip as Financially Settled in the registry</span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{loading ? "Recording..." : "Record & Finalize Settlement"}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
