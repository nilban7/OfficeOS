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
  PartyPopper,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { HolidayCalendar } from "@/components/leave/holiday-calendar";
import { LeaveDatePickerModal } from "@/components/leave/leave-date-picker-modal";
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
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = React.useState<string>("self");
  const [myStatusFilter, setMyStatusFilter] = React.useState<string>("all");
  const [approvalStatusFilter, setApprovalStatusFilter] = React.useState<string>("pending");
  const [holidayYearFilter, setHolidayYearFilter] = React.useState<string>(new Date().getFullYear().toString());

  const [isRequestModalOpen, setIsRequestModalOpen] = React.useState(false);
  const [isDatePickerModalOpen, setIsDatePickerModalOpen] = React.useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const [isRequestCancellationModalOpen, setIsRequestCancellationModalOpen] = React.useState(false);
  const [isApproveCancellationModalOpen, setIsApproveCancellationModalOpen] = React.useState(false);
  const [isRejectCancellationModalOpen, setIsRejectCancellationModalOpen] = React.useState(false);
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

  // Company holidays falling within the selected leave dates
  const holidaysInSelectedLeave = React.useMemo(() => {
    if (!reqStartDate || !reqEndDate) return [];
    const start = new Date(reqStartDate);
    const end = new Date(reqEndDate);
    if (start > end) return [];
    return holidays.filter((h) => {
      if (!h.holiday_date) return false;
      const hd = new Date((h.holiday_date.split("T")[0] || ""));
      return hd >= start && hd <= end;
    });
  }, [holidays, reqStartDate, reqEndDate]);

  // Load all initial data
  const fetchData = React.useCallback(async (targetEmpFilterOverride?: string) => {
    if (!currentOrganization) return;
    setIsLoading(true);
    setPageError(null);

    try {
      const orgId = currentOrganization.id;

      // 1. Fetch Leave Types, Holidays, Branches, and Employees
      const [typesRes, holidaysRes, branchRes, empRes] = await Promise.allSettled([
        apiClient.get<LeaveType[]>(API_ENDPOINTS.leave.types, { organizationId: orgId, skipCache: true }),
        apiClient.get<Holiday[]>(API_ENDPOINTS.leave.holidays, {
          organizationId: orgId,
          params: { year: parseInt(holidayYearFilter, 10) || new Date().getFullYear() },
          skipCache: true,
        }),
        apiClient.get<BranchResponse[]>(API_ENDPOINTS.organizations.currentBranches, { organizationId: orgId, skipCache: true }),
        apiClient.get<PaginatedEmployees>(API_ENDPOINTS.employees.list, {
          organizationId: orgId,
          params: { page_size: 100 },
          skipCache: true,
        }),
      ]);

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

      const activeFilter = targetEmpFilterOverride !== undefined ? targetEmpFilterOverride : selectedEmployeeFilter;
      const isViewingAll = activeFilter === "all";
      const isViewingSpecific = activeFilter !== "all" && activeFilter !== "self";

      // 2. Fetch Summary
      try {
        const summaryParams = isViewingSpecific ? { employee_id: activeFilter } : undefined;
        const summaryData = await apiClient.get<LeaveSummary>(API_ENDPOINTS.leave.summary, {
          organizationId: orgId,
          params: summaryParams,
          skipCache: true,
        });
        setSummary(summaryData);
      } catch {
        setSummary(null);
      }

      // 3. Fetch My Requests (for targeted employee or self)
      try {
        const reqFilter = isViewingSpecific
          ? { employee_id: activeFilter }
          : (isViewingAll ? undefined : { scope: "me" });
        const myReqRes = await apiClient.get<PaginatedLeaveRequests | LeaveRequest[]>(API_ENDPOINTS.leave.requests, {
          organizationId: orgId,
          params: reqFilter,
          skipCache: true,
        });
        const items = Array.isArray(myReqRes) ? myReqRes : (myReqRes && "items" in myReqRes ? myReqRes.items : []);
        setMyRequests(items);
      } catch {
        setMyRequests([]);
      }

      // 4. If manager/admin, fetch Org Requests
      if (canApproveLeave || canManageLeaveTypes) {
        try {
          const orgReqRes = await apiClient.get<PaginatedLeaveRequests | LeaveRequest[]>(API_ENDPOINTS.leave.requests, {
            organizationId: orgId,
            skipCache: true,
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
  }, [currentOrganization, canApproveLeave, canManageLeaveTypes, holidayYearFilter, selectedEmployeeFilter]);

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
      apiClient.clearCache();
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
      apiClient.clearCache();
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
      apiClient.clearCache();
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
      apiClient.clearCache();
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

  // Handle Request Cancellation for Approved Leave (Employee)
  const handleRequestCancellation = async () => {
    if (!currentOrganization || !selectedRequest) return;
    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.leave.requestCancellation(selectedRequest.id),
        { reason: cancelReason.trim() || undefined },
        { organizationId: currentOrganization.id }
      );

      setGlobalSuccess("Leave cancellation request submitted for manager review.");
      setIsRequestCancellationModalOpen(false);
      setSelectedRequest(null);
      setCancelReason("");
      apiClient.clearCache();
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to submit cancellation request.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Approve Cancellation (Manager)
  const handleApproveCancellation = async () => {
    if (!currentOrganization || !selectedRequest) return;
    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.leave.approveCancellation(selectedRequest.id),
        { reviewer_comment: reviewerComment.trim() || undefined },
        { organizationId: currentOrganization.id }
      );

      setGlobalSuccess(`Leave cancellation for ${selectedRequest.employee?.first_name || "employee"} approved. Leave balance restored.`);
      setIsApproveCancellationModalOpen(false);
      setSelectedRequest(null);
      setReviewerComment("");
      apiClient.clearCache();
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to approve leave cancellation.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reject Cancellation (Manager)
  const handleRejectCancellation = async () => {
    if (!currentOrganization || !selectedRequest) return;
    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.leave.rejectCancellation(selectedRequest.id),
        { reviewer_comment: reviewerComment.trim() || undefined },
        { organizationId: currentOrganization.id }
      );

      setGlobalSuccess(`Cancellation request for ${selectedRequest.employee?.first_name || "employee"} rejected. Leave remains approved.`);
      setIsRejectCancellationModalOpen(false);
      setSelectedRequest(null);
      setReviewerComment("");
      apiClient.clearCache();
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to reject leave cancellation.");
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

  // Dynamically computed or fetched summary
  const displayedSummary = React.useMemo(() => {
    if (selectedEmployeeFilter === "all" && orgRequests.length > 0 && leaveTypes.length > 0) {
      const currentYear = new Date().getFullYear();
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

      const usedByType: Record<string, number> = {};
      const pendingByType: Record<string, number> = {};

      for (const req of orgRequests) {
        const start = new Date(req.start_date);
        const end = new Date(req.end_date);
        if (start <= yearEnd && end >= yearStart) {
          const days = parseFloat(String(req.total_days)) || 0;
          if (req.status === "approved" || req.status === "cancellation_requested") {
            usedByType[req.leave_type_id] = (usedByType[req.leave_type_id] || 0) + days;
          } else if (req.status === "pending") {
            pendingByType[req.leave_type_id] = (pendingByType[req.leave_type_id] || 0) + days;
          }
        }
      }

      const activeEmpCount = Math.max(1, employees.filter((e) => e.status !== "terminated").length);
      let totalAlloc = 0;
      let totalUsed = 0;
      let totalPending = 0;
      let totalAvail = 0;

      const balances = leaveTypes.map((lt) => {
        const alloc = (parseFloat(String(lt.annual_allocation)) || 0) * activeEmpCount;
        const used = usedByType[lt.id] || 0;
        const pend = pendingByType[lt.id] || 0;
        const avail = Math.max(0, alloc - used);

        totalAlloc += alloc;
        totalUsed += used;
        totalPending += pend;
        totalAvail += avail;

        return {
          leave_type_id: lt.id,
          leave_type_name: lt.name,
          leave_type_code: lt.code,
          annual_allocation: alloc.toFixed(2),
          used_days: used.toFixed(2),
          pending_days: pend.toFixed(2),
          available_days: avail.toFixed(2),
        };
      });

      return {
        total_allocated_days: totalAlloc.toFixed(2),
        total_used_days: totalUsed.toFixed(2),
        total_pending_days: totalPending.toFixed(2),
        total_available_days: totalAvail.toFixed(2),
        balances_by_type: balances,
      };
    }
    return summary;
  }, [selectedEmployeeFilter, summary, orgRequests, leaveTypes, employees]);

  // Filtered lists
  const filteredMyRequests = React.useMemo(() => {
    const list = selectedEmployeeFilter === "all" ? orgRequests : myRequests;
    if (myStatusFilter === "all") return list;
    return list.filter((r) => r.status === myStatusFilter);
  }, [selectedEmployeeFilter, orgRequests, myRequests, myStatusFilter]);

  const filteredApprovalRequests = React.useMemo(() => {
    if (approvalStatusFilter === "all") return orgRequests;
    if (approvalStatusFilter === "pending") {
      return orgRequests.filter((r) => r.status === "pending" || r.status === "cancellation_requested");
    }
    if (approvalStatusFilter === "leave_pending") {
      return orgRequests.filter((r) => r.status === "pending");
    }
    return orgRequests.filter((r) => r.status === approvalStatusFilter);
  }, [orgRequests, approvalStatusFilter]);

  // Helper Badge Render
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="success" className="capitalize">Approved</Badge>;
      case "cancellation_requested":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 font-medium">Cancellation Requested</Badge>;
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
          {canManageHolidays && activeTab !== "holidays" && (
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
              {displayedSummary ? displayedSummary.total_available_days : "—"}
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
              {displayedSummary ? displayedSummary.total_used_days : "—"}
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
              {displayedSummary ? displayedSummary.total_pending_days : "—"}
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
          {displayedSummary && displayedSummary.balances_by_type.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {displayedSummary.balances_by_type.map((b) => (
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {canApproveLeave && employees.length > 0 && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">Employee:</span>
                  <select
                    value={selectedEmployeeFilter}
                    onChange={(e) => {
                      const newFilter = e.target.value;
                      setSelectedEmployeeFilter(newFilter);
                      fetchData(newFilter);
                    }}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="self">My Leaves (Self)</option>
                    <option value="all">All Employees (Company Overview)</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} ({emp.employee_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                  <option value="cancellation_requested">Cancellation Requested</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
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
                    {selectedEmployeeFilter === "all" && <th className="px-6 py-3">Employee</th>}
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
                      {selectedEmployeeFilter === "all" && (
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">
                            {req.employee ? `${req.employee.first_name} ${req.employee.last_name}` : "Unknown"}
                          </div>
                          <div className="text-xs text-slate-400">
                            {req.employee?.employee_code}
                          </div>
                        </td>
                      )}
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
                        {(req.status === "pending" || req.status === "approved") && canCancelLeave && (
                          (() => {
                            const isApproved = req.status === "approved";
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const endDate = new Date(req.end_date);
                            const isConcluded = isApproved && endDate < today;

                            if (isConcluded) {
                              return <span className="text-xs text-slate-400">Completed</span>;
                            }

                            return (
                              <Button
                                variant={isApproved ? "outline" : "destructive"}
                                size="sm"
                                className={
                                  isApproved
                                    ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                                    : ""
                                }
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setCancelReason("");
                                  setModalError(null);
                                  setIsCancelModalOpen(true);
                                }}
                              >
                                {isApproved ? "Cancel Leave" : "Cancel"}
                              </Button>
                            );
                          })()
                        )}
                        {req.status === "approved" && canCancelLeave && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-amber-700 border-amber-300 hover:bg-amber-50"
                            onClick={() => {
                              setSelectedRequest(req);
                              setCancelReason("");
                              setModalError(null);
                              setIsRequestCancellationModalOpen(true);
                            }}
                          >
                            Request Cancellation
                          </Button>
                        )}
                        {req.status === "cancellation_requested" && (
                          <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                            Cancellation Pending Review
                          </span>
                        )}
                        {req.status !== "pending" && req.status !== "approved" && req.status !== "cancellation_requested" && (
                          <span className="text-xs text-slate-400">—</span>
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
                <option value="pending">Pending Review (All Pending & Cancellations)</option>
                <option value="leave_pending">New Leave Requests Only</option>
                <option value="cancellation_requested">Cancellation Requests Only</option>
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
                      <td className="px-6 py-4 max-w-xs text-xs text-slate-500">
                        <div>{req.reason || "—"}</div>
                        {req.status === "cancellation_requested" && req.cancellation_reason && (
                          <div className="mt-1 text-xs text-amber-800 bg-amber-50 rounded p-1.5 border border-amber-200">
                            <span className="font-semibold">Cancellation reason:</span> &ldquo;{req.cancellation_reason}&rdquo;
                          </div>
                        )}
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
                        ) : req.status === "cancellation_requested" ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 font-medium"
                              onClick={() => {
                                setSelectedRequest(req);
                                setReviewerComment("");
                                setModalError(null);
                                setIsApproveCancellationModalOpen(true);
                              }}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Approve Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-slate-600 border-slate-300 hover:bg-slate-50"
                              onClick={() => {
                                setSelectedRequest(req);
                                setReviewerComment("");
                                setModalError(null);
                                setIsRejectCancellationModalOpen(true);
                              }}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Reject Cancel
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

      {/* TAB 3: HOLIDAYS (INTERACTIVE CALENDAR) */}
      {activeTab === "holidays" && (
        <HolidayCalendar
          holidays={holidays}
          branches={branches}
          canManageHolidays={canManageHolidays}
          selectedYear={holidayYearFilter}
          onYearChange={(newYear) => setHolidayYearFilter(newYear)}
          onSelectDate={(dateString) => {
            setSelectedHoliday(null);
            setHolName("");
            setHolDate(dateString);
            setHolBranchId("");
            setHolDescription("");
            setHolIsOptional(false);
            setModalError(null);
            setIsHolidayModalOpen(true);
          }}
          onSelectHoliday={(h) => {
            setSelectedHoliday(h);
            setHolName(h.name);
            setHolDate(h.holiday_date);
            setHolBranchId(h.branch_id || "");
            setHolDescription(h.description || "");
            setHolIsOptional(h.is_optional);
            setModalError(null);
            setIsHolidayModalOpen(true);
          }}
          onDeleteHoliday={(h) => {
            setSelectedHoliday(h);
            setModalError(null);
            setIsDeleteHolidayModalOpen(true);
          }}
          isLoading={isLoading}
        />
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

          {/* Interactive Date Selection with Pop-up Calendar (Includes Company Holidays) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <CalendarDays className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                <span>Leave Dates * (Company Holiday Calendar)</span>
              </Label>
              <button
                type="button"
                onClick={() => setIsDatePickerModalOpen(true)}
                className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1 transition-colors"
              >
                <span>Pop-up Calendar</span>
                <span aria-hidden="true">📅</span>
              </button>
            </div>

            {/* Clickable Card that opens the Pop-Up Calendar with Company Holidays */}
            <div
              onClick={() => setIsDatePickerModalOpen(true)}
              className="cursor-pointer rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-xs hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-subtle transition-all duration-150 group"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsDatePickerModalOpen(true);
                }
              }}
              title="Click to open pop-up calendar and select leave dates"
            >
              {reqStartDate && reqEndDate ? (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-primary-50 dark:bg-primary-950/70 text-primary-600 dark:text-primary-400">
                        <Calendar className="h-4 w-4" />
                      </span>
                      <span>{reqStartDate}</span>
                      <span className="text-slate-400">→</span>
                      <span>{reqEndDate}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary-50 dark:bg-primary-950/80 px-2.5 py-0.5 text-xs font-bold text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-800">
                        {calculatedDays} {calculatedDays === 1 ? "day" : "days"} (inclusive)
                      </span>
                      <span className="text-xs text-primary-600 dark:text-primary-400 group-hover:underline font-medium">
                        Change
                      </span>
                    </div>
                  </div>

                  {holidaysInSelectedLeave.length > 0 && (
                    <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/50 p-2 text-xs text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                      <PartyPopper className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span>
                        Includes {holidaysInSelectedLeave.length} company holiday(s):{" "}
                        <strong>{holidaysInSelectedLeave.map((h) => h.name).join(", ")}</strong>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Click to select dates from Pop-up Calendar
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Company holidays are specially marked on the calendar
                      </p>
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5 shrink-0">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Open Calendar</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Direct date inputs for precise adjustment, accessibility, and form validation */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <Label htmlFor="req-start" className="text-[11px] text-slate-500 dark:text-slate-400">
                  Start Date *
                </Label>
                <Input
                  id="req-start"
                  type="date"
                  required
                  value={reqStartDate}
                  onChange={(e) => setReqStartDate(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="req-end" className="text-[11px] text-slate-500 dark:text-slate-400">
                  End Date *
                </Label>
                <Input
                  id="req-end"
                  type="date"
                  required
                  value={reqEndDate}
                  onChange={(e) => setReqEndDate(e.target.value)}
                  className="mt-0.5 h-8 text-xs"
                />
              </div>
            </div>
          </div>

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

      {/* Pop-up Calendar with Company's Mentioned Holidays for Leave Date Selection */}
      <LeaveDatePickerModal
        isOpen={isDatePickerModalOpen}
        onClose={() => setIsDatePickerModalOpen(false)}
        startDate={reqStartDate}
        endDate={reqEndDate}
        onApplyDates={(start, end) => {
          setReqStartDate(start);
          setReqEndDate(end);
        }}
        holidays={holidays}
      />

      {/* 2. Cancel Request Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title={selectedRequest?.status === "approved" ? "Cancel Approved Leave" : "Cancel Leave Request"}
        description={
          selectedRequest?.status === "approved"
            ? "Are you sure you want to cancel this approved leave? Days will be restored to your leave balance."
            : "Are you sure you want to cancel this pending leave request?"
        }
      >
        <div className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          {selectedRequest && (
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700 space-y-1.5 border border-slate-200">
              <div>
                <span className="font-semibold">Type:</span> {selectedRequest.leave_type?.name}
              </div>
              <div>
                <span className="font-semibold">Dates:</span> {selectedRequest.start_date} to {selectedRequest.end_date} ({selectedRequest.total_days} days)
              </div>
              {selectedRequest.status === "approved" && (
                <div className="mt-2 pt-2 border-t border-slate-200 text-emerald-700 font-medium flex items-center gap-1.5">
                  <span>✓</span>
                  <span>
                    Cancelling this leave will restore <span className="font-semibold">{selectedRequest.total_days} day(s)</span> back to your available balance.
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="cancel-reason">Cancellation Reason (Optional)</Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={
                selectedRequest?.status === "approved"
                  ? "e.g. Plans changed / mood change / meeting rescheduled"
                  : "e.g. Plans changed"
              }
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

      {/* 2b. Request Cancellation Modal (Employee for Approved Leave) */}
      <Modal
        isOpen={isRequestCancellationModalOpen}
        onClose={() => setIsRequestCancellationModalOpen(false)}
        title="Request Leave Cancellation"
        description="Submit a request to cancel your approved leave. Your manager will review this request."
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
                <span className="font-semibold">Leave Type:</span> {selectedRequest.leave_type?.name} ({selectedRequest.leave_type?.code})
              </div>
              <div>
                <span className="font-semibold">Duration:</span> {selectedRequest.start_date} to {selectedRequest.end_date} ({selectedRequest.total_days} days)
              </div>
              <div className="text-slate-500 pt-1">
                Once approved by your manager, {selectedRequest.total_days} day(s) will automatically be credited back to your leave balance.
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="req-cancel-reason">Reason for Cancellation *</Label>
            <Input
              id="req-cancel-reason"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Plans changed, event rescheduled"
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRequestCancellationModalOpen(false)}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleRequestCancellation}
              disabled={isSubmitting || !cancelReason.trim()}
            >
              {isSubmitting ? "Submitting..." : "Submit Cancellation Request"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 2c. Approve Cancellation Modal (Manager) */}
      <Modal
        isOpen={isApproveCancellationModalOpen}
        onClose={() => setIsApproveCancellationModalOpen(false)}
        title="Approve Leave Cancellation"
        description="Confirm cancellation of this approved leave. The employee's leave balance will be automatically restored."
      >
        <div className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          {selectedRequest && (
            <div className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-800 space-y-1.5 border border-emerald-200">
              <div>
                <span className="font-semibold">Employee:</span> {selectedRequest.employee?.first_name} {selectedRequest.employee?.last_name} ({selectedRequest.employee?.employee_code})
              </div>
              <div>
                <span className="font-semibold">Leave Type:</span> {selectedRequest.leave_type?.name}
              </div>
              <div>
                <span className="font-semibold">Period:</span> {selectedRequest.start_date} to {selectedRequest.end_date} ({selectedRequest.total_days} days)
              </div>
              {selectedRequest.cancellation_reason && (
                <div className="pt-1 border-t border-emerald-200/60 font-medium">
                  <span className="font-semibold">Employee&apos;s Cancellation Reason:</span> &ldquo;{selectedRequest.cancellation_reason}&rdquo;
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="appr-canc-comment">Manager Comment (Optional)</Label>
            <Input
              id="appr-canc-comment"
              value={reviewerComment}
              onChange={(e) => setReviewerComment(e.target.value)}
              placeholder="e.g. Cancellation approved, leave balance credited back"
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsApproveCancellationModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApproveCancellation}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Approving..." : "Confirm Cancellation & Restore Leave"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 2d. Reject Cancellation Modal (Manager) */}
      <Modal
        isOpen={isRejectCancellationModalOpen}
        onClose={() => setIsRejectCancellationModalOpen(false)}
        title="Reject Leave Cancellation"
        description="Reject the cancellation request. The leave will remain in approved status."
      >
        <div className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          {selectedRequest && (
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700 space-y-1.5 border border-slate-200">
              <div>
                <span className="font-semibold">Employee:</span> {selectedRequest.employee?.first_name} {selectedRequest.employee?.last_name}
              </div>
              <div>
                <span className="font-semibold">Leave Type:</span> {selectedRequest.leave_type?.name} ({selectedRequest.total_days} days)
              </div>
              {selectedRequest.cancellation_reason && (
                <div className="pt-1 border-t border-slate-200 font-medium">
                  <span className="font-semibold">Requested Reason:</span> {selectedRequest.cancellation_reason}
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="rej-canc-comment">Rejection Reason / Note (Optional)</Label>
            <Input
              id="rej-canc-comment"
              value={reviewerComment}
              onChange={(e) => setReviewerComment(e.target.value)}
              placeholder="e.g. Shift coverage already arranged, cannot cancel"
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRejectCancellationModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRejectCancellation}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Rejecting..." : "Reject Cancellation (Keep Approved)"}
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
        title={selectedHoliday ? `Edit Holiday: ${selectedHoliday.name}` : "Declare Holiday"}
        description={
          selectedHoliday
            ? "Update holiday information or remove it from the schedule."
            : holDate
            ? `Declare a company holiday for ${holDate}.`
            : "Schedule an organization or branch holiday."
        }
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
              autoFocus
              value={holName}
              onChange={(e) => setHolName(e.target.value)}
              placeholder="e.g. 1st JAN, New Year's Day"
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

          <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            {selectedHoliday ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setIsHolidayModalOpen(false);
                  setIsDeleteHolidayModalOpen(true);
                }}
                disabled={isSubmitting}
                className="flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsHolidayModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !holName || !holDate}>
                {isSubmitting ? "Saving..." : selectedHoliday ? "Update Holiday" : "Declare Holiday"}
              </Button>
            </div>
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
