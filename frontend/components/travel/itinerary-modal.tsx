"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import type { TravelItineraryCreate } from "@/types/travel";

interface ItineraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TravelItineraryCreate) => Promise<void>;
  members: { id: string; employee_id: string; employee_name?: string | null }[];
}

export function ItineraryModal({ isOpen, onClose, onSubmit, members }: ItineraryModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<TravelItineraryCreate>({
    type: "flight",
    title: "",
    departure_location: "",
    arrival_location: "",
    departure_time: undefined,
    arrival_time: undefined,
    booking_reference: "",
    provider_name: "",
    booking_status: "confirmed",
    estimated_cost: 0,
    notes: "",
    attachment_url: "",
    member_id: undefined,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "number") {
      setForm((prev: TravelItineraryCreate) => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setForm((prev: TravelItineraryCreate) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Please provide a booking title");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit({
        ...form,
        member_id: form.member_id || undefined,
        departure_time: form.departure_time || undefined,
        arrival_time: form.arrival_time || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add booking";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Itinerary / Booking Record"
      description="Record flight, train, hotel or scheduled client activity details for the travel roster."
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
            <Label htmlFor="type" className="text-xs font-semibold text-slate-700">
              Booking Type
            </Label>
            <select
              id="type"
              name="type"
              value={form.type}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="flight">Flight (Air)</option>
              <option value="train">Train / Rail</option>
              <option value="bus">Bus / Coach</option>
              <option value="car_rental">Car Rental / Chauffeur</option>
              <option value="hotel">Hotel / Accommodation</option>
              <option value="meeting">Client Meeting / Conference</option>
              <option value="activity">Scheduled Activity</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <Label htmlFor="member_id" className="text-xs font-semibold text-slate-700">
              Assigned Member (Optional)
            </Label>
            <select
              id="member_id"
              name="member_id"
              value={form.member_id || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="">All Travelling Members (Shared)</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.employee_name || "Member"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="title" className="text-xs font-semibold text-slate-700">
            Booking / Activity Title <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="title"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="e.g. SFO to LHR United Flight UA901 or Hilton London Tower Bridge"
            className="mt-1"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="provider_name" className="text-xs font-semibold text-slate-700">
              Carrier / Hotel Provider Name
            </Label>
            <Input
              id="provider_name"
              name="provider_name"
              value={form.provider_name || ""}
              onChange={handleChange}
              placeholder="e.g. United Airlines / Marriott International"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="booking_reference" className="text-xs font-semibold text-slate-700">
              Booking Ref / PNR / Confirmation #
            </Label>
            <Input
              id="booking_reference"
              name="booking_reference"
              value={form.booking_reference || ""}
              onChange={handleChange}
              placeholder="e.g. 6Q9W2K"
              className="mt-1 font-mono uppercase"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="departure_location" className="text-xs font-semibold text-slate-700">
              Departure Location / Check-In
            </Label>
            <Input
              id="departure_location"
              name="departure_location"
              value={form.departure_location || ""}
              onChange={handleChange}
              placeholder="e.g. SFO Terminal 3"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="arrival_location" className="text-xs font-semibold text-slate-700">
              Arrival Location / Destination
            </Label>
            <Input
              id="arrival_location"
              name="arrival_location"
              value={form.arrival_location || ""}
              onChange={handleChange}
              placeholder="e.g. London Heathrow (LHR) Terminal 2"
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="estimated_cost" className="text-xs font-semibold text-slate-700">
              Estimated Cost ($)
            </Label>
            <Input
              id="estimated_cost"
              type="number"
              step="0.01"
              min="0"
              name="estimated_cost"
              value={form.estimated_cost || ""}
              onChange={handleChange}
              placeholder="0.00"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="booking_status" className="text-xs font-semibold text-slate-700">
              Booking Status
            </Label>
            <select
              id="booking_status"
              name="booking_status"
              value={form.booking_status}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs bg-white text-slate-800"
            >
              <option value="confirmed">Confirmed</option>
              <option value="reserved">Reserved (Hold)</option>
              <option value="planned">Planned (Not Booked)</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <Label htmlFor="attachment_url" className="text-xs font-semibold text-slate-700">
              Ticket / Voucher URL
            </Label>
            <Input
              id="attachment_url"
              name="attachment_url"
              value={form.attachment_url || ""}
              onChange={handleChange}
              placeholder="https://..."
              className="mt-1 text-xs"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
            Notes / Seat / Room Specifications
          </Label>
          <textarea
            id="notes"
            name="notes"
            value={form.notes || ""}
            onChange={handleChange}
            rows={2}
            placeholder="Seat 14A, window, early check-in requested..."
            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={loading} className="bg-primary-600 hover:bg-primary-700 text-white">
            {loading ? "Adding..." : "Add to Itinerary"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
