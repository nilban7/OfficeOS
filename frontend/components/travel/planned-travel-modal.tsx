"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plane, Send, Save, AlertCircle, Plus, Trash2 } from "lucide-react";
import type { TravelExpenseCreate, TravelTripCreatePlanned } from "@/types/travel";

interface PlannedTravelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TravelTripCreatePlanned) => Promise<void>;
  departments: { id: string; name: string }[];
  employees: { id: string; first_name: string; last_name: string; employee_code?: string }[];
  projects: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}

export function PlannedTravelModal({
  isOpen,
  onClose,
  onSubmit,
  departments,
  employees,
  projects,
  clients,
}: PlannedTravelModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<TravelTripCreatePlanned>({
    title: "",
    business_purpose: "",
    origin: "",
    destination: "",
    planned_start_date: new Date().toISOString().split("T")[0] as string,
    planned_end_date: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0] as string,
    preferred_transport_mode: "flight",
    estimated_budget: 0,
    est_travel_transport: 0,
    est_hotel_accommodation: 0,
    est_food_meals: 0,
    est_local_transport: 0,
    est_other_expenses: 0,
    currency: "USD",
    advance_requested: 0,
    accommodation_notes: "",
    notes: "",
    participating_employee_ids: [],
    submit_immediately: true,
  });

  interface PlannedExpenseItem {
    id: string;
    category: "travel_transport" | "hotel_accommodation" | "food_meals" | "local_transport" | "other_expenses";
    name: string;
    amount: number;
    purpose: string;
    document_url: string;
  }

  const [expenseItems, setExpenseItems] = React.useState<PlannedExpenseItem[]>([
    {
      id: "exp-1",
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
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    field: keyof PlannedExpenseItem,
    val: string | number
  ) => {
    setExpenseItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const currentEstTotal = React.useMemo(() => {
    return expenseItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }, [expenseItems]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "number") {
      setForm((prev: TravelTripCreatePlanned) => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setForm((prev: TravelTripCreatePlanned) => ({ ...prev, [name]: value }));
    }
  };

  const handleMemberToggle = (empId: string) => {
    setForm((prev: TravelTripCreatePlanned) => {
      const exists = prev.participating_employee_ids?.includes(empId);
      const next = exists
        ? prev.participating_employee_ids?.filter((id) => id !== empId)
        : [...(prev.participating_employee_ids || []), empId];
      return { ...prev, participating_employee_ids: next };
    });
  };

  const handleSubmit = async (submitImmediately: boolean) => {
    if (!form.title.trim()) {
      setError("Please provide a trip title");
      return;
    }
    if (!form.business_purpose.trim()) {
      setError("Please state the business purpose for this travel");
      return;
    }
    if (!form.origin.trim() || !form.destination.trim()) {
      setError("Origin and destination are required");
      return;
    }
    if (form.planned_end_date < form.planned_start_date) {
      setError("Planned return date cannot be before departure date");
      return;
    }

    let estTransport = 0;
    let estHotel = 0;
    let estFood = 0;
    let estLocal = 0;
    let estOther = 0;

    const initialExpenses: TravelExpenseCreate[] = [];

    expenseItems.forEach((item) => {
      const amt = Number(item.amount) || 0;
      if (item.category === "hotel_accommodation") estHotel += amt;
      else if (item.category === "food_meals") estFood += amt;
      else if (item.category === "local_transport") estLocal += amt;
      else if (item.category === "travel_transport") estTransport += amt;
      else estOther += amt;

      if (item.name.trim() || amt > 0) {
        initialExpenses.push({
          category: item.category,
          description: item.purpose ? `${item.name.trim()} (${item.purpose.trim()})` : (item.name.trim() || "Trip Expense"),
          amount: amt,
          currency: form.currency || "USD",
          receipt_url: item.document_url.trim() || undefined,
          receipt_file_name: item.name.trim() || undefined,
          expense_date: form.planned_start_date,
          payment_method: "corporate_card",
          is_reimbursable: false,
        });
      }
    });

    const estimatedTotal = estTransport + estHotel + estFood + estLocal + estOther;

    try {
      setLoading(true);
      setError(null);
      await onSubmit({
        ...form,
        est_travel_transport: estTransport,
        est_hotel_accommodation: estHotel,
        est_food_meals: estFood,
        est_local_transport: estLocal,
        est_other_expenses: estOther,
        estimated_budget: estimatedTotal > 0 ? estimatedTotal : form.estimated_budget,
        initial_expenses: initialExpenses,
        submit_immediately: submitImmediately,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create planned travel request";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Planned Travel (Pre-Registration)"
      description="Submit a travel plan and estimated budget for manager/HR authorization prior to departure."
      size="xl"
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 flex items-start gap-2.5">
          <Plane className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Pre-Travel Authorization Workflow:</span>
            <p className="text-blue-700 text-[11px] mt-0.5">
              Draft → Pending Approval → Approved → Booked → Ongoing → Completed → Expense Review → Settlement.
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
              placeholder="e.g. Q4 Client Onsite Discovery & Executive Briefing"
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
              placeholder="Explain the business objectives, client deliverables, and key outcomes expected from this trip..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="origin" className="text-xs font-semibold text-slate-700">
                Origin City / Airport <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="origin"
                name="origin"
                value={form.origin}
                onChange={handleChange}
                placeholder="e.g. San Francisco (SFO)"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="destination" className="text-xs font-semibold text-slate-700">
                Destination City / Country <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="destination"
                name="destination"
                value={form.destination}
                onChange={handleChange}
                placeholder="e.g. London (LHR), United Kingdom"
                className="mt-1"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="planned_start_date" className="text-xs font-semibold text-slate-700">
                Planned Departure Date <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="planned_start_date"
                type="date"
                name="planned_start_date"
                value={form.planned_start_date}
                onChange={handleChange}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="planned_end_date" className="text-xs font-semibold text-slate-700">
                Planned Return Date <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="planned_end_date"
                type="date"
                name="planned_end_date"
                value={form.planned_end_date}
                onChange={handleChange}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="preferred_transport_mode" className="text-xs font-semibold text-slate-700">
                Preferred Transport Mode
              </Label>
              <select
                id="preferred_transport_mode"
                name="preferred_transport_mode"
                value={form.preferred_transport_mode}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
              >
                <option value="flight">Flight</option>
                <option value="train">Train</option>
                <option value="bus">Bus / Coach</option>
                <option value="car">Rental Car / Company Car</option>
                <option value="local_transport">Local Transport / Taxi</option>
                <option value="other">Other</option>
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
              <option value="">None / Internal Trip</option>
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

        {/* Pre-Travel Estimated Expenses */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <Label className="text-xs font-semibold text-slate-800">
                Pre-Travel Estimated Expenses
              </Label>
              <p className="text-[11px] text-slate-500">
                Add trip expenses dynamically with category dropdown, custom expense name, purpose, amount, and document/quote link.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Estimated Total</span>
                <span className="text-sm font-bold text-primary-700">
                  {form.currency || "USD"} {currentEstTotal.toFixed(2)}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddExpenseItem}
                className="h-8 text-xs gap-1 border-primary-300 text-primary-700 hover:bg-primary-50"
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
                className="mt-2.5 text-xs gap-1 border-primary-200 text-primary-700 hover:bg-primary-50"
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
                      <span className="h-4 w-4 rounded-full bg-primary-100 text-primary-800 text-[10px] font-bold flex items-center justify-center">
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
                            e.target.value as PlannedExpenseItem["category"]
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
                        placeholder="https://... quotation/ticket link"
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
                        placeholder="Purpose of this expense (e.g. Onsite client presentation, 3 nights hotel accommodation)"
                        className="text-xs bg-white h-8"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <Label htmlFor="advance_requested" className="text-xs font-semibold text-slate-700">
                Cash Advance Requested ({form.currency || "USD"})
              </Label>
              <Input
                id="advance_requested"
                type="number"
                step="0.01"
                min="0"
                name="advance_requested"
                value={form.advance_requested || ""}
                onChange={handleChange}
                placeholder="0.00"
                className="mt-1 text-xs"
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
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
                <option value="SGD">SGD (S$)</option>
              </select>
            </div>
          </div>

        {/* Participating Members Group */}
        <div className="pt-2 border-t border-slate-100">
          <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>Co-Travelling Employees (Employee Group)</span>
            <span className="text-[10px] text-slate-400 font-normal">
              {form.participating_employee_ids?.length || 0} selected
            </span>
          </Label>
          <div className="mt-1.5 p-2 border border-slate-200 rounded-lg max-h-28 overflow-y-auto space-y-1 bg-slate-50/50">
            {employees.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No employees found in organization.</p>
            ) : (
              employees.map((emp) => {
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
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>
                      {emp.first_name} {emp.last_name}{" "}
                      {emp.employee_code && (
                        <span className="text-[10px] text-slate-400">({emp.employee_code})</span>
                      )}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Accommodation & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <Label htmlFor="accommodation_notes" className="text-xs font-semibold text-slate-700">
              Accommodation Requirements
            </Label>
            <textarea
              id="accommodation_notes"
              name="accommodation_notes"
              value={form.accommodation_notes}
              onChange={handleChange}
              rows={2}
              placeholder="e.g. Standard single room near conference center, 3 nights..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
            />
          </div>
          <div>
            <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
              Additional Notes / Logistics
            </Label>
            <textarea
              id="notes"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Any special visa, dietary or transit requirements..."
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
            onClick={() => handleSubmit(false)}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save as Draft</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => handleSubmit(true)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Submit for Approval</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
