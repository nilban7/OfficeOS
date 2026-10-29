"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PartyPopper,
  Sparkles,
  Check,
  X,
  RotateCcw,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import type { Holiday } from "@/types/leave";

export interface LeaveDatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
  onApplyDates: (startDate: string, endDate: string) => void;
  holidays: Holiday[];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function LeaveDatePickerModal({
  isOpen,
  onClose,
  startDate,
  endDate,
  onApplyDates,
  holidays,
}: LeaveDatePickerModalProps) {
  // Temporary selection state inside the modal
  const [tempStart, setTempStart] = React.useState<string>(startDate || "");
  const [tempEnd, setTempEnd] = React.useState<string>(endDate || "");
  const [selectionStep, setSelectionStep] = React.useState<"start" | "end">("start");

  // Current calendar view (year and month: 0-11)
  const initialYear = startDate
    ? parseInt(startDate.split("-")[0] || "", 10) || new Date().getFullYear()
    : new Date().getFullYear();
  const initialMonth = startDate
    ? (parseInt(startDate.split("-")[1] || "", 10) - 1) || new Date().getMonth()
    : new Date().getMonth();

  const [currentYear, setCurrentYear] = React.useState<number>(initialYear);
  const [currentMonth, setCurrentMonth] = React.useState<number>(initialMonth);

  // Sync internal state when opened or when props change
  React.useEffect(() => {
    if (isOpen) {
      setTempStart(startDate || "");
      setTempEnd(endDate || "");
      setSelectionStep(startDate && !endDate ? "end" : "start");

      if (startDate) {
        const parts = startDate.split("-");
        const yr = parseInt(parts[0] || "", 10);
        const mo = parseInt(parts[1] || "", 10) - 1;
        if (!isNaN(yr) && !isNaN(mo)) {
          setCurrentYear(yr);
          setCurrentMonth(mo);
        }
      }
    }
  }, [isOpen, startDate, endDate]);

  // Index company holidays by date: "YYYY-MM-DD" -> Holiday[]
  const holidaysByDate = React.useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of holidays) {
      if (!h.holiday_date) continue;
      // Normalise date string to YYYY-MM-DD
      const d = h.holiday_date.split("T")[0] || "";
      if (!d) continue;
      const list = map.get(d) || [];
      list.push(h);
      map.set(d, list);
    }
    return map;
  }, [holidays]);

  // Holidays in the currently viewed month
  const currentMonthHolidays = React.useMemo(() => {
    const prefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    return holidays
      .filter((h) => h.holiday_date && h.holiday_date.startsWith(prefix))
      .sort((a, b) => (a.holiday_date || "").localeCompare(b.holiday_date || ""));
  }, [holidays, currentYear, currentMonth]);

  // Holidays inside the currently selected date range
  const holidaysInRange = React.useMemo(() => {
    if (!tempStart || !tempEnd) return [];
    if (tempStart > tempEnd) return [];

    return holidays.filter((h) => {
      if (!h.holiday_date) return false;
      const hDate = h.holiday_date.split("T")[0] || "";
      return hDate >= tempStart && hDate <= tempEnd;
    });
  }, [holidays, tempStart, tempEnd]);

  // Calculate duration in calendar days
  const calculatedDays = React.useMemo(() => {
    if (!tempStart || !tempEnd) return 0;
    const parts1 = tempStart.split("-").map((v) => parseInt(v, 10));
    const parts2 = tempEnd.split("-").map((v) => parseInt(v, 10));
    if (parts1.length !== 3 || parts2.length !== 3) return 0;
    const [y1, m1, d1] = parts1;
    const [y2, m2, d2] = parts2;
    if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
    const utc1 = Date.UTC(y1, m1 - 1, d1);
    const utc2 = Date.UTC(y2, m2 - 1, d2);
    if (utc1 > utc2) return 0;
    return Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24)) + 1;
  }, [tempStart, tempEnd]);

  // Calendar matrix days calculation
  const calendarDays = React.useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = firstDayOfMonth.getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Helper to format local date to YYYY-MM-DD
    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    interface DayCell {
      dateString: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isWeekend: boolean;
      holidaysOnDay: Holiday[];
    }

    const days: DayCell[] = [];

    // Leading days from previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(currentYear, currentMonth - 1, d);
      const dateString = formatDate(prevDate);
      const dayOfWeek = prevDate.getDay();

      days.push({
        dateString,
        dayNum: d,
        isCurrentMonth: false,
        isToday: dateString === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        holidaysOnDay: holidaysByDate.get(dateString) || [],
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const currDate = new Date(currentYear, currentMonth, d);
      const dateString = formatDate(currDate);
      const dayOfWeek = currDate.getDay();

      days.push({
        dateString,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dateString === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        holidaysOnDay: holidaysByDate.get(dateString) || [],
      });
    }

    // Trailing days from next month to fill grid to multiple of 7
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const nextDate = new Date(currentYear, currentMonth + 1, d);
        const dateString = formatDate(nextDate);
        const dayOfWeek = nextDate.getDay();

        days.push({
          dateString,
          dayNum: d,
          isCurrentMonth: false,
          isToday: dateString === todayStr,
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
          holidaysOnDay: holidaysByDate.get(dateString) || [],
        });
      }
    }

    return days;
  }, [currentYear, currentMonth, holidaysByDate]);

  // Navigate months
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  // Date click handler
  const handleDateClick = (dateStr: string) => {
    if (!dateStr) return;
    if (selectionStep === "start" || !tempStart) {
      // Step 1: User picks start date
      setTempStart(dateStr);
      setTempEnd(dateStr); // Default single day
      setSelectionStep("end");
    } else {
      // Step 2: User picks end date
      if (dateStr < tempStart) {
        // If clicked earlier than current start, make it the new start date
        setTempStart(dateStr);
        setTempEnd(dateStr);
      } else {
        setTempEnd(dateStr);
        setSelectionStep("start");
      }
    }
  };

  const handleApply = () => {
    if (!tempStart) return;
    const finalEnd = tempEnd || tempStart;
    onApplyDates(tempStart, finalEnd);
    onClose();
  };

  const handleClear = () => {
    setTempStart("");
    setTempEnd("");
    setSelectionStep("start");
  };

  const formatFriendlyDate = (dStr: string) => {
    if (!dStr) return "Not selected";
    try {
      const parts = dStr.split("-");
      const y = parseInt(parts[0] || "", 10);
      const m = parseInt(parts[1] || "", 10) - 1;
      const d = parseInt(parts[2] || "", 10);
      const dt = new Date(y, m, d);
      return dt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-modal animate-in fade-in-0 zoom-in-95 duration-180 flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-indigo-600 text-white shadow-xs">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="calendar-modal-title"
                className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100"
              >
                Select Leave Dates
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Company holidays are prominently marked to help plan your time off.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            aria-label="Close calendar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Active Selection Banner / Controls */}
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 sm:p-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Dual Selection Pills */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectionStep("start")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-left",
                    selectionStep === "start"
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500/20 font-semibold"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400">Start:</span>
                  <span className="font-medium">{tempStart ? formatFriendlyDate(tempStart) : "Click on date"}</span>
                </button>

                <span className="text-slate-400 font-bold">→</span>

                <button
                  type="button"
                  onClick={() => setSelectionStep("end")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-left",
                    selectionStep === "end"
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500/20 font-semibold"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  )}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400">End:</span>
                  <span className="font-medium">{tempEnd ? formatFriendlyDate(tempEnd) : "Click on date"}</span>
                </button>
              </div>

              {/* Duration & Status */}
              <div className="flex items-center gap-2">
                {calculatedDays > 0 && (
                  <Badge variant="default" className="text-xs font-semibold py-1 px-2.5">
                    {calculatedDays} {calculatedDays === 1 ? "day" : "days"} (inclusive)
                  </Badge>
                )}
                {tempStart && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Instruction Tip */}
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Info className="h-3.5 w-3.5 text-primary-500 shrink-0" />
              <span>
                {selectionStep === "start"
                  ? "Click any date below to set your Start Date."
                  : "Now click any date on or after your Start Date to set your End Date."}
              </span>
            </p>
          </div>

          {/* Month & Year Navigation Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Previous Month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1.5">
                <select
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(parseInt(e.target.value, 10))}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                  aria-label="Select Month"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>

                <select
                  value={currentYear}
                  onChange={(e) => setCurrentYear(parseInt(e.target.value, 10))}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                  aria-label="Select Year"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Next Month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleJumpToToday}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              Today
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            {/* Weekday Names Header */}
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
              {WEEKDAY_NAMES.map((w, idx) => (
                <div
                  key={w}
                  className={cn(
                    "py-2 border-r border-slate-100 dark:border-slate-800 last:border-r-0",
                    idx === 0 || idx === 6 ? "text-slate-400 dark:text-slate-500 bg-slate-100/30 dark:bg-slate-800/40" : ""
                  )}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Grid of Dates */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800">
              {calendarDays.map((day, idx) => {
                const holidaysOnDay = day.holidaysOnDay;
                const hasHoliday = holidaysOnDay.length > 0;
                const isSelectedStart = day.dateString === tempStart;
                const isSelectedEnd = day.dateString === tempEnd;
                const isInRange =
                  tempStart &&
                  tempEnd &&
                  day.dateString > tempStart &&
                  day.dateString < tempEnd;

                return (
                  <div
                    key={`${day.dateString}-${idx}`}
                    onClick={() => handleDateClick(day.dateString)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleDateClick(day.dateString);
                      }
                    }}
                    className={cn(
                      "group relative min-h-[64px] sm:min-h-[74px] p-1.5 transition-all duration-150 flex flex-col justify-between cursor-pointer select-none",
                      !day.isCurrentMonth && "opacity-35 bg-slate-50/50 dark:bg-slate-950/30",
                      day.isCurrentMonth && !hasHoliday && !isInRange && !isSelectedStart && !isSelectedEnd && "hover:bg-primary-50/50 dark:hover:bg-slate-800/80",
                      // Holiday Background
                      hasHoliday && !isSelectedStart && !isSelectedEnd && !isInRange && "bg-purple-50/60 dark:bg-purple-950/30 border-purple-200/50 dark:border-purple-800/40 hover:bg-purple-100/60 dark:hover:bg-purple-900/40",
                      // Range Highlights
                      isInRange && "bg-primary-50/80 dark:bg-primary-950/50",
                      isSelectedStart && "bg-primary-600 text-white rounded-l-lg shadow-xs",
                      isSelectedEnd && "bg-primary-600 text-white rounded-r-lg shadow-xs",
                      isSelectedStart && isSelectedEnd && "rounded-lg"
                    )}
                  >
                    {/* Date Number and Today Tag */}
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                          isSelectedStart || isSelectedEnd
                            ? "bg-white text-primary-700 font-bold shadow-xs"
                            : day.isToday
                            ? "bg-primary-500 text-white font-bold"
                            : hasHoliday
                            ? "text-purple-700 dark:text-purple-300 font-bold"
                            : day.isCurrentMonth
                            ? "text-slate-700 dark:text-slate-200"
                            : "text-slate-400 dark:text-slate-600"
                        )}
                      >
                        {day.dayNum}
                      </span>

                      {isSelectedStart && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-white">
                          Start
                        </span>
                      )}
                      {!isSelectedStart && isSelectedEnd && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-white">
                          End
                        </span>
                      )}
                    </div>

                    {/* Company Holiday Chip / Tag */}
                    {hasHoliday && (
                      <div className="mt-1 space-y-0.5">
                        {holidaysOnDay.slice(0, 2).map((h) => (
                          <div
                            key={h.id}
                            className={cn(
                              "flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold leading-tight truncate shadow-2xs",
                              isSelectedStart || isSelectedEnd
                                ? "bg-white/20 text-white"
                                : "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-200/70 dark:border-purple-700/60"
                            )}
                            title={`Company Holiday: ${h.name}${h.description ? ` (${h.description})` : ""}`}
                          >
                            <PartyPopper className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{h.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Month Holidays Checklist (Quick Reference) */}
          {currentMonthHolidays.length > 0 && (
            <div className="rounded-xl border border-purple-200/70 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-800 dark:text-purple-300 mb-1.5">
                <PartyPopper className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span>Company Holidays in {MONTH_NAMES[currentMonth]} {currentYear}:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {currentMonthHolidays.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between text-xs rounded-lg bg-white/80 dark:bg-slate-800/80 border border-purple-100 dark:border-purple-800/50 px-2.5 py-1"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{h.name}</span>
                    <span className="text-[11px] text-purple-700 dark:text-purple-300 font-mono font-medium">
                      {h.holiday_date}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notice if leave range includes holidays */}
          {holidaysInRange.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Notice: Your selected leave range includes {holidaysInRange.length} official company holiday(s):
                </p>
                <p className="mt-0.5 text-[11px]">
                  {holidaysInRange.map((h) => `${h.name} (${h.holiday_date})`).join(", ")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3.5 sm:px-6">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {tempStart ? (
              <span>
                Selected: <strong className="text-slate-800 dark:text-slate-200">{tempStart}</strong> to{" "}
                <strong className="text-slate-800 dark:text-slate-200">{tempEnd || tempStart}</strong>
              </span>
            ) : (
              <span>No dates chosen yet</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={!tempStart}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" />
              <span>Apply Dates</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
