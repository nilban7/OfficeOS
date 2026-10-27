"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import type { TravelExpenseCreate } from "@/types/travel";

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TravelExpenseCreate) => Promise<void>;
  tripCurrency?: string;
  members: { id: string; employee_id: string; employee_name?: string | null }[];
}

export function ExpenseModal({
  isOpen,
  onClose,
  onSubmit,
  tripCurrency = "USD",
  members,
}: ExpenseModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<TravelExpenseCreate>({
    category: "meals",
    expense_date: new Date().toISOString().split("T")[0] as string,
    description: "",
    amount: 0,
    currency: tripCurrency,
    receipt_url: "",
    receipt_file_name: "",
    payment_method: "employee_paid",
    is_reimbursable: true,
    submit_immediately: true,
    employee_id: undefined,
  });

  React.useEffect(() => {
    if (members.length > 0 && !form.employee_id && members[0]?.employee_id) {
      const firstEmpId = members[0].employee_id;
      setForm((prev: TravelExpenseCreate) => ({ ...prev, employee_id: firstEmpId }));
    }
  }, [members, form.employee_id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "number") {
      setForm((prev: TravelExpenseCreate) => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setForm((prev: TravelExpenseCreate) => ({ ...prev, [name]: checked }));
    } else {
      setForm((prev: TravelExpenseCreate) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) {
      setError("Please describe the expense");
      return;
    }
    if (form.amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(form);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record expense";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Travel Expense"
      description="Record an incurred expense with receipt proof for review and settlement."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="employee_id" className="text-xs font-semibold text-slate-700">
              Claimant Employee
            </Label>
            <select
              id="employee_id"
              name="employee_id"
              value={form.employee_id || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              {members.map((m) => (
                <option key={m.id} value={m.employee_id}>
                  {m.employee_name || "Employee"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="category" className="text-xs font-semibold text-slate-700">
              Expense Category
            </Label>
            <select
              id="category"
              name="category"
              value={form.category}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="flight">Flight / Airline</option>
              <option value="train">Train / Rail</option>
              <option value="bus">Bus / Coach</option>
              <option value="car_rental">Car Rental / Fuel</option>
              <option value="local_transport">Local Transport / Taxi</option>
              <option value="accommodation">Hotel & Accommodation</option>
              <option value="meals">Meals & Daily Food</option>
              <option value="per_diem">Per Diem Allowance</option>
              <option value="client_entertainment">Client Meeting / Entertainment</option>
              <option value="miscellaneous">Miscellaneous</option>
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="description" className="text-xs font-semibold text-slate-700">
            Description <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="description"
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="e.g. Dinner with ACME clients following discovery session"
            className="mt-1"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="amount" className="text-xs font-semibold text-slate-700">
              Amount <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              name="amount"
              value={form.amount || ""}
              onChange={handleChange}
              placeholder="0.00"
              className="mt-1 font-semibold"
              required
            />
          </div>

          <div>
            <Label htmlFor="currency" className="text-xs font-semibold text-slate-700">
              Currency
            </Label>
            <select
              id="currency"
              name="currency"
              value={form.currency}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="INR">INR (₹)</option>
            </select>
          </div>

          <div>
            <Label htmlFor="expense_date" className="text-xs font-semibold text-slate-700">
              Expense Date
            </Label>
            <Input
              id="expense_date"
              type="date"
              name="expense_date"
              value={form.expense_date}
              onChange={handleChange}
              className="mt-1"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <Label htmlFor="payment_method" className="text-xs font-semibold text-slate-700">
              Paid By / Payment Method
            </Label>
            <select
              id="payment_method"
              name="payment_method"
              value={form.payment_method}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white"
            >
              <option value="employee_paid">Employee Out-of-Pocket (Reimbursable)</option>
              <option value="company_card">Company Corporate Card</option>
              <option value="advance">Paid from Travel Advance</option>
              <option value="company_direct">Direct Company Account / Invoiced</option>
            </select>
          </div>

          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-medium">
              <input
                type="checkbox"
                name="is_reimbursable"
                checked={form.is_reimbursable}
                onChange={handleChange}
                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>Is Reimbursable to Employee</span>
            </label>
          </div>
        </div>

        <div>
          <Label htmlFor="receipt_url" className="text-xs font-semibold text-slate-700">
            Receipt / Invoice Attachment URL
          </Label>
          <Input
            id="receipt_url"
            name="receipt_url"
            value={form.receipt_url || ""}
            onChange={handleChange}
            placeholder="https://... or link to uploaded receipt document"
            className="mt-1 text-xs"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Provide receipt link or document reference for auditing.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={loading} className="bg-primary-600 hover:bg-primary-700 text-white">
            {loading ? "Recording..." : "Record Expense"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
