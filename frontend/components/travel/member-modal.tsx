"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import type { TravelMemberCreate } from "@/types/travel";

interface MemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TravelMemberCreate) => Promise<void>;
  employees: { id: string; first_name: string; last_name: string; employee_code?: string }[];
  existingMemberEmployeeIds: string[];
  defaultDepartureDate?: string | null;
  defaultReturnDate?: string | null;
}

export function MemberModal({
  isOpen,
  onClose,
  onSubmit,
  employees,
  existingMemberEmployeeIds,
  defaultDepartureDate,
  defaultReturnDate,
}: MemberModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const availableEmployees = React.useMemo(() => {
    return employees.filter((e) => !existingMemberEmployeeIds.includes(e.id));
  }, [employees, existingMemberEmployeeIds]);

  const [form, setForm] = React.useState<TravelMemberCreate>({
    employee_id: availableEmployees[0]?.id || "",
    trip_role: "participant",
    participation_status: "confirmed",
    individual_departure_date: defaultDepartureDate ? defaultDepartureDate.split("T")[0] : undefined,
    individual_return_date: defaultReturnDate ? defaultReturnDate.split("T")[0] : undefined,
    notes: "",
  });

  React.useEffect(() => {
    if (availableEmployees.length > 0 && (!form.employee_id || !availableEmployees.find((e) => e.id === form.employee_id))) {
      setForm((prev: TravelMemberCreate) => ({ ...prev, employee_id: availableEmployees[0]?.id || "" }));
    }
  }, [availableEmployees, form.employee_id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev: TravelMemberCreate) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_id) {
      setError("Please select an employee");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(form);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add member";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Trip Participant"
      description="Register an additional team member to travel on this group itinerary."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <Label htmlFor="employee_id" className="text-xs font-semibold text-slate-700">
            Select Employee <span className="text-rose-500">*</span>
          </Label>
          {availableEmployees.length === 0 ? (
            <p className="mt-1 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
              All employees in the organization are already registered members of this trip.
            </p>
          ) : (
            <select
              id="employee_id"
              name="employee_id"
              value={form.employee_id}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
              required
            >
              {availableEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}{" "}
                  {emp.employee_code ? `(${emp.employee_code})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="trip_role" className="text-xs font-semibold text-slate-700">
              Trip Role
            </Label>
            <select
              id="trip_role"
              name="trip_role"
              value={form.trip_role}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="participant">Participant</option>
              <option value="lead">Trip Lead / Coordinator</option>
              <option value="speaker">Speaker / Presenter</option>
              <option value="support">Technical Support</option>
            </select>
          </div>

          <div>
            <Label htmlFor="participation_status" className="text-xs font-semibold text-slate-700">
              Participation Status
            </Label>
            <select
              id="participation_status"
              name="participation_status"
              value={form.participation_status}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="confirmed">Confirmed</option>
              <option value="invited">Invited / Pending</option>
              <option value="declined">Declined</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="individual_departure_date" className="text-xs font-semibold text-slate-700">
              Individual Departure (if different)
            </Label>
            <Input
              id="individual_departure_date"
              type="date"
              name="individual_departure_date"
              value={form.individual_departure_date || ""}
              onChange={handleChange}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="individual_return_date" className="text-xs font-semibold text-slate-700">
              Individual Return (if different)
            </Label>
            <Input
              id="individual_return_date"
              type="date"
              name="individual_return_date"
              value={form.individual_return_date || ""}
              onChange={handleChange}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
            Notes
          </Label>
          <textarea
            id="notes"
            name="notes"
            value={form.notes || ""}
            onChange={handleChange}
            rows={2}
            placeholder="Special assignments or travel arrangements..."
            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            type="submit"
            disabled={loading || availableEmployees.length === 0}
            className="bg-primary-600 hover:bg-primary-700 text-white"
          >
            {loading ? "Adding..." : "Add Participant"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
