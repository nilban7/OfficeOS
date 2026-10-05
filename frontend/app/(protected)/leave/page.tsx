"use client";

import * as React from "react";
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Filter,
  Check,
  X,
  Calendar,
  Layers,
  Edit2,
  Trash2,
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
import type { Employee, PaginatedEmployees } from "@/types/employee";
import type {
  Holiday,
  HolidayCreateInput,
  HolidayUpdateInput,
  LeaveRequest,
  LeaveRequestCreateInput,
  LeaveSummary,
  LeaveType,
  LeaveTypeCreateInput,
  LeaveTypeUpdateInput,
  PaginatedLeaveRequests,
} from "@/types/leave";

export default function LeavePage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canViewLeave = permissions.includes("leave.view") || permissions.includes("leave:read");
  const canRequestLeave = permissions.includes("leave.request") || permissions.includes("leave.manage");
  const canApproveLeave = permissions.includes("leave.approve") || permissions.includes("leave.manage");
  const canCancelLeave = permissions.includes("leave.cancel") || permissions.includes("leave.manage");
  const canManageLeaveTypes = permissions.includes("leave_types.manage") || permissions.includes("leave.manage");
  const canViewHolidays = permissions.includes("holidays.view") || permissions.includes("leave.view");
  const canManageHolidays = permissions.includes("holidays.manage");

  // Tabs: 'my-leave' | 'approvals' | 'types' | 'holidays'
  const [activeTab, setActiveTab] = React.useState<"my-leave" | "approvals" | "types" | "holidays">("my-leave");

  // Data States
  const [summary, setSummary] = React.useState<LeaveSummary | null>(null);
  const [leaveTypes, setLeaveTypes] = React.useState<LeaveType[]>([]);
  const [myRequests, setMyRequests] = React.useState<LeaveRequest[]>([]);
  const [orgRequests, setOrgRequests] = React.useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  const [branches, setBranches] = React.useState<BranchResponse[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);

  // Loading & Error States
  const [isLoading, setIsLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = React.useState<string | null>(null);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // Filters
  const [myStatusFilter, setMyStatusFilter] = React.useState<string>("all");
  const [approvalStatusFilter, setApprovalStatusFilter] = React.useState<string>("pending");
  const [holidayYearFilter, setHolidayYearFilter] = React.useState<string>(new Date().getFullYear().toString());

  // Modals
  const [isRequestModalOpen, setIsRequestModalOpen] = React.useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = React.useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = React.useState(false);
  const [isLeaveTypeModalOpen, setIsLeaveTypeModalOpen] = React.useState(false);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = React.useState(false);
  const [isDeleteHolidayModalOpen, setIsDeleteHolidayModalOpen] = React.useState(false);

  // Selected Records for Modals
  const [selectedRequest, setSelectedRequest] = React.useState<LeaveRequest | null>(null);
  const [selectedLeaveType, setSelectedLeaveType] = React.useState<LeaveType | null>(null);
  const [selectedHoliday, setSelectedHoliday] = React.useState<Holiday | null>(null);

  // Action / Form States
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);

  // Form Fields - Request Leave
  const [reqTypeId, setReqTypeId] = React.useState("");
  const [reqStartDate, setReqStartDate] = React.useState("");
  const [reqEndDate, setReqEndDate] = React.useState("");
  const [reqReason, setReqReason] = React.useState("");
  const [reqEmployeeId, setReqEmployeeId] = React.useState("");

  // Form Fields - Approval/Reject/Cancel comments
  const [reviewerComment, setReviewerComment] = React.useState("");
  const [cancelReason, setCancelReason] = React.useState("");

  // Form Fields - Leave Type
  const [ltName, setLtName] = React.useState("");
  const [ltCode, setLtCode] = React.useState("");
  const [ltDescription, setLtDescription] = React.useState("");
  const [ltAnnualAllocation, setLtAnnualAllocation] = React.useState("0");
  const [ltIsPaid, setLtIsPaid] = React.useState(true);
  const [ltRequiresApproval, setLtRequiresApproval] = React.useState(true);
  const [ltIsActive, setLtIsActive] = React.useState(true);

  // Form Fields - Holiday
  const [holName, setHolName] = React.useState("");
  const [holDate, setHolDate] = React.useState("");
  const [holBranchId, setHolBranchId] = React.useState("");
  const [holDescription, setHolDescription] = React.useState("");
  const [holIsOptional, setHolIsOptional] = React.useState(false);

  // Calculate inclusive calendar days for Request form
  const calculatedDays = React.useMemo(() => {
    if (!reqStartDate || !reqEndDate) return 0;
    const start = new Date(reqStartDate);
    const end = new Date(reqEndDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    const diffTime = end.getTime() - start.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [reqStartDate, reqEndDate]);

  // Load all initial data
  const fetchData = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading(true);
    setPageError(null);

    try {
      const orgId = currentOrganization.id;

      // 1. Fetch Summary, Leave Types, Holidays, Branches, and Employees
      const [summaryRes, typesRes, holidaysRes, branchRes, empRes] = await Promise.allSettled([
        apiClient.get<LeaveSummary>(API_ENDPOINTS.leave.summary, { organizationId: orgId }),
        apiClient.get<LeaveType[]>(API_ENDPOINTS.leave.types, { organizationId: orgId }),
        apiClient.get<Holiday[]>(API_ENDPOINTS.leave.holidays, {
          organizationId: orgId,
          params: { year: parseInt(holidayYearFilter, 10) || new Date().getFullYear() },
        }),
        apiClient.get<BranchResponse[]>(API_ENDPOINTS.organizations.currentBranches, { organizationId: orgId }),
        apiClient.get<PaginatedEmployees>(API_ENDPOINTS.employees.list, {
          organizationId: orgId,
          params: { page_size: 100 },
        }),
      ]);

      if (summaryRes.status === "fulfilled" && summaryRes.value) {
        setSummary(summaryRes.value);
      }
      if (typesRes.status === "fulfilled" && typesRes.value) {
        setLeaveTypes(typesRes.value);
      }
      if (holidaysRes.status === "fulfilled" && holidaysRes.value) {
        setHolidays(holidaysRes.value);
      }
      if (branchRes.status === "fulfilled" && branchRes.value) {
        setBranches(branchRes.value);
      }
      if (empRes.status === "fulfilled" && empRes.value) {
        setEmployees(empRes.value.items || []);
      }

      // 2. Fetch My Requests
      try {
        const myReqRes = await apiClient.get<PaginatedLeaveRequests | LeaveRequest[]>(API_ENDPOINTS.leave.requests, {
          organizationId: orgId,
        });
        const items = Array.isArray(myReqRes) ? myReqRes : (myReqRes && "items" in myReqRes ? myReqRes.items : []);
        setMyRequests(items);
      } catch {
        setMyRequests([]);
      }

      // 3. If manager/admin, fetch Org Requests
      if (canApproveLeave || canManageLeaveTypes) {
        try {
          const orgReqRes = await apiClient.get<PaginatedLeaveRequests | LeaveRequest[]>(API_ENDPOINTS.leave.requests, {
            organizationId: orgId,
          });
          const items = Array.isArray(orgReqRes) ? orgReqRes : (orgReqRes && "items" in orgReqRes ? orgReqRes.items : []);
          setOrgRequests(items);
        } catch {
          setOrgRequests([]);
        }
      }
    } catch (err) {
      if (err instanceof ApiException) {
        setPageError(err.message);
      } else {
        setPageError("Failed to load leave and holidays data. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, canApproveLeave, canManageLeaveTypes, holidayYearFilter]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Request Leave Submit
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;
    if (!reqTypeId || !reqStartDate || !reqEndDate) {
      setModalError("Please select a leave type and valid start and end dates.");
      return;
    }
    if (new Date(reqStartDate) > new Date(reqEndDate)) {
      setModalError("End date cannot be earlier than start date.");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const payload: LeaveRequestCreateInput = {
        leave_type_id: reqTypeId,
        start_date: reqStartDate,
        end_date: reqEndDate,
        reason: reqReason.trim() || undefined,
        employee_id: reqEmployeeId || undefined,
      };

      await apiClient.post<LeaveRequest>(API_ENDPOINTS.leave.requests, payload, {
        organizationId: currentOrganization.id,
      });

      setGlobalSuccess("Leave request submitted successfully.");
      setIsRequestModalOpen(false);
      resetRequestForm();
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to submit leave request.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetRequestForm = () => {
    setReqTypeId("");
    setReqStartDate("");
    setReqEndDate("");
    setReqReason("");
    setReqEmployeeId("");
    setModalError(null);
  };

  // Handle Cancel Leave Request
  const handleCancelRequest = async () => {
    if (!currentOrganization || !selectedRequest) return;
    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.leave.cancel(selectedRequest.id),
        { reason: cancelReason.trim() || undefined },
        { organizationId: currentOrganization.id }
      );

      setGlobalSuccess("Leave request cancelled successfully.");
      setIsCancelModalOpen(false);
      setSelectedRequest(null);
      setCancelReason("");
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to cancel leave request.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Approve Request
  const handleApproveRequest = async () => {
    if (!currentOrganization || !selectedRequest) return;
    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.leave.approve(selectedRequest.id),
        { reviewer_comment: reviewerComment.trim() || undefined },
        { organizationId: currentOrganization.id }
      );

      setGlobalSuccess(`Leave request for ${selectedRequest.employee?.first_name || "employee"} approved.`);
      setIsApproveModalOpen(false);
      setSelectedRequest(null);
      setReviewerComment("");
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to approve leave request.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reject Request
  const handleRejectRequest = async () => {
    if (!currentOrganization || !selectedRequest) return;
    if (!reviewerComment.trim()) {
      setModalError("Rejection reason or comment is required.");
      return;
    }
    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.leave.reject(selectedRequest.id),
        { reviewer_comment: reviewerComment.trim() },
        { organizationId: currentOrganization.id }
      );

      setGlobalSuccess(`Leave request for ${selectedRequest.employee?.first_name || "employee"} rejected.`);
      setIsRejectModalOpen(false);
      setSelectedRequest(null);
      setReviewerComment("");
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to reject leave request.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Leave Type Create/Edit Submit
  const handleSaveLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;
    if (!ltName.trim() || !ltCode.trim()) {
      setModalError("Name and Code are required.");
      return;
    }

    const alloc = parseFloat(ltAnnualAllocation);
    if (isNaN(alloc) || alloc < 0) {
      setModalError("Annual allocation must be 0 or a positive number.");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      if (selectedLeaveType) {
        const payload: LeaveTypeUpdateInput = {
          name: ltName.trim(),
          code: ltCode.trim().toUpperCase(),
          description: ltDescription.trim() || undefined,
          annual_allocation: alloc,
          is_paid: ltIsPaid,
          requires_approval: ltRequiresApproval,
          is_active: ltIsActive,
        };
        await apiClient.patch(
          API_ENDPOINTS.leave.typeDetail(selectedLeaveType.id),
          payload,
          { organizationId: currentOrganization.id }
        );
        setGlobalSuccess("Leave type updated successfully.");
      } else {
        const payload: LeaveTypeCreateInput = {
          name: ltName.trim(),
          code: ltCode.trim().toUpperCase(),
          description: ltDescription.trim() || undefined,
          annual_allocation: alloc,
          is_paid: ltIsPaid,
          requires_approval: ltRequiresApproval,
          is_active: ltIsActive,
        };
        await apiClient.post(
          API_ENDPOINTS.leave.types,
          payload,
          { organizationId: currentOrganization.id }
        );
        setGlobalSuccess("Leave type created successfully.");
      }

      setIsLeaveTypeModalOpen(false);
      setSelectedLeaveType(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to save leave type.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Holiday Create/Edit Submit
  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holName.trim() || !holDate) {
      setModalError("Holiday name and date are required.");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      if (selectedHoliday) {
        const payload: HolidayUpdateInput = {
          name: holName.trim(),
          holiday_date: holDate,
          branch_id: holBranchId || null,
          description: holDescription.trim() || undefined,
          is_optional: holIsOptional,
        };
        await apiClient.patch(
          API_ENDPOINTS.leave.holidayDetail(selectedHoliday.id),
          payload,
          { organizationId: currentOrganization!.id }
        );
        setGlobalSuccess("Holiday updated successfully.");
      } else {
        const payload: HolidayCreateInput = {
          name: holName.trim(),
          holiday_date: holDate,
          branch_id: holBranchId || undefined,
          description: holDescription.trim() || undefined,
          is_optional: holIsOptional,
        };
        await apiClient.post(
          API_ENDPOINTS.leave.holidays,
          payload,
          { organizationId: currentOrganization!.id }
        );
        setGlobalSuccess("Holiday added successfully.");
      }

      setIsHolidayModalOpen(false);
      setSelectedHoliday(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to save holiday.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Holiday Delete
  const handleDeleteHoliday = async () => {
    if (!currentOrganization || !selectedHoliday) return;
    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiClient.delete(
        API_ENDPOINTS.leave.holidayDetail(selectedHoliday.id),
        { organizationId: currentOrganization.id }
      );
      setGlobalSuccess("Holiday deleted successfully.");
      setIsDeleteHolidayModalOpen(false);
      setSelectedHoliday(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to delete holiday.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered lists
  const filteredMyRequests = React.useMemo(() => {
    if (myStatusFilter === "all") return myRequests;
    return myRequests.filter((r) => r.status === myStatusFilter);
  }, [myRequests, myStatusFilter]);

  const filteredApprovalRequests = React.useMemo(() => {
    if (approvalStatusFilter === "all") return orgRequests;
    return orgRequests.filter((r) => r.status === approvalStatusFilter);
  }, [orgRequests, approvalStatusFilter]);

  // Helper Badge Render
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="success" className="capitalize">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="capitalize">Rejected</Badge>;
      case "cancelled":
        return <Badge variant="secondary" className="capitalize">Cancelled</Badge>;
      case "pending":
      default:
        return <Badge variant="warning" className="capitalize">Pending</Badge>;
    }
  };

  // Guard: Org Loading or No Org
  if (isOrgLoading || (isLoading && !summary && leaveTypes.length === 0)) {
    return (
      <div className="p-8">
        <LoadingState message="Loading leave balances and requests..." />
      </div>
    );
  }

  if (!canViewLeave && !canViewHolidays) {
    return (
      <div className="p-8">
        <ErrorState
          title="Access Denied"
          message="You do not have permission to view leave records or holidays."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Leave & Holidays</h1>
          <p className="text-sm text-slate-500">
            Track leave balances, submit leave requests, and manage company holidays.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canRequestLeave && (
            <Button
              onClick={() => {
                resetRequestForm();
                setIsRequestModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Request Leave
            </Button>
          )}
          {canManageLeaveTypes && (
            <Button
              variant="outline"
              onClick={() => {
                setSelectedLeaveType(null);
                setLtName("");
                setLtCode("");
                setLtDescription("");
                setLtAnnualAllocation("10");
                setLtIsPaid(true);
                setLtRequiresApproval(true);
                setLtIsActive(true);
                setModalError(null);
                setIsLeaveTypeModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Layers className="h-4 w-4" />
              Add Leave Type
            </Button>
          )}
          {canManageHolidays && (
            <Button
              variant="outline"
              onClick={() => {
                setSelectedHoliday(null);
                setHolName("");
                setHolDate(new Date().toISOString().split("T")[0] || "");
                setHolBranchId("");
                setHolDescription("");
                setHolIsOptional(false);
                setModalError(null);
                setIsHolidayModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Calendar className="h-4 w-4" />
              Add Holiday
            </Button>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {globalSuccess && (
        <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200 flex items-center justify-between text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-medium">{globalSuccess}</span>
          </div>
          <button
            onClick={() => setGlobalSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {globalError && (
        <div className="rounded-lg bg-rose-50 p-4 border border-rose-200 flex items-center justify-between text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-rose-600" />
            <span className="text-sm font-medium">{globalError}</span>
          </div>
          <button
            onClick={() => setGlobalError(null)}
            className="text-rose-600 hover:text-rose-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pageError && (
        <ErrorState
          title="Error Loading Data"
          message={pageError}
          onRetry={fetchData}
        />
      )}

      {/* Summary KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Available Days</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {summary ? summary.total_available_days : "—"}
            </div>
            <p className="text-xs text-slate-500 mt-1">Remaining annual leave allocation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Used Days</CardTitle>
            <CalendarDays className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {summary ? summary.total_used_days : "—"}
            </div>
            <p className="text-xs text-slate-500 mt-1">Approved taken leave this period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending Requests</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {summary ? summary.total_pending_days : "—"}
            </div>
            <p className="text-xs text-slate-500 mt-1">Days awaiting manager review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Holidays ({holidayYearFilter})</CardTitle>
            <Calendar className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{holidays.length}</div>
            <p className="text-xs text-slate-500 mt-1">Public & branch holidays scheduled</p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("my-leave")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "my-leave"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
        >
          My Leave
        </button>

        {canApproveLeave && (
          <button
            onClick={() => setActiveTab("approvals")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "approvals"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Approval Queue
          </button>
        )}

        <button
          onClick={() => setActiveTab("holidays")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "holidays"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
        >
          Holidays
        </button>

        {canManageLeaveTypes && (
          <button
            onClick={() => setActiveTab("types")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "types"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Leave Types
          </button>
        )}
      </div>

      {/* TAB 1: MY LEAVE */}
      {activeTab === "my-leave" && (
        <div className="space-y-6">
          {summary && summary.balances_by_type.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {summary.balances_by_type.map((b) => (
                <div key={b.leave_type_id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 text-sm">{b.leave_type_name}</span>
                    <Badge variant="outline" className="text-xs uppercase">{b.leave_type_code}</Badge>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between text-xs text-slate-500">
                    <div>
                      <span className="text-lg font-bold text-slate-900">{b.available_days}</span>
                      <span className="ml-1">available</span>
                    </div>
                    <div>
                      <span>{b.used_days} used</span>
                      <span className="mx-1">/</span>
                      <span>{b.annual_allocation} total</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-600">Status:</span>
              <select
                value={myStatusFilter}
                onChange={(e) => setMyStatusFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="text-xs text-slate-500">
              Showing {filteredMyRequests.length} request(s)
            </div>
          </div>

          {/* My Requests Table */}
          {filteredMyRequests.length === 0 ? (
            <EmptyState
              title="No Leave Requests"
              description={
                myStatusFilter === "all"
                  ? "You have not submitted any leave requests yet."
                  : `No leave requests matching status '${myStatusFilter}'.`
              }
              actionLabel={canRequestLeave ? "Submit Request" : undefined}
              onAction={
                canRequestLeave
                  ? () => {
                      resetRequestForm();
                      setIsRequestModalOpen(true);
                    }
                  : undefined
              }
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Leave Type</th>
                    <th className="px-6 py-3">Dates</th>
                    <th className="px-6 py-3">Days</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Reason / Note</th>
                    <th className="px-6 py-3">Reviewer</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMyRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {req.leave_type?.name || "Leave"}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          ({req.leave_type?.code || "N/A"})
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600">
                        {req.start_date} <span className="text-slate-400">to</span> {req.end_date}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{req.total_days}</td>
                      <td className="px-6 py-4">{getStatusBadge(req.status)}</td>
                      <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-500">
                        {req.reason || "—"}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {req.reviewer ? (
                          <div>
                            <span className="font-medium text-slate-700">
                              {req.reviewer.first_name} {req.reviewer.last_name}
                            </span>
                            {req.reviewer_comment && (
                              <p className="text-xs italic text-slate-400 mt-0.5">
                                &ldquo;{req.reviewer_comment}&rdquo;
                              </p>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {req.status === "pending" && canCancelLeave && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(req);
                              setCancelReason("");
                              setModalError(null);
                              setIsCancelModalOpen(true);
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: APPROVAL QUEUE */}
      {activeTab === "approvals" && canApproveLeave && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-600">Filter Status:</span>
              <select
                value={approvalStatusFilter}
                onChange={(e) => setApprovalStatusFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
                <option value="all">All Requests</option>
              </select>
            </div>
            <div className="text-xs text-slate-500">
              Total {filteredApprovalRequests.length} request(s)
            </div>
          </div>

          {filteredApprovalRequests.length === 0 ? (
            <EmptyState
              title="No Pending Approvals"
              description={
                approvalStatusFilter === "pending"
                  ? "There are no leave requests waiting for your review."
                  : `No leave requests matching status '${approvalStatusFilter}'.`
              }
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Employee</th>
                    <th className="px-6 py-3">Leave Type</th>
                    <th className="px-6 py-3">Duration</th>
                    <th className="px-6 py-3">Days</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Reason</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredApprovalRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">
                          {req.employee ? `${req.employee.first_name} ${req.employee.last_name}` : "Unknown"}
                        </div>
                        <div className="text-xs text-slate-400">
                          {req.employee?.employee_code} • {req.employee?.designation}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {req.leave_type?.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600">
                        {req.start_date} <span className="text-slate-400">to</span> {req.end_date}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{req.total_days}</td>
                      <td className="px-6 py-4">{getStatusBadge(req.status)}</td>
                      <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-500">
                        {req.reason || "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {req.status === "pending" ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                              onClick={() => {
                                setSelectedRequest(req);
                                setReviewerComment("");
                                setModalError(null);
                                setIsApproveModalOpen(true);
                              }}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-rose-700 border-rose-300 hover:bg-rose-50"
                              onClick={() => {
                                setSelectedRequest(req);
                                setReviewerComment("");
                                setModalError(null);
                                setIsRejectModalOpen(true);
                              }}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Completed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HOLIDAYS */}
      {activeTab === "holidays" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-600">Year:</span>
              <select
                value={holidayYearFilter}
                onChange={(e) => setHolidayYearFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>
            {canManageHolidays && (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedHoliday(null);
                  setHolName("");
                  setHolDate(new Date().toISOString().split("T")[0] || "");
                  setHolBranchId("");
                  setHolDescription("");
                  setHolIsOptional(false);
                  setModalError(null);
                  setIsHolidayModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Holiday
              </Button>
            )}
          </div>

          {holidays.length === 0 ? (
            <EmptyState
              title="No Holidays Listed"
              description={`No organization holidays found for ${holidayYearFilter}.`}
              actionLabel={canManageHolidays ? "Add Holiday" : undefined}
              onAction={
                canManageHolidays
                  ? () => {
                      setSelectedHoliday(null);
                      setHolName("");
                      setHolDate(new Date().toISOString().split("T")[0] || "");
                      setHolBranchId("");
                      setHolDescription("");
                      setHolIsOptional(false);
                      setModalError(null);
                      setIsHolidayModalOpen(true);
                    }
                  : undefined
              }
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Holiday Name</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Scope / Branch</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Description</th>
                    {canManageHolidays && <th className="px-6 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holidays.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900">{h.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700 font-medium">
                        {h.holiday_date}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">
                        {h.branch ? (
                          <Badge variant="outline" className="text-xs font-normal">
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
                          <Badge variant="default" className="text-xs font-normal bg-purple-100 text-purple-800 border-purple-200">
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
                              onClick={() => {
                                setSelectedHoliday(h);
                                setHolName(h.name);
                                setHolDate(h.holiday_date);
                                setHolBranchId(h.branch_id || "");
                                setHolDescription(h.description || "");
                                setHolIsOptional(h.is_optional);
                                setModalError(null);
                                setIsHolidayModalOpen(true);
                              }}
                              className="text-slate-400 hover:text-blue-600 p-1 rounded"
                              title="Edit Holiday"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedHoliday(h);
                                setModalError(null);
                                setIsDeleteHolidayModalOpen(true);
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded"
                              title="Delete Holiday"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
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

      {/* TAB 4: LEAVE TYPES */}
      {activeTab === "types" && canManageLeaveTypes && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Configure leave policies, quotas, and approvals for your organization.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setSelectedLeaveType(null);
                setLtName("");
                setLtCode("");
                setLtDescription("");
                setLtAnnualAllocation("10");
                setLtIsPaid(true);
                setLtRequiresApproval(true);
                setLtIsActive(true);
                setModalError(null);
                setIsLeaveTypeModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Leave Type
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3">Leave Type</th>
                  <th className="px-6 py-3">Code</th>
                  <th className="px-6 py-3">Annual Days</th>
                  <th className="px-6 py-3">Compensation</th>
                  <th className="px-6 py-3">Approval</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaveTypes.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{t.name}</div>
                      {t.description && <div className="text-xs text-slate-400">{t.description}</div>}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{t.code}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">{t.annual_allocation}</td>
                    <td className="px-6 py-4">
                      {t.is_paid ? (
                        <Badge variant="success" className="text-xs">Paid</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Unpaid</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600">
                      {t.requires_approval ? "Required" : "Auto-approved"}
                    </td>
                    <td className="px-6 py-4">
                      {t.is_active ? (
                        <Badge variant="default" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedLeaveType(t);
                          setLtName(t.name);
                          setLtCode(t.code);
                          setLtDescription(t.description || "");
                          setLtAnnualAllocation(t.annual_allocation.toString());
                          setLtIsPaid(t.is_paid);
                          setLtRequiresApproval(t.requires_approval);
                          setLtIsActive(t.is_active);
                          setModalError(null);
                          setIsLeaveTypeModalOpen(true);
                        }}
                        className="text-slate-400 hover:text-blue-600 p-1 rounded"
                        title="Edit Leave Type"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODALS */}
      {/* ==================================================== */}

      {/* 1. Request Leave Modal */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Request Leave"
        description="Select a leave type and duration for your request."
      >
        <form onSubmit={handleCreateRequest} className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}

          {employees.length > 0 && (
            <div>
              <Label htmlFor="req-emp">Submit for Employee</Label>
              <select
                id="req-emp"
                value={reqEmployeeId}
                onChange={(e) => setReqEmployeeId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Self (My Linked Account)</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Choose &quot;Self&quot; if your account is linked to an employee profile, or select a specific employee to submit on their behalf.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="req-type">Leave Type *</Label>
            <select
              id="req-type"
              required
              value={reqTypeId}
              onChange={(e) => setReqTypeId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select Leave Type...</option>
              {leaveTypes
                .filter((t) => t.is_active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code}) — {t.annual_allocation} days/yr
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="req-start">Start Date *</Label>
              <Input
                id="req-start"
                type="date"
                required
                value={reqStartDate}
                onChange={(e) => setReqStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="req-end">End Date *</Label>
              <Input
                id="req-end"
                type="date"
                required
                value={reqEndDate}
                onChange={(e) => setReqEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {calculatedDays > 0 && (
            <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-800 font-medium border border-blue-100 flex items-center justify-between">
              <span>Calculated Duration:</span>
              <span className="text-sm font-bold">{calculatedDays} day(s) (inclusive)</span>
            </div>
          )}

          <div>
            <Label htmlFor="req-reason">Reason (Optional)</Label>
            <textarea
              id="req-reason"
              rows={3}
              value={reqReason}
              onChange={(e) => setReqReason(e.target.value)}
              placeholder="Provide a brief explanation for your leave..."
              className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRequestModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !reqTypeId || !reqStartDate || !reqEndDate}>
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. Cancel Request Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Leave Request"
        description="Are you sure you want to cancel this pending leave request?"
      >
        <div className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          {selectedRequest && (
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700 space-y-1 border border-slate-200">
              <div>
                <span className="font-semibold">Type:</span> {selectedRequest.leave_type?.name}
              </div>
              <div>
                <span className="font-semibold">Dates:</span> {selectedRequest.start_date} to {selectedRequest.end_date} ({selectedRequest.total_days} days)
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="cancel-reason">Cancellation Reason (Optional)</Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Plans changed"
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancelRequest}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 3. Approve Request Modal */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Approve Leave Request"
        description="Confirm approval of this employee leave request."
      >
        <div className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          {selectedRequest && (
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700 space-y-1 border border-slate-200">
              <div>
                <span className="font-semibold">Employee:</span> {selectedRequest.employee?.first_name} {selectedRequest.employee?.last_name} ({selectedRequest.employee?.employee_code})
              </div>
              <div>
                <span className="font-semibold">Leave Type:</span> {selectedRequest.leave_type?.name}
              </div>
              <div>
                <span className="font-semibold">Duration:</span> {selectedRequest.start_date} to {selectedRequest.end_date} ({selectedRequest.total_days} days)
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="appr-comment">Reviewer Comment (Optional)</Label>
            <Input
              id="appr-comment"
              value={reviewerComment}
              onChange={(e) => setReviewerComment(e.target.value)}
              placeholder="e.g. Approved, coverage arranged"
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsApproveModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApproveRequest}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Approving..." : "Approve Leave"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 4. Reject Request Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Leave Request"
        description="Provide a reason for rejecting this leave request."
      >
        <div className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          {selectedRequest && (
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700 space-y-1 border border-slate-200">
              <div>
                <span className="font-semibold">Employee:</span> {selectedRequest.employee?.first_name} {selectedRequest.employee?.last_name}
              </div>
              <div>
                <span className="font-semibold">Duration:</span> {selectedRequest.start_date} to {selectedRequest.end_date} ({selectedRequest.total_days} days)
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="rej-comment">Rejection Reason *</Label>
            <Input
              id="rej-comment"
              required
              value={reviewerComment}
              onChange={(e) => setReviewerComment(e.target.value)}
              placeholder="e.g. Insufficient team coverage during project release"
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRejectModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRejectRequest}
              disabled={isSubmitting || !reviewerComment.trim()}
            >
              {isSubmitting ? "Rejecting..." : "Reject Leave"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 5. Create / Edit Leave Type Modal */}
      <Modal
        isOpen={isLeaveTypeModalOpen}
        onClose={() => setIsLeaveTypeModalOpen(false)}
        title={selectedLeaveType ? "Edit Leave Type" : "Add Leave Type"}
        description="Define leave entitlement policy for employees."
      >
        <form onSubmit={handleSaveLeaveType} className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="lt-name">Leave Name *</Label>
              <Input
                id="lt-name"
                required
                value={ltName}
                onChange={(e) => setLtName(e.target.value)}
                placeholder="e.g. Annual Leave"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="lt-code">Code *</Label>
              <Input
                id="lt-code"
                required
                value={ltCode}
                onChange={(e) => setLtCode(e.target.value)}
                placeholder="e.g. AL"
                className="mt-1 uppercase"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="lt-alloc">Annual Allocation (Days) *</Label>
            <Input
              id="lt-alloc"
              type="number"
              step="0.5"
              min="0"
              required
              value={ltAnnualAllocation}
              onChange={(e) => setLtAnnualAllocation(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="lt-desc">Description (Optional)</Label>
            <Input
              id="lt-desc"
              value={ltDescription}
              onChange={(e) => setLtDescription(e.target.value)}
              placeholder="e.g. Standard paid vacation entitlement"
              className="mt-1"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={ltIsPaid}
                onChange={(e) => setLtIsPaid(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Paid Leave</span>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={ltRequiresApproval}
                onChange={(e) => setLtRequiresApproval(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Requires Manager Approval</span>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={ltIsActive}
                onChange={(e) => setLtIsActive(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Active Policy</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsLeaveTypeModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !ltName || !ltCode}>
              {isSubmitting ? "Saving..." : selectedLeaveType ? "Update Type" : "Create Type"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 6. Create / Edit Holiday Modal */}
      <Modal
        isOpen={isHolidayModalOpen}
        onClose={() => setIsHolidayModalOpen(false)}
        title={selectedHoliday ? "Edit Holiday" : "Add Holiday"}
        description="Schedule a company or branch holiday."
      >
        <form onSubmit={handleSaveHoliday} className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}

          <div>
            <Label htmlFor="hol-name">Holiday Name *</Label>
            <Input
              id="hol-name"
              required
              value={holName}
              onChange={(e) => setHolName(e.target.value)}
              placeholder="e.g. New Year's Day"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="hol-date">Date *</Label>
              <Input
                id="hol-date"
                type="date"
                required
                value={holDate}
                onChange={(e) => setHolDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="hol-branch">Branch Scope</Label>
              <select
                id="hol-branch"
                value={holBranchId}
                onChange={(e) => setHolBranchId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">All Branches (Org-wide)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="hol-desc">Description (Optional)</Label>
            <Input
              id="hol-desc"
              value={holDescription}
              onChange={(e) => setHolDescription(e.target.value)}
              placeholder="e.g. Official national public holiday"
              className="mt-1"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={holIsOptional}
                onChange={(e) => setHolIsOptional(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Optional / Restricted Holiday</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsHolidayModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !holName || !holDate}>
              {isSubmitting ? "Saving..." : selectedHoliday ? "Update Holiday" : "Create Holiday"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 7. Delete Holiday Modal */}
      <Modal
        isOpen={isDeleteHolidayModalOpen}
        onClose={() => setIsDeleteHolidayModalOpen(false)}
        title="Delete Holiday"
        description="Are you sure you want to remove this holiday from the schedule?"
      >
        <div className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          {selectedHoliday && (
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700 space-y-1 border border-slate-200">
              <div>
                <span className="font-semibold">Name:</span> {selectedHoliday.name}
              </div>
              <div>
                <span className="font-semibold">Date:</span> {selectedHoliday.holiday_date}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteHolidayModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteHoliday}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Confirm Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
