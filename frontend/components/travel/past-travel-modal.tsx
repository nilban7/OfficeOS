"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, CheckCircle2, AlertCircle, ShieldAlert } from "lucide-react";
import type {
  TravelExpenseCategory,
  TravelExpenseCreate,
  TravelPaymentCreate,
  TravelTripCreatePast,
} from "@/types/travel";

interface PastTravelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TravelTripCreatePast) => Promise<void>;
  departments: { id: string; name: string }[];
  employees: { id: string; first_name: string; last_name: string; employee_code?: string }[];
  projects: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}

export function PastTravelModal({
  isOpen,
  onClose,
  onSubmit,
  departments,
  employees,
  projects,
  clients,
}: PastTravelModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<TravelTripCreatePast>({
    title: "",
    business_purpose: "",
    origin: "",
    destination: "",
    actual_start_date: new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0] as string,
    actual_end_date: new Date().toISOString().split("T")[0] as string,
    actual_transport_mode: "flight",
    currency: "USD",
    act_travel_transport: 0,
    act_hotel_accommodation: 0,
    act_food_meals: 0,
    act_local_transport: 0,
    act_other_expenses: 0,
    payer_type: "company",
    company_paid_amount: 0,
    employee_paid_amount: 0,
    advance_paid: 0,
    advance_payment_reference: "",
    missing_info_explanation: "",
    notes: "",
    status: "completed",
    participating_employee_ids: [],
    initial_expenses: [],
    payments: [],
  });

  interface PastExpenseItem {
    id: string;
    category: "travel_transport" | "hotel_accommodation" | "food_meals" | "local_transport" | "other_expenses";
    name: string;
    amount: number;
    purpose: string;
    document_url: string;
  }

  const [expenseItems, setExpenseItems] = React.useState<PastExpenseItem[]>([
    {
      id: "past-exp-1",
      category: "travel_transport",
      name: "",
      amount: 0,
      purpose: "",
      document_url: "",
    },
  ]);

  const handleAddExpenseItem = () => {
    setExpenseItems((prev) => [
      ...prev,
      {
        id: `past-exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: "travel_transport",
        name: "",
        amount: 0,
        purpose: "",
        document_url: "",
      },
    ]);
  };

  const handleRemoveExpenseItem = (id: string) => {
    setExpenseItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleExpenseItemChange = (
    id: string,
    field: keyof PastExpenseItem,
    val: string | number
  ) => {
    setExpenseItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "number") {
      setForm((prev: TravelTripCreatePast) => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setForm((prev: TravelTripCreatePast) => ({ ...prev, [name]: value }));
    }
  };

  interface PaymentRowState {
    payer_type: "company" | "employee";
    payer_name: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    transaction_reference: string;
    notes: string;
  }

  const [paymentRows, setPaymentRows] = React.useState<PaymentRowState[]>([]);

  const handleAddPaymentRow = (defaultPayer: "company" | "employee" = "company") => {
    setPaymentRows((prev) => [
      ...prev,
      {
        payer_type: defaultPayer,
        payer_name: "",
        amount: 0,
        payment_method: defaultPayer === "company" ? "corporate_card" : "employee_personal_card",
        payment_date: form.actual_start_date || new Date().toISOString().slice(0, 10),
        transaction_reference: "",
        notes: "",
      },
    ]);
  };

  const handleRemovePaymentRow = (idx: number) => {
    setPaymentRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePaymentRowChange = (
    idx: number,
    field: keyof PaymentRowState,
    val: string | number
  ) => {
    setPaymentRows((prev) => {
      const copy = [...prev];
      if (copy[idx]) {
        copy[idx] = { ...copy[idx], [field]: val } as PaymentRowState;
      }
      return copy;
    });
  };

  const actualCategoryTotal = React.useMemo(() => {
    return expenseItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }, [expenseItems]);

  const totalCompanyPaidFromRows = paymentRows
    .filter((p) => p.payer_type === "company")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const totalEmployeePaidFromRows = paymentRows
    .filter((p) => p.payer_type === "employee")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const effectiveCompanyPaid =
    paymentRows.length > 0
      ? totalCompanyPaidFromRows
      : form.payer_type === "company"
      ? actualCategoryTotal
      : form.payer_type === "employee"
      ? 0
      : Number(form.company_paid_amount) || 0;

  const effectiveEmployeePaid =
    paymentRows.length > 0
      ? totalEmployeePaidFromRows
      : form.payer_type === "employee"
      ? actualCategoryTotal
      : form.payer_type === "company"
      ? 0
      : Number(form.employee_paid_amount) || 0;

  const handleMemberToggle = (empId: string) => {
    setForm((prev: TravelTripCreatePast) => {
      const exists = prev.participating_employee_ids?.includes(empId);
      const next = exists
        ? prev.participating_employee_ids?.filter((id) => id !== empId)
        : [...(prev.participating_employee_ids || []), empId];
      return { ...prev, participating_employee_ids: next };
    });
  };

  const handleSubmit = async (targetStatus?: "completed" | "ongoing" | "draft") => {
    if (!form.title.trim()) {
      setError("Please provide a trip title");
      return;
    }
    if (!form.business_purpose.trim()) {
      setError("Please specify business purpose of this completed travel");
      return;
    }
    if (!form.origin.trim() || !form.destination.trim()) {
      setError("Actual origin and destination are required");
      return;
    }
    if (form.actual_end_date < form.actual_start_date) {
      setError("Actual return date cannot be before departure date");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let actTransport = 0;
      let actHotel = 0;
      let actFood = 0;
      let actLocal = 0;
      let actOther = 0;

      const initialExpenses: TravelExpenseCreate[] = [];

      expenseItems.forEach((item) => {
        const amt = Number(item.amount) || 0;
        if (item.category === "hotel_accommodation") actHotel += amt;
        else if (item.category === "food_meals") actFood += amt;
        else if (item.category === "local_transport") actLocal += amt;
        else if (item.category === "travel_transport") actTransport += amt;
        else actOther += amt;

        if (item.name.trim() && amt > 0) {
          const categoryMap: Record<string, TravelExpenseCategory> = {
            travel_transport: "flight",
            hotel_accommodation: "accommodation",
            food_meals: "meals",
            local_transport: "local_transport",
            other_expenses: "miscellaneous",
          };

          initialExpenses.push({
            description: item.purpose.trim()
              ? `${item.name.trim()} - ${item.purpose.trim()}`
              : item.name.trim(),
            category: categoryMap[item.category] || "miscellaneous",
            amount: amt,
            currency: form.currency || "USD",
            expense_date: form.actual_start_date || new Date().toISOString().slice(0, 10),
            receipt_url: item.document_url.trim() || undefined,
            receipt_file_name: item.name.trim() || undefined,
            is_reimbursable: true,
            payment_method: form.payer_type === "company" ? "company_card" : "employee_paid",
            submit_immediately: true,
          });
        }
      });

      const serializedPayments: TravelPaymentCreate[] = paymentRows
        .filter((r) => r.amount > 0)
        .map((r) => ({
          payer_type: r.payer_type,
          payer_name: r.payer_name.trim() || undefined,
          amount: r.amount,
          currency: form.currency || "USD",
          payment_method: r.payment_method,
          payment_date: r.payment_date || form.actual_start_date,
          transaction_reference: r.transaction_reference.trim() || undefined,
          notes: r.notes.trim() || undefined,
        }));

      await onSubmit({
        ...form,
        act_travel_transport: actTransport,
        act_hotel_accommodation: actHotel,
        act_food_meals: actFood,
        act_local_transport: actLocal,
        act_other_expenses: actOther,
        estimated_budget: actualCategoryTotal,
        company_paid_amount: effectiveCompanyPaid,
        employee_paid_amount: effectiveEmployeePaid,
        payments: serializedPayments,
        status: targetStatus || form.status || "completed",
        initial_expenses: initialExpenses,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register past travel";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register Past Travel (Post-Registration)"
      description="Record travel and incurred expenses that have already taken place without prior travel authorization."
      size="xl"
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-purple-50/80 border border-purple-200 rounded-lg p-3 text-xs text-purple-900 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Post-Registration Compliance Notice:</span>
            <p className="text-purple-700 text-[11px] mt-0.5">
              This record will be explicitly tagged as <strong>Post-Registered / Past Travel</strong>.
              Prior travel approval is bypassed. However, expense claims, receipts, and financial settlements
              must still be reviewed and approved according to company finance policy.
            </p>
          </div>
        </div>

        {/* Basic Details */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="title" className="text-xs font-semibold text-slate-700">
              Trip Title <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="title"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Emergency Site Visit - Customer Infrastructure Audit"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="business_purpose" className="text-xs font-semibold text-slate-700">
              Business Purpose <span className="text-rose-500">*</span>
            </Label>
            <textarea
              id="business_purpose"
              name="business_purpose"
              value={form.business_purpose}
              onChange={handleChange}
              rows={2}
              placeholder="Describe the business circumstances and why travel was conducted..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="origin" className="text-xs font-semibold text-slate-700">
                Actual Origin <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="origin"
                name="origin"
                value={form.origin}
                onChange={handleChange}
                placeholder="e.g. Austin, TX"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="destination" className="text-xs font-semibold text-slate-700">
                Actual Destination <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="destination"
                name="destination"
                value={form.destination}
                onChange={handleChange}
                placeholder="e.g. Dallas Datacenter, TX"
                className="mt-1"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="actual_start_date" className="text-xs font-semibold text-slate-700">
                Actual Departure Date <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="actual_start_date"
                type="date"
                name="actual_start_date"
                value={form.actual_start_date}
                onChange={handleChange}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="actual_end_date" className="text-xs font-semibold text-slate-700">
                Actual Return Date <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="actual_end_date"
                type="date"
                name="actual_end_date"
                value={form.actual_end_date}
                onChange={handleChange}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="actual_transport_mode" className="text-xs font-semibold text-slate-700">
                Transport Mode Used
              </Label>
              <select
                id="actual_transport_mode"
                name="actual_transport_mode"
                value={form.actual_transport_mode}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
              >
                <option value="flight">Flight</option>
                <option value="train">Train</option>
                <option value="bus">Bus / Coach</option>
                <option value="car">Rental / Personal Car</option>
                <option value="local_transport">Taxi / Rideshare</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label htmlFor="status" className="text-xs font-semibold text-slate-700">
                Trip Status
              </Label>
              <select
                id="status"
                name="status"
                value={form.status}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800 font-medium"
              >
                <option value="completed">Completed (Trip Finished)</option>
                <option value="ongoing">Ongoing (Still in Progress)</option>
                <option value="draft">Draft (Incomplete Information)</option>
              </select>
            </div>
          </div>
        </div>

        {/* References & Department */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <Label htmlFor="department_id" className="text-xs font-semibold text-slate-700">
              Department
            </Label>
            <select
              id="department_id"
              name="department_id"
              value={form.department_id || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="">Select Department...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="client_id" className="text-xs font-semibold text-slate-700">
              Client Reference
            </Label>
            <select
              id="client_id"
              name="client_id"
              value={form.client_id || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="">None / Internal</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="project_id" className="text-xs font-semibold text-slate-700">
              Project Reference
            </Label>
            <select
              id="project_id"
              name="project_id"
              value={form.project_id || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="">None / General</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Actual Travel Expenses (Dynamic Line Items with Dropdowns) */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-semibold text-slate-800">
                Actual Incurred Expenses
              </Label>
              <p className="text-[11px] text-slate-500">
                Add trip expenses dynamically with category dropdown, custom expense name, purpose, amount, and receipt/document link.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Total Actual Cost</span>
                <span className="text-sm font-bold text-purple-700">
                  {form.currency || "USD"} {actualCategoryTotal.toFixed(2)}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddExpenseItem}
                className="h-8 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Expense</span>
              </Button>
            </div>
          </div>

          {expenseItems.length === 0 ? (
            <div className="p-5 text-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/60">
              <p className="text-xs text-slate-500 font-medium">No expenses added yet.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Click &ldquo;+ Add Expense&rdquo; to add customized expense items for this trip.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddExpenseItem}
                className="mt-2.5 text-xs gap-1 border-purple-200 text-purple-700 hover:bg-purple-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add First Expense</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {expenseItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-50/90 rounded-lg border border-slate-200 shadow-2xs space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                      <span className="h-4 w-4 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      Expense Item #{idx + 1}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveExpenseItem(item.id)}
                      className="h-6 w-6 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Remove expense"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {/* Category Dropdown */}
                    <div className="sm:col-span-3">
                      <Label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                        Category <span className="text-rose-500">*</span>
                      </Label>
                      <select
                        value={item.category}
                        onChange={(e) =>
                          handleExpenseItemChange(
                            item.id,
                            "category",
                            e.target.value as PastExpenseItem["category"]
                          )
                        }
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white text-slate-800 h-8 font-medium"
                      >
                        <option value="travel_transport">Travel / Transport</option>
                        <option value="hotel_accommodation">Hotel / Lodging</option>
                        <option value="food_meals">Food / Meals</option>
                        <option value="local_transport">Local Transport</option>
                        <option value="other_expenses">Other Expenses</option>
                      </select>
                    </div>

                    {/* Expense Name */}
                    <div className="sm:col-span-4">
                      <Label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                        Expense Name <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        value={item.name}
                        onChange={(e) => handleExpenseItemChange(item.id, "name", e.target.value)}
                        placeholder="e.g. Return Flight, Client Dinner, Hotel Booking"
                        className="text-xs bg-white h-8"
                        required
                      />
                    </div>

                    {/* Amount */}
                    <div className="sm:col-span-2">
                      <Label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                        Amount ({form.currency || "USD"}) <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.amount || ""}
                        onChange={(e) =>
                          handleExpenseItemChange(item.id, "amount", parseFloat(e.target.value) || 0)
                        }
                        placeholder="0.00"
                        className="text-xs bg-white h-8 font-semibold text-slate-900"
                        required
                      />
                    </div>

                    {/* Attach Document / URL */}
                    <div className="sm:col-span-3">
                      <Label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                        Attach Document / URL
                      </Label>
                      <Input
                        value={item.document_url}
                        onChange={(e) =>
                          handleExpenseItemChange(item.id, "document_url", e.target.value)
                        }
                        placeholder="https://... receipt / bill link"
                        className="text-xs bg-white h-8"
                      />
                    </div>

                    {/* Purpose */}
                    <div className="sm:col-span-12">
                      <Label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                        Purpose
                      </Label>
                      <Input
                        value={item.purpose}
                        onChange={(e) => handleExpenseItemChange(item.id, "purpose", e.target.value)}
                        placeholder="Purpose of this expense (e.g. Client onsite meeting, Hotel stay for 3 nights)"
                        className="text-xs bg-white h-8"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payer Details & Payment Entries */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-semibold text-slate-800">
                Payer Details & Payment Breakdown
              </Label>
              <p className="text-[11px] text-slate-500">
                Specify who paid for the trip expenses (company-paid, employee-paid, or split).
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddPaymentRow("company")}
                className="h-7 text-[11px] gap-1"
              >
                <Plus className="h-3 w-3" />
                <span>+ Company Payment</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddPaymentRow("employee")}
                className="h-7 text-[11px] gap-1"
              >
                <Plus className="h-3 w-3" />
                <span>+ Employee Payment</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="payer_type" className="text-xs font-semibold text-slate-700">
                Payment Type
              </Label>
              <select
                id="payer_type"
                name="payer_type"
                value={form.payer_type}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800 font-medium"
              >
                <option value="company">Company Paid (100% corporate)</option>
                <option value="employee">Employee Paid (100% out-of-pocket)</option>
                <option value="split">Split Payment (Part corporate, part personal)</option>
              </select>
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
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
                <option value="SGD">SGD (S$)</option>
              </select>
            </div>

            <div>
              <Label htmlFor="advance_paid" className="text-xs font-semibold text-slate-700">
                Prior Cash Advance Received ($)
              </Label>
              <Input
                id="advance_paid"
                type="number"
                step="0.01"
                min="0"
                name="advance_paid"
                value={form.advance_paid || ""}
                onChange={handleChange}
                placeholder="0.00"
                className="mt-1 text-xs"
              />
            </div>
          </div>

          {/* Payment entries list if any added */}
          {paymentRows.length > 0 && (
            <div className="space-y-2 border border-slate-200 rounded-lg p-2.5 bg-slate-50">
              <span className="text-[11px] font-semibold text-slate-700 block">
                Recorded Payment Entries ({paymentRows.length})
              </span>
              {paymentRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2 bg-white rounded border border-slate-200 items-center text-xs"
                >
                  <div className="sm:col-span-2">
                    <select
                      value={row.payer_type}
                      onChange={(e) =>
                        handlePaymentRowChange(idx, "payer_type", e.target.value as "company" | "employee")
                      }
                      className="w-full rounded border border-slate-300 p-1.5 text-xs font-medium"
                    >
                      <option value="company">Company</option>
                      <option value="employee">Employee</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <Input
                      placeholder="Payer name/entity"
                      value={row.payer_name}
                      onChange={(e) => handlePaymentRowChange(idx, "payer_name", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Amount"
                      value={row.amount || ""}
                      onChange={(e) =>
                        handlePaymentRowChange(idx, "amount", parseFloat(e.target.value) || 0)
                      }
                      className="h-8 text-xs font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <select
                      value={row.payment_method}
                      onChange={(e) => handlePaymentRowChange(idx, "payment_method", e.target.value)}
                      className="w-full rounded border border-slate-300 p-1.5 text-xs"
                    >
                      <option value="corporate_card">Corporate Card</option>
                      <option value="company_bank_transfer">Bank Transfer</option>
                      <option value="employee_personal_card">Personal Card</option>
                      <option value="cash">Cash</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <Input
                      placeholder="Ref # (e.g. CC-9081)"
                      value={row.transaction_reference}
                      onChange={(e) =>
                        handlePaymentRowChange(idx, "transaction_reference", e.target.value)
                      }
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="sm:col-span-1 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemovePaymentRow(idx)}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cost Distinction Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Total Trip Costs</span>
              <span className="font-bold text-slate-900 text-sm">
                {form.currency || "USD"} {actualCategoryTotal.toFixed(2)}
              </span>
            </div>

            <div>
              <span className="text-blue-600 block text-[10px] uppercase font-semibold">Company-Paid Costs</span>
              <span className="font-bold text-blue-700 text-sm">
                {form.currency || "USD"} {effectiveCompanyPaid.toFixed(2)}
              </span>
            </div>

            <div>
              <span className="text-amber-700 block text-[10px] uppercase font-semibold">Employee-Paid Costs</span>
              <span className="font-bold text-amber-800 text-sm">
                {form.currency || "USD"} {effectiveEmployeePaid.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Reimbursement Policy Notice:</span>
              <p className="mt-0.5">
                Employee-paid costs are distinguished and tracked separately. They are{" "}
                <strong>not automatically marked as reimbursed</strong>. Settlement and expense verification
                must be completed for disbursement.
              </p>
            </div>
          </div>
        </div>

        {/* Participating Members Group */}
        <div className="pt-2 border-t border-slate-100">
          <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>Employees Who Travelled (Travel Party)</span>
            <span className="text-[10px] text-slate-400 font-normal">
              {form.participating_employee_ids?.length || 0} selected
            </span>
          </Label>
          <div className="mt-1.5 p-2 border border-slate-200 rounded-lg max-h-24 overflow-y-auto space-y-1 bg-slate-50/50">
            {employees.map((emp) => {
              const isChecked = form.participating_employee_ids?.includes(emp.id);
              return (
                <label
                  key={emp.id}
                  className="flex items-center gap-2 p-1 rounded hover:bg-white cursor-pointer text-xs text-slate-700 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleMemberToggle(emp.id)}
                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span>
                    {emp.first_name} {emp.last_name}{" "}
                    {emp.employee_code && (
                      <span className="text-[10px] text-slate-400">({emp.employee_code})</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>



        {/* Missing Info Notes & Explanations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <Label htmlFor="missing_info_explanation" className="text-xs font-semibold text-slate-700">
              Explanation for Any Missing Invoices / Receipts
            </Label>
            <textarea
              id="missing_info_explanation"
              name="missing_info_explanation"
              value={form.missing_info_explanation}
              onChange={handleChange}
              rows={2}
              placeholder="e.g. Local taxi did not provide printed receipt, or ticket booked via direct client..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
            />
          </div>
          <div>
            <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
              Post-Travel Settlement Notes
            </Label>
            <textarea
              id="notes"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Details for finance review and final reimbursement..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse sm:flex-row justify-between gap-2 pt-4 border-t border-slate-100">
        <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit("draft")}
            disabled={loading}
          >
            Save Incomplete Draft
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => handleSubmit("completed")}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Complete Registration</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
