"use client";

import * as React from "react";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Edit2,
  Trash2,
  LogIn,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type { BranchResponse } from "@/types/organization";
import type { Department, Employee, PaginatedEmployees } from "@/types/employee";
import type {
  AttendanceCreate,
  AttendanceDetailResponse,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceSummary,
  AttendanceUpdate,
  PaginatedAttendance,
} from "@/types/attendance";

export default function AttendancePage() {
  const { currentOrganization, permissions, membership, isLoading: isOrgLoading } = useOrganization();

  const isSystemAdmin = membership?.role === "system_admin";

  // Permissions
  const canView = isSystemAdmin || permissions.includes("attendance.view");
  const canCreate = isSystemAdmin || permissions.includes("attendance.create");
  const canUpdate = isSystemAdmin || permissions.includes("attendance.update");
  const canDelete = isSystemAdmin || permissions.includes("attendance.delete");

  // Summary State
  const [summary, setSummary] = React.useState<AttendanceSummary | null>(null);

  // My Today Record
  const [myTodayRecord, setMyTodayRecord] = React.useState<AttendanceRecord | null>(null);
  const [isLoadingMyToday, setIsLoadingMyToday] = React.useState(false);
  const [isClockingIn, setIsClockingIn] = React.useState(false);
  const [isClockingOut, setIsClockingOut] = React.useState(false);

  // Attendance List State
  const [attendanceData, setAttendanceData] = React.useState<PaginatedAttendance>({
    items: [],
    meta: { total: 0, page: 1, page_size: 20, total_pages: 1 },
  });
  const [isLoadingList, setIsLoadingList] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [filterDate, setFilterDate] = React.useState<string>(() => {
    return new Date().toISOString().split("T")[0] || "";
  });
  const [filterDepartment, setFilterDepartment] = React.useState<string>("");
  const [filterBranch, setFilterBranch] = React.useState<string>("");
  const [filterStatus, setFilterStatus] = React.useState<string>("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [sortBy] = React.useState<string>("work_date");
  const [sortOrder] = React.useState<string>("desc");

  // Reference lists
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [branches, setBranches] = React.useState<BranchResponse[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);

  // Alerts
  const [globalSuccess, setGlobalSuccess] = React.useState<string | null>(null);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // Modals
  const [isMarkOpen, setIsMarkOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isQuickClockOutOpen, setIsQuickClockOutOpen] = React.useState(false);

  const [editingRecord, setEditingRecord] = React.useState<AttendanceRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = React.useState<AttendanceRecord | null>(null);
  const [quickClockOutRecord, setQuickClockOutRecord] = React.useState<AttendanceRecord | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Form fields for Mark/Edit
  const [formEmployeeId, setFormEmployeeId] = React.useState("");
  const [formWorkDate, setFormWorkDate] = React.useState(() => {
    return new Date().toISOString().split("T")[0] || "";
  });
  const [formStatus, setFormStatus] = React.useState<AttendanceStatus>("present");
  const [formCheckInAt, setFormCheckInAt] = React.useState("");
  const [formCheckOutAt, setFormCheckOutAt] = React.useState("");
  const [formBranchId, setFormBranchId] = React.useState("");
  const [formNotes, setFormNotes] = React.useState("");
  const [clockNotes, setClockNotes] = React.useState("");

  // 1. Fetch Reference Data (Departments, Branches, Employees)
  const fetchReferenceData = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const [deptRes, branchRes, empRes] = await Promise.allSettled([
        apiClient.get<Department[]>(API_ENDPOINTS.departments.list, {
          organizationId: currentOrganization.id,
        }),
        apiClient.get<BranchResponse[]>(API_ENDPOINTS.organizations.currentBranches, {
          organizationId: currentOrganization.id,
        }),
        apiClient.get<PaginatedEmployees>(API_ENDPOINTS.employees.list, {
          organizationId: currentOrganization.id,
          params: { page_size: 100 },
        }),
      ]);

      if (deptRes.status === "fulfilled" && deptRes.value) {
        setDepartments(deptRes.value);
      }
      if (branchRes.status === "fulfilled" && branchRes.value) {
        setBranches(branchRes.value);
      }
      if (empRes.status === "fulfilled" && empRes.value) {
        setEmployees(empRes.value.items || []);
      }
    } catch {
      // Best-effort reference loading
    }
  }, [currentOrganization]);

  // 2. Fetch Summary Statistics
  const fetchSummary = React.useCallback(async () => {
    if (!currentOrganization || !canView) return;
    try {
      const res = await apiClient.get<AttendanceSummary>("/attendance/summary", {
        organizationId: currentOrganization.id,
        params: filterDate ? { target_date: filterDate } : {},
      });
      if (res) {
        setSummary(res);
      }
    } catch {
      // Best-effort summary loading
    }
  }, [currentOrganization, canView, filterDate]);

  // 3. Fetch My Today Attendance Status
  const fetchMyToday = React.useCallback(async () => {
    if (!currentOrganization || !canView) return;
    setIsLoadingMyToday(true);
    try {
      const res = await apiClient.get<AttendanceDetailResponse | null>(
        "/attendance/today",
        {
          organizationId: currentOrganization.id,
        }
      );
      setMyTodayRecord(res || null);
    } catch {
      // Best-effort loading
    } finally {
      setIsLoadingMyToday(false);
    }
  }, [currentOrganization, canView]);

  // 4. Fetch Attendance List
  const fetchAttendanceList = React.useCallback(async () => {
    if (!currentOrganization || !canView) return;
    setIsLoadingList(true);
    setListError(null);

    try {
      const params: Record<string, string | number | boolean> = {
        page: currentPage,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (search.trim()) params.search = search.trim();
      if (filterDate) {
        params.start_date = filterDate;
        params.end_date = filterDate;
      }
      if (filterDepartment) params.department_id = filterDepartment;
      if (filterBranch) params.branch_id = filterBranch;
      if (filterStatus) params.status = filterStatus;

      const res = await apiClient.get<PaginatedAttendance>(
        API_ENDPOINTS.attendance.list,
        {
          organizationId: currentOrganization.id,
          params,
        }
      );
      if (res) {
        setAttendanceData(res);
      }
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to load attendance list";
      setListError(msg);
    } finally {
      setIsLoadingList(false);
    }
  }, [
    currentOrganization,
    canView,
    currentPage,
    pageSize,
    sortBy,
    sortOrder,
    search,
    filterDate,
    filterDepartment,
    filterBranch,
    filterStatus,
  ]);

  // Initial and reactive data fetching
  React.useEffect(() => {
    if (currentOrganization) {
      void fetchReferenceData();
      void fetchSummary();
      void fetchMyToday();
      void fetchAttendanceList();
    }
  }, [currentOrganization, fetchReferenceData, fetchSummary, fetchMyToday, fetchAttendanceList]);

  // Auto-dismiss alerts
  React.useEffect(() => {
    if (!globalSuccess) return;
    const t = setTimeout(() => setGlobalSuccess(null), 5000);
    return () => clearTimeout(t);
  }, [globalSuccess]);

  // Handlers for Quick Self Clock In / Out
  const handleQuickClockIn = async () => {
    if (!currentOrganization) return;
    setIsClockingIn(true);
    setGlobalError(null);

    try {
      const res = await apiClient.post<AttendanceDetailResponse>(
        API_ENDPOINTS.attendance.clockIn,
        {
          notes: clockNotes.trim() || undefined,
        },
        {
          organizationId: currentOrganization.id,
        }
      );
      setMyTodayRecord(res);
      setClockNotes("");
      setGlobalSuccess("Clock-in recorded successfully!");
      void fetchSummary();
      void fetchAttendanceList();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to clock in";
      setGlobalError(msg);
    } finally {
      setIsClockingIn(false);
    }
  };

  const handleQuickClockOut = async (attendanceId?: string) => {
    const targetId = attendanceId || myTodayRecord?.id;
    if (!currentOrganization || !targetId) return;
    setIsClockingOut(true);
    setGlobalError(null);

    try {
      const res = await apiClient.post<AttendanceDetailResponse>(
        `/attendance/${targetId}/check-out`,
        {
          notes: clockNotes.trim() || undefined,
        },
        {
          organizationId: currentOrganization.id,
        }
      );
      setMyTodayRecord(res);
      setClockNotes("");
      setIsQuickClockOutOpen(false);
      setQuickClockOutRecord(null);
      setGlobalSuccess("Clock-out recorded successfully!");
      void fetchSummary();
      void fetchAttendanceList();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to clock out";
      setGlobalError(msg);
    } finally {
      setIsClockingOut(false);
    }
  };

  // Open Mark Attendance Modal
  const openMarkModal = () => {
    const firstEmp = employees[0]?.id || "";
    setFormEmployeeId(firstEmp);
    setFormWorkDate(new Date().toISOString().split("T")[0] || "");
    setFormStatus("present");
    setFormCheckInAt("");
    setFormCheckOutAt("");
    setFormBranchId("");
    setFormNotes("");
    setFormError(null);
    setIsMarkOpen(true);
  };

  // Submit Mark Attendance
  const handleMarkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;
    if (!formEmployeeId) {
      setFormError("Please select an employee");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const body: AttendanceCreate = {
        employee_id: formEmployeeId,
        work_date: formWorkDate,
        status: formStatus,
        branch_id: formBranchId || null,
        check_in_at: formCheckInAt ? new Date(formCheckInAt).toISOString() : null,
        check_out_at: formCheckOutAt ? new Date(formCheckOutAt).toISOString() : null,
        notes: formNotes.trim() || null,
      };

      await apiClient.post<AttendanceDetailResponse>(
        API_ENDPOINTS.attendance.list,
        body,
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsMarkOpen(false);
      setGlobalSuccess("Attendance record created successfully!");
      void fetchSummary();
      void fetchAttendanceList();
      void fetchMyToday();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to create attendance";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setFormStatus((rec.status as AttendanceStatus) || "present");
    setFormWorkDate(rec.work_date);
    setFormCheckInAt(rec.check_in_at ? rec.check_in_at.slice(0, 16) : "");
    setFormCheckOutAt(rec.check_out_at ? rec.check_out_at.slice(0, 16) : "");
    setFormBranchId(rec.branch_id || "");
    setFormNotes(rec.notes || "");
    setFormError(null);
    setIsEditOpen(true);
  };

  // Submit Edit Attendance
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !editingRecord) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const body: AttendanceUpdate = {
        status: formStatus,
        work_date: formWorkDate,
        branch_id: formBranchId || null,
        check_in_at: formCheckInAt ? new Date(formCheckInAt).toISOString() : null,
        check_out_at: formCheckOutAt ? new Date(formCheckOutAt).toISOString() : null,
        notes: formNotes.trim() || null,
      };

      await apiClient.patch<AttendanceDetailResponse>(
        `/attendance/${editingRecord.id}`,
        body,
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsEditOpen(false);
      setEditingRecord(null);
      setGlobalSuccess("Attendance record updated successfully!");
      void fetchSummary();
      void fetchAttendanceList();
      void fetchMyToday();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to update attendance";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Delete Modal
  const openDeleteModal = (rec: AttendanceRecord) => {
    setDeletingRecord(rec);
    setIsDeleteOpen(true);
  };

  // Submit Delete
  const handleDeleteSubmit = async () => {
    if (!currentOrganization || !deletingRecord) return;
    setIsSubmitting(true);

    try {
      await apiClient.delete(`/attendance/${deletingRecord.id}`, {
        organizationId: currentOrganization.id,
      });

      setIsDeleteOpen(false);
      setDeletingRecord(null);
      setGlobalSuccess("Attendance record deleted successfully!");
      void fetchSummary();
      void fetchAttendanceList();
      void fetchMyToday();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to delete attendance";
      setGlobalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper function to format timestamps
  const formatTime = (isoString?: string | null): string => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString || "-";
    }
  };

  // Helper function to calculate duration
  const calculateDuration = (checkIn?: string | null, checkOut?: string | null) => {
    if (!checkIn) return "-";
    const start = new Date(checkIn).getTime();
    const end = checkOut ? new Date(checkOut).getTime() : new Date().getTime();
    if (isNaN(start) || isNaN(end) || end < start) return "-";

    const diffMinutes = Math.floor((end - start) / (1000 * 60));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "present":
        return <Badge variant="success">Present</Badge>;
      case "late":
        return <Badge variant="warning">Late</Badge>;
      case "half_day":
        return <Badge variant="secondary">Half Day</Badge>;
      case "absent":
        return <Badge variant="destructive">Absent</Badge>;
      case "on_leave":
        return <Badge variant="info">On Leave</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isOrgLoading) {
    return <LoadingState fullPage message="Loading organization context..." />;
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <ShieldAlert className="h-16 w-16 text-rose-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-slate-500 mt-2 max-w-md">
          You do not have permission to view attendance records in this organization.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global Alerts */}
      {globalSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium">{globalSuccess}</p>
        </div>
      )}

      {globalError && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg shadow-sm">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <p className="text-sm font-medium">{globalError}</p>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="h-7 w-7 text-primary-600" />
            Attendance & Time Tracking
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor daily employee attendance, track work hours, and manage clock-in / clock-out records.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate && (
            <Button
              onClick={openMarkModal}
              className="flex items-center gap-2"
              variant="primary"
            >
              <Plus className="h-4 w-4" />
              Mark Attendance
            </Button>
          )}
        </div>
      </div>

      {/* Top Section: Summary Metrics & Personal Clock-In Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Clock In/Out Widget */}
        <Card className="lg:col-span-1 border-primary-200 bg-gradient-to-br from-primary-50/50 to-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center justify-between">
              <span>My Today Status</span>
              <Badge variant="outline" className="text-xs bg-white">
                {new Date().toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingMyToday ? (
              <div className="py-6 flex justify-center">
                <LoadingState message="Loading status..." />
              </div>
            ) : myTodayRecord ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                  <div>
                    <span className="text-xs text-slate-500 block">Clock In</span>
                    <span className="text-base font-semibold text-slate-800">
                      {formatTime(myTodayRecord.check_in_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Clock Out</span>
                    <span className="text-base font-semibold text-slate-800">
                      {myTodayRecord.check_out_at
                        ? formatTime(myTodayRecord.check_out_at)
                        : "In Progress"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Duration</span>
                    <span className="text-sm font-semibold text-primary-700">
                      {calculateDuration(
                        myTodayRecord.check_in_at,
                        myTodayRecord.check_out_at
                      )}
                    </span>
                  </div>
                </div>

                {!myTodayRecord.check_out_at ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Optional notes before clocking out..."
                      value={clockNotes}
                      onChange={(e) => setClockNotes(e.target.value)}
                      className="text-xs"
                    />
                    <Button
                      onClick={() => handleQuickClockOut()}
                      disabled={isClockingOut}
                      className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      <LogOut className="h-4 w-4" />
                      {isClockingOut ? "Recording Clock-Out..." : "Clock Out"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 p-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> Shift Completed Today
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  You have not clocked in for today yet. Record your attendance now.
                </p>
                <Input
                  placeholder="Optional notes (e.g. Work From Home)..."
                  value={clockNotes}
                  onChange={(e) => setClockNotes(e.target.value)}
                  className="text-xs"
                />
                <Button
                  onClick={handleQuickClockIn}
                  disabled={isClockingIn}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <LogIn className="h-4 w-4" />
                  {isClockingIn ? "Recording Clock-In..." : "Clock In Now"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Metrics */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-white border-slate-200">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-slate-500 block">Total Active</span>
              <span className="text-2xl font-bold text-slate-800 mt-1 block">
                {summary?.total_active_employees ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">Organization headcount</span>
            </CardContent>
          </Card>

          <Card className="bg-white border-emerald-200">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-emerald-700 block">Present Today</span>
              <span className="text-2xl font-bold text-emerald-600 mt-1 block">
                {summary?.present_count ?? 0}
              </span>
              <span className="text-[11px] text-emerald-600/70">On time attendance</span>
            </CardContent>
          </Card>

          <Card className="bg-white border-amber-200">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-amber-700 block">Late Today</span>
              <span className="text-2xl font-bold text-amber-600 mt-1 block">
                {summary?.late_count ?? 0}
              </span>
              <span className="text-[11px] text-amber-600/70">Late clock-ins</span>
            </CardContent>
          </Card>

          <Card className="bg-white border-rose-200">
            <CardContent className="p-4">
              <span className="text-xs font-medium text-rose-700 block">Absent / Leave</span>
              <span className="text-2xl font-bold text-rose-600 mt-1 block">
                {(summary?.absent_count ?? 0) + (summary?.on_leave_count ?? 0)}
              </span>
              <span className="text-[11px] text-rose-600/70">
                {summary?.on_leave_count ?? 0} on approved leave
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="bg-white border-slate-200">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Date Filter */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Work Date</Label>
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs h-9"
              />
            </div>

            {/* Search */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Search Employee</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
                <Input
                  placeholder="Name or code..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8 text-xs h-9"
                />
              </div>
            </div>

            {/* Department */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Department</Label>
              <select
                value={filterDepartment}
                onChange={(e) => {
                  setFilterDepartment(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-800 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Branch */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Branch</Label>
              <select
                value={filterBranch}
                onChange={(e) => {
                  setFilterBranch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-800 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Status</Label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-800 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Statuses</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>

            {/* Reset Filter Button */}
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setFilterDate(new Date().toISOString().split("T")[0] || "");
                  setFilterDepartment("");
                  setFilterBranch("");
                  setFilterStatus("");
                  setCurrentPage(1);
                }}
                className="w-full h-9 text-xs"
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Records Table */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {isLoadingList ? (
            <div className="py-16">
              <LoadingState message="Loading attendance records..." />
            </div>
          ) : listError ? (
            <div className="p-8">
              <ErrorState
                title="Failed to Load Attendance"
                message={listError}
                onRetry={fetchAttendanceList}
              />
            </div>
          ) : attendanceData.items.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={Clock}
                title="No Attendance Records Found"
                description="No attendance records match the selected date and filters."
                actionLabel={canCreate ? "Mark Attendance" : undefined}
                onAction={canCreate ? openMarkModal : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Employee</th>
                    <th className="px-6 py-3.5">Department / Branch</th>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Clock In</th>
                    <th className="px-6 py-3.5">Clock Out</th>
                    <th className="px-6 py-3.5">Duration</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Notes</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceData.items.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Employee */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs">
                            {rec.employee?.first_name?.[0] || "E"}
                            {rec.employee?.last_name?.[0] || ""}
                          </div>
                          <div>
                            <span className="font-medium text-slate-900 block">
                              {rec.employee
                                ? `${rec.employee.first_name} ${rec.employee.last_name}`
                                : "Unknown Employee"}
                            </span>
                            <span className="text-xs text-slate-400">
                              {rec.employee?.employee_code || "—"} •{" "}
                              {rec.employee?.designation || "—"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Department / Branch */}
                      <td className="px-6 py-4 text-xs text-slate-600">
                        <div className="font-medium text-slate-800">
                          {rec.employee?.department_name || "—"}
                        </div>
                        <div className="text-slate-400">
                          {rec.branch?.name || rec.employee?.branch_name || "—"}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4 text-xs font-medium text-slate-700">
                        {rec.work_date}
                      </td>

                      {/* Clock In */}
                      <td className="px-6 py-4 text-xs text-slate-700 font-medium">
                        {formatTime(rec.check_in_at)}
                      </td>

                      {/* Clock Out */}
                      <td className="px-6 py-4 text-xs">
                        {rec.check_out_at ? (
                          <span className="text-slate-700 font-medium">
                            {formatTime(rec.check_out_at)}
                          </span>
                        ) : rec.check_in_at ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            In Progress
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                        {calculateDuration(rec.check_in_at, rec.check_out_at)}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">{getStatusBadge(rec.status)}</td>

                      {/* Notes */}
                      <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                        {rec.notes || "—"}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!rec.check_out_at && rec.check_in_at && canUpdate && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setQuickClockOutRecord(rec);
                                setIsQuickClockOutOpen(true);
                              }}
                              className="text-xs h-7 px-2 text-rose-600 border-rose-200 hover:bg-rose-50"
                              title="Clock out"
                            >
                              <LogOut className="h-3.5 w-3.5 mr-1" /> Clock Out
                            </Button>
                          )}
                          {canUpdate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(rec)}
                              className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
                              title="Edit attendance"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteModal(rec)}
                              className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                              title="Delete record"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {attendanceData.meta.total_pages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 text-xs text-slate-600">
              <div>
                Showing page {attendanceData.meta.page} of {attendanceData.meta.total_pages} (
                {attendanceData.meta.total} records total)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-semibold text-slate-800">
                  {currentPage} / {attendanceData.meta.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= attendanceData.meta.total_pages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="h-8 px-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL: Mark Attendance (Create) */}
      <Modal
        isOpen={isMarkOpen}
        onClose={() => setIsMarkOpen(false)}
        title="Mark Attendance Record"
      >
        <form onSubmit={handleMarkSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs">
              {formError}
            </div>
          )}

          {/* Employee */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Employee *</Label>
            <select
              value={formEmployeeId}
              onChange={(e) => setFormEmployeeId(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Select Employee...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} ({e.employee_code}) — {e.designation}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Work Date */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Work Date *</Label>
              <Input
                type="date"
                value={formWorkDate}
                onChange={(e) => setFormWorkDate(e.target.value)}
                required
                className="mt-1 text-xs"
              />
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Status *</Label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as AttendanceStatus)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-primary-500"
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Check In */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Clock In Time</Label>
              <Input
                type="datetime-local"
                value={formCheckInAt}
                onChange={(e) => setFormCheckInAt(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            {/* Check Out */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Clock Out Time <span className="font-normal text-slate-500">(Optional — 2nd Half / Shift End)</span>
              </Label>
              <Input
                type="datetime-local"
                value={formCheckOutAt}
                onChange={(e) => setFormCheckOutAt(e.target.value)}
                className="mt-1 text-xs"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Leave blank on 1st half / initial check-in. Clock-out can be recorded at the end of the shift.
              </p>
            </div>
          </div>

          {/* Branch */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Branch (Optional)</Label>
            <select
              value={formBranchId}
              onChange={(e) => setFormBranchId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Default Employee Branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Notes / Remarks</Label>
            <textarea
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="e.g. Remote work, client site visit..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsMarkOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Record"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Edit Attendance */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Attendance Record"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs">
              {formError}
            </div>
          )}

          {editingRecord?.employee && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-800 block">
                {editingRecord.employee.first_name} {editingRecord.employee.last_name}
              </span>
              <span className="text-slate-500">
                {editingRecord.employee.employee_code} • {editingRecord.employee.designation}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Work Date */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Work Date *</Label>
              <Input
                type="date"
                value={formWorkDate}
                onChange={(e) => setFormWorkDate(e.target.value)}
                required
                className="mt-1 text-xs"
              />
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Status *</Label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as AttendanceStatus)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-primary-500"
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Check In */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Clock In Time</Label>
              <Input
                type="datetime-local"
                value={formCheckInAt}
                onChange={(e) => setFormCheckInAt(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            {/* Check Out */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Clock Out Time <span className="font-normal text-slate-500">(2nd Half / Shift End)</span>
              </Label>
              <Input
                type="datetime-local"
                value={formCheckOutAt}
                onChange={(e) => setFormCheckOutAt(e.target.value)}
                className="mt-1 text-xs"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Set employee departure time to finalize day&apos;s working hours.
              </p>
            </div>
          </div>

          {/* Branch */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Branch</Label>
            <select
              value={formBranchId}
              onChange={(e) => setFormBranchId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-primary-500"
            >
              <option value="">No Branch Assigned</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Notes / Remarks</Label>
            <textarea
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update Record"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Quick Clock Out Confirmation */}
      <Modal
        isOpen={isQuickClockOutOpen}
        onClose={() => setIsQuickClockOutOpen(false)}
        title="Confirm Clock Out"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to clock out for{" "}
            <span className="font-semibold text-slate-900">
              {quickClockOutRecord?.employee?.first_name}{" "}
              {quickClockOutRecord?.employee?.last_name}
            </span>
            ?
          </p>
          <div>
            <Label className="text-xs text-slate-500">Optional Notes</Label>
            <Input
              placeholder="e.g. Completed today's sprint tasks..."
              value={clockNotes}
              onChange={(e) => setClockNotes(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsQuickClockOutOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleQuickClockOut(quickClockOutRecord?.id)}
              disabled={isClockingOut}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isClockingOut ? "Recording..." : "Confirm Clock Out"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Delete Confirmation */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Delete Attendance Record"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to permanently delete the attendance record for{" "}
            <span className="font-semibold text-slate-900">
              {deletingRecord?.employee?.first_name} {deletingRecord?.employee?.last_name}
            </span>{" "}
            on <span className="font-semibold text-slate-900">{deletingRecord?.work_date}</span>?
          </p>
          <p className="text-xs text-rose-600 font-medium">
            This action cannot be undone and will be recorded in the audit log.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete Record"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
