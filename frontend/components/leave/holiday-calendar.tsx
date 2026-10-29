"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Info,
  Building2,
  CalendarDays,
  PartyPopper,
  List,
  Grid,
  Clock,
  Trash2,
  Edit2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import type { Holiday } from "@/types/leave";
import type { BranchResponse } from "@/types/organization";

interface HolidayCalendarProps {
  holidays: Holiday[];
  branches: BranchResponse[];
  canManageHolidays: boolean;
  selectedYear: string;
  onYearChange: (year: string) => void;
  onSelectDate: (dateString: string) => void;
  onSelectHoliday: (holiday: Holiday) => void;
  onDeleteHoliday?: (holiday: Holiday) => void;
  isLoading?: boolean;
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

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HolidayCalendar({
  holidays,
  branches,
  canManageHolidays,
  selectedYear,
  onYearChange,
  onSelectDate,
  onSelectHoliday,
  onDeleteHoliday,
  isLoading = false,
}: HolidayCalendarProps) {
  // Calendar View State: Month (0-11) and Year
  const currentYearNum = parseInt(selectedYear, 10) || new Date().getFullYear();
  const [currentMonth, setCurrentMonth] = React.useState<number>(new Date().getMonth());
  const [currentYear, setCurrentYear] = React.useState<number>(currentYearNum);
  const [viewMode, setViewMode] = React.useState<"calendar" | "agenda">("calendar");
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>("all");

  // Read-only modal state for employee holiday inspection
  const [viewingHoliday, setViewingHoliday] = React.useState<Holiday | null>(null);

  // Sync internal year when parent's selectedYear changes
  React.useEffect(() => {
    const yr = parseInt(selectedYear, 10);
    if (!isNaN(yr) && yr !== currentYear) {
      setCurrentYear(yr);
    }
  }, [selectedYear, currentYear]);

  // Filter holidays by branch if specified
  const filteredHolidays = React.useMemo(() => {
    if (selectedBranchId === "all") return holidays;
    return holidays.filter((h) => !h.branch_id || h.branch_id === selectedBranchId);
  }, [holidays, selectedBranchId]);

  // Navigate to previous month
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      const prevYear = currentYear - 1;
      setCurrentMonth(11);
      setCurrentYear(prevYear);
      onYearChange(prevYear.toString());
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  // Navigate to next month
  const handleNextMonth = () => {
    if (currentMonth === 11) {
      const nextYear = currentYear + 1;
      setCurrentMonth(0);
      setCurrentYear(nextYear);
      onYearChange(nextYear.toString());
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  // Jump to today
  const handleJumpToToday = () => {
    const today = new Date();
    const thisYear = today.getFullYear();
    const thisMonth = today.getMonth();
    setCurrentYear(thisYear);
    setCurrentMonth(thisMonth);
    if (thisYear.toString() !== selectedYear) {
      onYearChange(thisYear.toString());
    }
  };

  // Jump to specific month
  const handleSelectMonth = (monthIndex: number) => {
    setCurrentMonth(monthIndex);
  };

  // Handle year change from dropdown
  const handleYearDropdownChange = (newYrStr: string) => {
    const yr = parseInt(newYrStr, 10);
    if (!isNaN(yr)) {
      setCurrentYear(yr);
      onYearChange(newYrStr);
    }
  };

  // Map holidays by date "YYYY-MM-DD" for fast lookup
  const holidaysByDate = React.useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of filteredHolidays) {
      const existing = map.get(h.holiday_date) || [];
      existing.push(h);
      map.set(h.holiday_date, existing);
    }
    return map;
  }, [filteredHolidays]);

  // Holiday statistics for the year
  const stats = React.useMemo(() => {
    const total = filteredHolidays.length;
    const publicCount = filteredHolidays.filter((h) => !h.is_optional).length;
    const optionalCount = filteredHolidays.filter((h) => h.is_optional).length;

    // Upcoming holiday relative to today
    const todayStr = (new Date().toISOString().split("T")[0]) || "";
    const upcoming = [...filteredHolidays]
      .filter((h) => h.holiday_date >= todayStr)
      .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))[0];

    return { total, publicCount, optionalCount, upcoming };
  }, [filteredHolidays]);

  // Compute calendar grid days for current month
  const calendarDays = React.useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const days: Array<{
      dateString: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isWeekend: boolean;
      holidaysOnDay: Holiday[];
    }> = [];

    const todayStr = (new Date().toISOString().split("T")[0]) || "";

    // Leading days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dNum = daysInPrevMonth - i;
      const prevMonthNum = currentMonth === 0 ? 12 : currentMonth;
      const prevYearNum = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateString = `${prevYearNum}-${String(prevMonthNum).padStart(2, "0")}-${String(
        dNum
      ).padStart(2, "0")}`;
      const dayOfWeek = (firstDayIndex - 1 - i) % 7;
      days.push({
        dateString,
        dayNum: dNum,
        isCurrentMonth: false,
        isToday: dateString === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        holidaysOnDay: holidaysByDate.get(dateString) || [],
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const monthNum = currentMonth + 1;
      const dateString = `${currentYear}-${String(monthNum).padStart(2, "0")}-${String(d).padStart(
        2,
        "0"
      )}`;
      const dayOfWeek = new Date(currentYear, currentMonth, d).getDay();
      days.push({
        dateString,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dateString === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        holidaysOnDay: holidaysByDate.get(dateString) || [],
      });
    }

    // Trailing days from next month to complete 5 or 6 rows (35 or 42 cells)
    const targetCellCount = days.length <= 35 ? 35 : 42;
    const remainingDays = targetCellCount - days.length;
    for (let d = 1; d <= remainingDays; d++) {
      const nextMonthNum = currentMonth === 11 ? 1 : currentMonth + 2;
      const nextYearNum = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateString = `${nextYearNum}-${String(nextMonthNum).padStart(2, "0")}-${String(
        d
      ).padStart(2, "0")}`;
      const dayOfWeek = new Date(
        nextMonthNum === 1 ? nextYearNum : currentYear,
        nextMonthNum === 1 ? 0 : currentMonth + 1,
        d
      ).getDay();
      days.push({
        dateString,
        dayNum: d,
        isCurrentMonth: false,
        isToday: dateString === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        holidaysOnDay: holidaysByDate.get(dateString) || [],
      });
    }

    return days;
  }, [currentYear, currentMonth, holidaysByDate]);

  // Format a friendly date: "Monday, January 1, 2026"
  const formatFriendlyDate = (dateStr: string) => {
    try {
      const parts = dateStr.split("-");
      const y = parseInt(parts[0] || "0", 10);
      const m = parseInt(parts[1] || "1", 10);
      const d = parseInt(parts[2] || "1", 10);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Quick Metrics */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Calendar Title & Month/Year Navigator */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-indigo-600 text-white shadow-subtle">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    {MONTH_NAMES[currentMonth]} {currentYear}
                  </h3>
                  {canManageHolidays ? (
                    <Badge variant="outline" className="text-primary-700 border-primary-200 bg-primary-50/50 text-[10px]">
                      <Sparkles className="h-3 w-3 mr-1 text-primary-600" />
                      Manager Mode: Click any date to declare
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Employee Calendar
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {canManageHolidays
                    ? "Click on any date to declare a holiday, or click a holiday card to edit/remove it."
                    : "Scheduled organization holidays are marked below. Click any holiday to inspect details."}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics & View Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Year Selector Dropdown */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs">
              <span className="font-medium text-slate-500">Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => handleYearDropdownChange(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
                aria-label="Select holiday year"
              >
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
              </select>
            </div>

            {/* Branch Filter Dropdown (if branches exist) */}
            {branches.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-medium text-slate-500">Branch:</span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[120px] truncate"
                  aria-label="Filter holidays by branch"
                >
                  <option value="all">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Total Holidays Pill */}
            <div className="flex items-center gap-1.5 rounded-lg border border-purple-200/80 bg-purple-50/70 px-2.5 py-1 text-xs text-purple-700">
              <PartyPopper className="h-3.5 w-3.5 text-purple-600" />
              <span className="font-semibold">{stats.total}</span>
              <span className="text-purple-600/80">Holidays</span>
            </div>

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-center gap-1 text-xs text-primary-600 animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Loading...</span>
              </div>
            )}

            {/* Upcoming Holiday Pill */}
            {stats.upcoming && (
              <div
                className="hidden xl:flex items-center gap-1.5 rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-2.5 py-1 text-xs text-indigo-700 cursor-pointer hover:bg-indigo-100/70 transition-colors"
                onClick={() => {
                  if (stats.upcoming) {
                    const parts = stats.upcoming.holiday_date.split("-");
                    const y = parseInt(parts[0] || "0", 10);
                    const m = parseInt(parts[1] || "1", 10);
                    if (!isNaN(y) && !isNaN(m)) {
                      setCurrentYear(y);
                      setCurrentMonth(m - 1);
                    }
                  }
                }}
                title="Jump to next holiday"
              >
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                <span className="font-medium">Next:</span>
                <span className="font-bold truncate max-w-[120px]">{stats.upcoming.name}</span>
                <span className="text-[11px] text-indigo-500">({stats.upcoming.holiday_date})</span>
              </div>
            )}

            {/* View Mode Toggle: Grid vs Agenda */}
            <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-100/70">
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === "calendar"
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                )}
                title="Calendar Grid View"
              >
                <Grid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Calendar</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("agenda")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === "agenda"
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                )}
                title="List / Agenda View"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Agenda</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Month Selector Bar */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrevMonth}
              className="h-8 w-8 p-0"
              title="Previous Month"
              aria-label="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleJumpToToday}
              className="h-8 px-2.5 text-xs font-medium"
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNextMonth}
              className="h-8 w-8 p-0"
              title="Next Month"
              aria-label="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Month Pills */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {MONTH_SHORT.map((mName, idx) => {
              const isSelected = idx === currentMonth;
              // Check if any holiday falls in this month
              const hasHolidayInMonth = filteredHolidays.some((h) => {
                const parts = h.holiday_date.split("-");
                const y = parseInt(parts[0] || "0", 10);
                const m = parseInt(parts[1] || "0", 10);
                return y === currentYear && m === idx + 1;
              });

              return (
                <button
                  key={mName}
                  type="button"
                  onClick={() => handleSelectMonth(idx)}
                  className={cn(
                    "relative rounded-lg px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap",
                    isSelected
                      ? "bg-primary-600 text-white shadow-xs font-semibold"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  {mName}
                  {hasHolidayInMonth && !isSelected && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-purple-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* VIEW 1: INTERACTIVE CALENDAR GRID */}
      {viewMode === "calendar" && (
        <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-xs">
          {/* Weekday Header Row */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 select-none">
            {WEEKDAY_NAMES.map((wName, idx) => (
              <div
                key={wName}
                className={cn(
                  "py-2.5 border-r border-slate-100 last:border-r-0",
                  idx === 0 || idx === 6 ? "text-slate-400 bg-slate-100/40" : "text-slate-700"
                )}
              >
                {wName}
              </div>
            ))}
          </div>

          {/* Calendar Grid Days */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {calendarDays.map((day) => {
              const hasHolidays = day.holidaysOnDay.length > 0;
              const isPublic = day.holidaysOnDay.some((h) => !h.is_optional);
              const isOptional = day.holidaysOnDay.some((h) => h.is_optional);

              return (
                <div
                  key={day.dateString}
                  onClick={() => {
                    // For owner/manager: clicking an empty date prompts to declare holiday
                    if (canManageHolidays && !hasHolidays) {
                      onSelectDate(day.dateString);
                    }
                  }}
                  className={cn(
                    "group relative min-h-[95px] sm:min-h-[110px] p-1.5 sm:p-2 transition-all duration-150 flex flex-col justify-between",
                    !day.isCurrentMonth && "bg-slate-50/40 opacity-40",
                    day.isCurrentMonth && day.isWeekend && !hasHolidays && "bg-slate-50/30",
                    day.isCurrentMonth && !day.isWeekend && !hasHolidays && "bg-white",
                    hasHolidays && isPublic && "bg-gradient-to-br from-purple-50/60 via-indigo-50/30 to-white",
                    hasHolidays && !isPublic && isOptional && "bg-gradient-to-br from-amber-50/60 via-orange-50/30 to-white",
                    canManageHolidays && !hasHolidays && "cursor-pointer hover:bg-primary-50/40 hover:ring-1 hover:ring-primary-300 inset-0",
                    day.isToday && "ring-2 ring-primary-500/80 ring-inset bg-primary-50/20"
                  )}
                >
                  {/* Date Number Header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                        day.isToday
                          ? "bg-primary-600 text-white shadow-xs font-bold"
                          : day.isCurrentMonth
                          ? day.isWeekend
                            ? "text-slate-400"
                            : "text-slate-700"
                          : "text-slate-300"
                      )}
                    >
                      {day.dayNum}
                    </span>

                    {/* Today indicator label */}
                    {day.isToday && (
                      <span className="text-[10px] font-bold text-primary-600 uppercase tracking-wider hidden sm:inline">
                        Today
                      </span>
                    )}

                    {/* Quick "+" declare button on hover for manager */}
                    {canManageHolidays && !hasHolidays && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDate(day.dateString);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex h-5 w-5 items-center justify-center rounded bg-primary-600 text-white hover:bg-primary-700 shadow-xs"
                        title={`Declare holiday on ${day.dateString}`}
                        aria-label={`Declare holiday on ${day.dateString}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Holiday Badges / Chips */}
                  <div className="mt-1 space-y-1 flex-1 flex flex-col justify-end">
                    {day.holidaysOnDay.map((h) => {
                      const isOpt = h.is_optional;

                      return (
                        <div
                          key={h.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canManageHolidays) {
                              onSelectHoliday(h);
                            } else {
                              setViewingHoliday(h);
                            }
                          }}
                          className={cn(
                            "rounded-md border p-1 text-[11px] font-medium transition-all shadow-2xs cursor-pointer",
                            isOpt
                              ? "border-amber-200 bg-amber-50/95 text-amber-900 hover:bg-amber-100"
                              : "border-purple-200 bg-purple-50/95 text-purple-900 hover:bg-purple-100"
                          )}
                          title={`${h.name} (${isOpt ? "Optional" : "Public Holiday"}) - Click to ${
                            canManageHolidays ? "edit or remove" : "view details"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1 truncate">
                              <PartyPopper
                                className={cn(
                                  "h-3 w-3 flex-shrink-0",
                                  isOpt ? "text-amber-600" : "text-purple-600"
                                )}
                              />
                              <span className="font-semibold truncate leading-tight">{h.name}</span>
                            </div>

                            {/* Manager quick edit icon */}
                            {canManageHolidays && (
                              <Edit2 className="h-2.5 w-2.5 text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
                            )}
                          </div>

                          {/* Branch Scope pill if applicable */}
                          {h.branch && (
                            <div className="mt-0.5 text-[9px] text-slate-500 flex items-center gap-0.5 truncate">
                              <Building2 className="h-2.5 w-2.5 flex-shrink-0" />
                              <span className="truncate">{h.branch.name}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Hint on hover for manager on empty date */}
                    {canManageHolidays && !hasHolidays && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-center py-1 hidden sm:block">
                        <span className="text-[10px] text-primary-600 font-medium">
                          + Declare Holiday
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Calendar Footer & Color Legend */}
          <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
                <span className="font-medium text-slate-700">Public Holiday</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="font-medium text-slate-700">Optional / Restricted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-primary-500 bg-primary-100" />
                <span className="font-medium text-slate-700">Today</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-slate-200" />
                <span className="text-slate-500">Weekend</span>
              </div>
            </div>

            {canManageHolidays ? (
              <div className="text-xs text-primary-700 font-medium flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-primary-600" />
                <span>Tip: Click on any date box to declare a holiday instantly.</span>
              </div>
            ) : (
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-slate-400" />
                <span>Click any holiday chip to view full schedule details.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: AGENDA / LIST VIEW */}
      {viewMode === "agenda" && (
        <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-xs">
          {holidays.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <CalendarDays className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No Holidays Listed for {selectedYear}</p>
              <p className="text-xs text-slate-500">
                {canManageHolidays
                  ? "Switch to Calendar view and click any date to declare your first company holiday."
                  : "No holidays have been scheduled by your organization for this year yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3.5">Holiday Name</th>
                    <th className="px-6 py-3.5">Date & Day</th>
                    <th className="px-6 py-3.5">Scope / Branch</th>
                    <th className="px-6 py-3.5">Type</th>
                    <th className="px-6 py-3.5">Description</th>
                    {canManageHolidays && <th className="px-6 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...holidays]
                    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
                    .map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
                          <PartyPopper
                            className={cn(
                              "h-4 w-4",
                              h.is_optional ? "text-amber-500" : "text-purple-600"
                            )}
                          />
                          <span>{h.name}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700 font-medium">
                          {formatFriendlyDate(h.holiday_date)}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600">
                          {h.branch ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              <Building2 className="h-3 w-3 mr-1 text-slate-400" />
                              {h.branch.name}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs font-normal">
                              All Branches
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {h.is_optional ? (
                            <Badge variant="warning" className="text-xs font-normal">
                              Optional / Restricted
                            </Badge>
                          ) : (
                            <Badge
                              variant="default"
                              className="text-xs font-normal bg-purple-100 text-purple-800 border-purple-200"
                            >
                              Public Holiday
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                          {h.description || "—"}
                        </td>
                        {canManageHolidays && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => onSelectHoliday(h)}
                                className="text-slate-400 hover:text-primary-600 p-1 rounded"
                                title="Edit Holiday"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              {onDeleteHoliday && (
                                <button
                                  onClick={() => onDeleteHoliday(h)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded"
                                  title="Delete Holiday"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* READ-ONLY HOLIDAY DETAILS MODAL (FOR EMPLOYEES & STAFF) */}
      <Modal
        isOpen={Boolean(viewingHoliday)}
        onClose={() => setViewingHoliday(null)}
        title={viewingHoliday ? viewingHoliday.name : "Holiday Details"}
        description="Official organization holiday schedule"
      >
        {viewingHoliday && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-purple-100 bg-purple-50/70 p-3.5 text-purple-900">
              <PartyPopper className="h-6 w-6 text-purple-600 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-base text-slate-900">{viewingHoliday.name}</h4>
                <p className="text-xs text-purple-700 font-medium">
                  {formatFriendlyDate(viewingHoliday.holiday_date)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <span className="text-slate-400 block font-medium">Holiday Type</span>
                <span className="text-slate-800 font-semibold mt-0.5 inline-block">
                  {viewingHoliday.is_optional ? "Optional / Restricted" : "Public Holiday (Off)"}
                </span>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <span className="text-slate-400 block font-medium">Branch Scope</span>
                <span className="text-slate-800 font-semibold mt-0.5 inline-block">
                  {viewingHoliday.branch ? viewingHoliday.branch.name : "All Branches (Org-wide)"}
                </span>
              </div>
            </div>

            {viewingHoliday.description && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                <span className="text-slate-400 block font-medium">Description</span>
                <p className="text-slate-700 mt-1 leading-relaxed">{viewingHoliday.description}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setViewingHoliday(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
