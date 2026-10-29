import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HolidayCalendar } from "@/components/leave/holiday-calendar";
import type { Holiday } from "@/types/leave";
import type { BranchResponse } from "@/types/organization";

describe("HolidayCalendar Component", () => {
  const mockBranches: BranchResponse[] = [
    {
      id: "branch-1",
      organization_id: "org-1",
      name: "Main HQ",
      code: "HQ",
      address: "100 Main St",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockHolidays: Holiday[] = [
    {
      id: "hol-1",
      organization_id: "org-1",
      name: "1st JAN",
      holiday_date: "2026-01-01",
      branch_id: null,
      description: "New Year Celebration Day",
      is_optional: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "hol-2",
      organization_id: "org-1",
      name: "Spring Festival",
      holiday_date: "2026-03-21",
      branch_id: "branch-1",
      branch: {
        id: "branch-1",
        name: "Main HQ",
        code: "HQ",
      },
      description: "Optional branch cultural celebration",
      is_optional: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  it("renders the calendar grid with weekday headers and month navigation", () => {
    render(
      <HolidayCalendar
        holidays={mockHolidays}
        branches={mockBranches}
        canManageHolidays={true}
        selectedYear="2026"
        onYearChange={vi.fn()}
        onSelectDate={vi.fn()}
        onSelectHoliday={vi.fn()}
      />
    );

    // Weekdays
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();

    // Manager mode badge
    expect(screen.getByText(/Manager Mode/i)).toBeInTheDocument();
  });

  it("allows owner/manager to click on a date to trigger onSelectDate", async () => {
    const user = userEvent.setup();
    const handleSelectDate = vi.fn();

    render(
      <HolidayCalendar
        holidays={mockHolidays}
        branches={mockBranches}
        canManageHolidays={true}
        selectedYear="2026"
        onYearChange={vi.fn()}
        onSelectDate={handleSelectDate}
        onSelectHoliday={vi.fn()}
      />
    );

    // Switch to January where Jan 1 exists
    const janBtn = screen.getByRole("button", { name: "Jan" });
    await user.click(janBtn);

    // Click on day 15 (which has no holiday)
    const day15 = screen.getByText("15");
    await user.click(day15);

    expect(handleSelectDate).toHaveBeenCalledWith("2026-01-15");
  });

  it("displays holiday '1st JAN' on the calendar and triggers onSelectHoliday when clicked by manager", async () => {
    const user = userEvent.setup();
    const handleSelectHoliday = vi.fn();

    render(
      <HolidayCalendar
        holidays={mockHolidays}
        branches={mockBranches}
        canManageHolidays={true}
        selectedYear="2026"
        onYearChange={vi.fn()}
        onSelectDate={vi.fn()}
        onSelectHoliday={handleSelectHoliday}
      />
    );

    // Switch to January
    const janBtn = screen.getByRole("button", { name: "Jan" });
    await user.click(janBtn);

    // Find holiday badge for "1st JAN"
    const holidayBadge = screen.getByText("1st JAN");
    expect(holidayBadge).toBeInTheDocument();

    // Click the holiday badge
    await user.click(holidayBadge);
    expect(handleSelectHoliday).toHaveBeenCalledWith(mockHolidays[0]);
  });

  it("displays read-only popup when an employee clicks a holiday", async () => {
    const user = userEvent.setup();

    render(
      <HolidayCalendar
        holidays={mockHolidays}
        branches={mockBranches}
        canManageHolidays={false} // Employee
        selectedYear="2026"
        onYearChange={vi.fn()}
        onSelectDate={vi.fn()}
        onSelectHoliday={vi.fn()}
      />
    );

    // Employee mode badge
    expect(screen.getByText("Employee Calendar")).toBeInTheDocument();

    // Switch to January
    const janBtn = screen.getByRole("button", { name: "Jan" });
    await user.click(janBtn);

    const holidayBadge = screen.getByText("1st JAN");
    await user.click(holidayBadge);

    // Expect modal with holiday details
    expect(screen.getByText("New Year Celebration Day")).toBeInTheDocument();
    expect(screen.getByText("Public Holiday (Off)")).toBeInTheDocument();
  });

  it("toggles to agenda/list view and displays all holidays", async () => {
    const user = userEvent.setup();

    render(
      <HolidayCalendar
        holidays={mockHolidays}
        branches={mockBranches}
        canManageHolidays={true}
        selectedYear="2026"
        onYearChange={vi.fn()}
        onSelectDate={vi.fn()}
        onSelectHoliday={vi.fn()}
      />
    );

    const agendaToggle = screen.getByRole("button", { name: /Agenda/i });
    await user.click(agendaToggle);

    expect(screen.getByText("1st JAN")).toBeInTheDocument();
    expect(screen.getByText("Spring Festival")).toBeInTheDocument();
    expect(screen.getByText("Optional / Restricted")).toBeInTheDocument();
  });
});
