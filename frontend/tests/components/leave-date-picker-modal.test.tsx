import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeaveDatePickerModal } from "@/components/leave/leave-date-picker-modal";
import type { Holiday } from "@/types/leave";

const mockHolidays: Holiday[] = [
  {
    id: "hol-1",
    organization_id: "org-1",
    name: "New Year's Day",
    holiday_date: "2026-01-01",
    is_optional: false,
    description: "Office Closed",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "hol-2",
    organization_id: "org-1",
    name: "Diwali",
    holiday_date: "2026-11-08",
    is_optional: false,
    description: "Festival of Lights",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("LeaveDatePickerModal Component", () => {
  it("renders when isOpen is true and displays company holidays", () => {
    render(
      <LeaveDatePickerModal
        isOpen={true}
        onClose={vi.fn()}
        startDate="2026-01-05"
        endDate="2026-01-08"
        onApplyDates={vi.fn()}
        holidays={mockHolidays}
      />
    );

    expect(screen.getByRole("heading", { name: "Select Leave Dates" })).toBeInTheDocument();
    expect(screen.getByText(/company holidays are prominently marked/i)).toBeInTheDocument();
    // New Year's Day should be rendered in the January calendar
    expect(screen.getAllByText("New Year's Day").length).toBeGreaterThan(0);
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <LeaveDatePickerModal
        isOpen={false}
        onClose={vi.fn()}
        startDate=""
        endDate=""
        onApplyDates={vi.fn()}
        holidays={mockHolidays}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("selects dates and calls onApplyDates when Apply Dates is clicked", async () => {
    const user = userEvent.setup();
    const handleApply = vi.fn();
    const handleClose = vi.fn();

    render(
      <LeaveDatePickerModal
        isOpen={true}
        onClose={handleClose}
        startDate="2026-01-10"
        endDate="2026-01-12"
        onApplyDates={handleApply}
        holidays={mockHolidays}
      />
    );

    const applyBtn = screen.getByRole("button", { name: /apply dates/i });
    expect(applyBtn).toBeEnabled();

    await user.click(applyBtn);

    expect(handleApply).toHaveBeenCalledWith("2026-01-10", "2026-01-12");
    expect(handleClose).toHaveBeenCalled();
  });

  it("shows warning/notice when selected dates include a company holiday", () => {
    render(
      <LeaveDatePickerModal
        isOpen={true}
        onClose={vi.fn()}
        startDate="2026-01-01"
        endDate="2026-01-03"
        onApplyDates={vi.fn()}
        holidays={mockHolidays}
      />
    );

    expect(
      screen.getByText(/your selected leave range includes 1 official company holiday/i)
    ).toBeInTheDocument();
  });

  it("allows clearing selected dates", async () => {
    const user = userEvent.setup();

    render(
      <LeaveDatePickerModal
        isOpen={true}
        onClose={vi.fn()}
        startDate="2026-01-10"
        endDate="2026-01-12"
        onApplyDates={vi.fn()}
        holidays={mockHolidays}
      />
    );

    const resetBtn = screen.getByRole("button", { name: /reset/i });
    await user.click(resetBtn);

    expect(screen.getByText("No dates chosen yet")).toBeInTheDocument();
  });

  it("handles date clicks in November 2026 without duplicate keys or errors", async () => {
    const user = userEvent.setup();
    const handleApply = vi.fn();

    render(
      <LeaveDatePickerModal
        isOpen={true}
        onClose={vi.fn()}
        startDate="2026-11-11"
        endDate="2026-11-11"
        onApplyDates={handleApply}
        holidays={mockHolidays}
      />
    );

    // First click: pick start date (11)
    await user.click(screen.getByText("11"));
    // Second click: pick end date (15)
    await user.click(screen.getByText("15"));

    const applyBtn = screen.getByRole("button", { name: /apply dates/i });
    await user.click(applyBtn);

    expect(handleApply).toHaveBeenCalledWith("2026-11-11", "2026-11-15");
  });
});



