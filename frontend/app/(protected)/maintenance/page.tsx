"use client";

import * as React from "react";
import Link from "next/link";
import {
  Wrench,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  DollarSign,
  Eye,
  Check,
  X,
  Calendar,
  Play,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import type { Asset } from "@/types/asset";
import type { Employee } from "@/types/employee";
import type { Vendor } from "@/types/procurement";
import type {
  MaintenanceRecord,
  MaintenanceRecordCreatePayload,
  MaintenanceRecordStatus,
  MaintenanceRequest,
  MaintenanceRequestCreatePayload,
  MaintenanceRequestPriority,
  MaintenanceRequestStatus,
  MaintenanceType,
} from "@/types/maintenance";

const REQUEST_STATUS_CONFIG: Record<MaintenanceRequestStatus, { label: string; className: string }> = {
  submitted: { label: "Submitted", className: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700 border-red-200" },
  scheduled: { label: "Scheduled", className: "bg-purple-50 text-purple-700 border-purple-200" },
  in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "Completed", className: "bg-teal-50 text-teal-700 border-teal-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

const RECORD_STATUS_CONFIG: Record<MaintenanceRecordStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-purple-50 text-purple-700 border-purple-200" },
  in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

const PRIORITY_CONFIG: Record<MaintenanceRequestPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-slate-100 text-slate-700 border-slate-300" },
  medium: { label: "Medium", className: "bg-blue-50 text-blue-700 border-blue-200" },
  high: { label: "High", className: "bg-orange-50 text-orange-700 border-orange-200" },
  urgent: { label: "Urgent", className: "bg-red-50 text-red-700 border-red-200" },
};

export default function MaintenancePage() {
  const { currentOrganization, permissions, membership, isLoading: isOrgLoading } = useOrganization();

  const isSystemAdmin = membership?.role === "system_admin";

  // Permissions
  const canView = isSystemAdmin || permissions.includes("maintenance.view") || permissions.length === 0;
  const canCreate = isSystemAdmin || permissions.includes("maintenance.create");
  const canUpdate = isSystemAdmin || permissions.includes("maintenance.update");
  const canComplete = isSystemAdmin || permissions.includes("maintenance.complete");

  // State
  const [activeTab, setActiveTab] = React.useState<"requests" | "records">("requests");
  const [requests, setRequests] = React.useState<MaintenanceRequest[]>([]);
  const [records, setRecords] = React.useState<MaintenanceRecord[]>([]);
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [vendors, setVendors] = React.useState<Vendor[]>([]);

  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [priorityFilter, setPriorityFilter] = React.useState("all");

  // Modals
  const [isAddRequestModalOpen, setIsAddRequestModalOpen] = React.useState(false);
  const [isAddRecordModalOpen, setIsAddRecordModalOpen] = React.useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = React.useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = React.useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = React.useState(false);
  const [isCancelRequestModalOpen, setIsCancelRequestModalOpen] = React.useState(false);
  const [isStartRecordModalOpen, setIsStartRecordModalOpen] = React.useState(false);
  const [isCompleteRecordModalOpen, setIsCompleteRecordModalOpen] = React.useState(false);
  const [isCancelRecordModalOpen, setIsCancelRecordModalOpen] = React.useState(false);

  const [selectedRequest, setSelectedRequest] = React.useState<MaintenanceRequest | null>(null);
  const [selectedRecord, setSelectedRecord] = React.useState<MaintenanceRecord | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Forms
  const [requestForm, setRequestForm] = React.useState<MaintenanceRequestCreatePayload>({
    asset_id: "",
    issue_title: "",
    issue_description: "",
    priority: "medium",
    requested_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [recordForm, setRecordForm] = React.useState<MaintenanceRecordCreatePayload>({
    asset_id: "",
    maintenance_request_id: "",
    technician_id: "",
    vendor_id: "",
    maintenance_type: "corrective",
    start_date: new Date().toISOString().split("T")[0],
    description: "",
    parts_description: "",
    labor_cost: 0,
    parts_cost: 0,
    other_cost: 0,
    notes: "",
  });

  const [actionNotes, setActionNotes] = React.useState("");
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [completeCostForm, setCompleteCostForm] = React.useState({
    labor_cost: 0,
    parts_cost: 0,
    other_cost: 0,
    completion_date: new Date().toISOString().split("T")[0],
  });

  const fetchData = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading(true);
    setError(null);

    try {
      const [reqRes, recRes, assetRes, empRes, vndRes] = await Promise.all([
        apiClient.get<{ items: MaintenanceRequest[] }>(API_ENDPOINTS.maintenanceRequests.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
        }),
        apiClient.get<{ items: MaintenanceRecord[] }>(API_ENDPOINTS.maintenanceRecords.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
        }),
        apiClient.get<{ items: Asset[] }>(API_ENDPOINTS.assets.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
        }),
        apiClient.get<{ items: Employee[] }>(API_ENDPOINTS.employees.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
        }),
        apiClient.get<{ items: Vendor[] }>(API_ENDPOINTS.vendors.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
        }),
      ]);

      setRequests((reqRes as any)?.items || (reqRes as any)?.data?.items || []);
      setRecords((recRes as any)?.items || (recRes as any)?.data?.items || []);
      setAssets((assetRes as any)?.items || (assetRes as any)?.data?.items || []);
      setEmployees((empRes as any)?.items || (empRes as any)?.data?.items || []);
      setVendors((vndRes as any)?.items || (vndRes as any)?.data?.items || []);
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load maintenance data");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization]);

  React.useEffect(() => {
    if (currentOrganization) {
      fetchData();
    }
  }, [currentOrganization, fetchData]);

  // Request Handlers
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRequests.create,
        {
          ...requestForm,
          asset_id: requestForm.asset_id,
        },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Maintenance request submitted successfully.");
      setIsAddRequestModalOpen(false);
      setRequestForm({
        asset_id: "",
        issue_title: "",
        issue_description: "",
        priority: "medium",
        requested_date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to submit request");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveRequest = async () => {
    if (!currentOrganization || !selectedRequest) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRequests.approve(selectedRequest.id),
        { notes: actionNotes },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage(`Request ${selectedRequest.request_number} approved.`);
      setIsApproveModalOpen(false);
      setActionNotes("");
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!currentOrganization || !selectedRequest) return;
    if (!rejectionReason.trim()) {
      setFormError("Rejection reason is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRequests.reject(selectedRequest.id),
        { rejection_reason: rejectionReason },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage(`Request ${selectedRequest.request_number} rejected.`);
      setIsRejectModalOpen(false);
      setRejectionReason("");
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScheduleRequest = async () => {
    if (!currentOrganization || !selectedRequest) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRequests.schedule(selectedRequest.id),
        { notes: actionNotes },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage(`Request ${selectedRequest.request_number} scheduled.`);
      setIsScheduleModalOpen(false);
      setActionNotes("");
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!currentOrganization || !selectedRequest) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRequests.cancel(selectedRequest.id),
        { notes: actionNotes },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage(`Request ${selectedRequest.request_number} cancelled.`);
      setIsCancelRequestModalOpen(false);
      setActionNotes("");
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Record Handlers
  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRecords.create,
        {
          asset_id: recordForm.asset_id,
          maintenance_request_id: recordForm.maintenance_request_id || undefined,
          technician_id: recordForm.technician_id || undefined,
          vendor_id: recordForm.vendor_id || undefined,
          maintenance_type: recordForm.maintenance_type,
          start_date: recordForm.start_date,
          description: recordForm.description,
          parts_description: recordForm.parts_description,
          labor_cost: Number(recordForm.labor_cost) || 0,
          parts_cost: Number(recordForm.parts_cost) || 0,
          other_cost: Number(recordForm.other_cost) || 0,
          notes: recordForm.notes,
        },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Maintenance record created successfully.");
      setIsAddRecordModalOpen(false);
      setRecordForm({
        asset_id: "",
        maintenance_request_id: "",
        technician_id: "",
        vendor_id: "",
        maintenance_type: "corrective",
        start_date: new Date().toISOString().split("T")[0],
        description: "",
        parts_description: "",
        labor_cost: 0,
        parts_cost: 0,
        other_cost: 0,
        notes: "",
      });
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create maintenance record");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartRecord = async () => {
    if (!currentOrganization || !selectedRecord) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRecords.start(selectedRecord.id),
        { notes: actionNotes },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage(`Maintenance record ${selectedRecord.record_number} started.`);
      setIsStartRecordModalOpen(false);
      setActionNotes("");
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteRecord = async () => {
    if (!currentOrganization || !selectedRecord) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRecords.complete(selectedRecord.id),
        {
          completion_date: completeCostForm.completion_date,
          labor_cost: Number(completeCostForm.labor_cost) || 0,
          parts_cost: Number(completeCostForm.parts_cost) || 0,
          other_cost: Number(completeCostForm.other_cost) || 0,
          notes: actionNotes,
        },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage(`Maintenance record ${selectedRecord.record_number} marked as completed.`);
      setIsCompleteRecordModalOpen(false);
      setActionNotes("");
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRecord = async () => {
    if (!currentOrganization || !selectedRecord) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRecords.cancel(selectedRecord.id),
        { notes: actionNotes },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage(`Maintenance record ${selectedRecord.record_number} cancelled.`);
      setIsCancelRecordModalOpen(false);
      setActionNotes("");
      fetchData();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Metrics
  const totalRequests = requests.length;
  const pendingRequests = requests.filter((r) => r.status === "submitted").length;
  const activeRecords = records.filter((r) => r.status === "in_progress").length;
  const totalMaintenanceCost = records
    .filter((r) => r.status === "completed")
    .reduce((acc, curr) => acc + (Number(curr.total_cost) || 0), 0);

  // Filter lists
  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      search === "" ||
      r.request_number.toLowerCase().includes(search.toLowerCase()) ||
      r.issue_title.toLowerCase().includes(search.toLowerCase()) ||
      (r.asset?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || r.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const filteredRecords = records.filter((rec) => {
    const matchesSearch =
      search === "" ||
      rec.record_number.toLowerCase().includes(search.toLowerCase()) ||
      (rec.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (rec.asset?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || rec.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isOrgLoading) {
    return <LoadingState message="Loading organization context..." />;
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
        <Wrench className="h-12 w-12 text-slate-400 mb-4" />
        <h2 className="text-xl font-semibold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-md mt-1">
          You do not have permission to view maintenance operations in this organization.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && <ErrorState title="Failed to load maintenance" message={error} onRetry={fetchData} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Maintenance Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track equipment repairs, service requests, preventative maintenance, and costs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate && (
            <>
              <Button
                onClick={() => {
                  setFormError(null);
                  setIsAddRequestModalOpen(true);
                }}
                className="flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                New Request
              </Button>
              <Button
                onClick={() => {
                  setFormError(null);
                  setIsAddRecordModalOpen(true);
                }}
                variant="outline"
                className="flex items-center gap-1.5"
              >
                <Wrench className="h-4 w-4" />
                New Record
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Wrench className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Requests</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{totalRequests}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending Review</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{pendingRequests}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <Play className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">In Progress Work</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{activeRecords}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed Cost</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">
                ${totalMaintenanceCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => {
            setActiveTab("requests");
            setStatusFilter("all");
          }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "requests"
              ? "border-primary-600 text-primary-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Maintenance Requests ({requests.length})
        </button>
        <button
          onClick={() => {
            setActiveTab("records");
            setStatusFilter("all");
          }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "records"
              ? "border-primary-600 text-primary-600 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Maintenance Work Records ({records.length})
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === "requests" ? "Search requests..." : "Search records..."}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          {activeTab === "requests" ? (
            <>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </>
          ) : (
            <>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </>
          )}
        </select>
        {activeTab === "requests" && (
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState message="Loading maintenance items..." />
      ) : activeTab === "requests" ? (
        filteredRequests.length === 0 ? (
          <EmptyState
            title="No maintenance requests found"
            description="Create a request to schedule repairs or service for organization assets."
            actionLabel={canCreate ? "New Request" : undefined}
            onAction={canCreate ? () => setIsAddRequestModalOpen(true) : undefined}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Request #</th>
                    <th className="px-4 py-3">Issue Title</th>
                    <th className="px-4 py-3">Asset</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Requester</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRequests.map((req) => {
                    const statusCfg = REQUEST_STATUS_CONFIG[req.status] || {
                      label: req.status,
                      className: "bg-slate-100 text-slate-700",
                    };
                    const priorityCfg = PRIORITY_CONFIG[req.priority] || {
                      label: req.priority,
                      className: "bg-slate-100 text-slate-700",
                    };
                    return (
                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-slate-900">
                          <Link
                            href={`/maintenance/requests/${req.id}`}
                            className="text-primary-600 hover:underline"
                          >
                            {req.request_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{req.issue_title}</td>
                        <td className="px-4 py-3">
                          {req.asset ? (
                            <div>
                              <span className="font-medium text-slate-900">{req.asset.name}</span>
                              <span className="text-xs text-slate-400 block font-mono">({req.asset.asset_code})</span>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`capitalize ${priorityCfg.className}`}>
                            {priorityCfg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {req.requester
                            ? `${req.requester.first_name} ${req.requester.last_name}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{req.requested_date}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`capitalize ${statusCfg.className}`}>
                            {statusCfg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link href={`/maintenance/requests/${req.id}`}>
                              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Details
                              </Button>
                            </Link>
                            {canUpdate && req.status === "submitted" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setActionNotes("");
                                    setFormError(null);
                                    setIsApproveModalOpen(true);
                                  }}
                                  className="h-8 px-2 text-xs text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedRequest(req);
                                    setRejectionReason("");
                                    setFormError(null);
                                    setIsRejectModalOpen(true);
                                  }}
                                  className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {canUpdate && req.status === "approved" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setActionNotes("");
                                  setFormError(null);
                                  setIsScheduleModalOpen(true);
                                }}
                                className="h-8 px-2 text-xs text-purple-600 hover:bg-purple-50"
                              >
                                <Calendar className="h-3.5 w-3.5 mr-1" />
                                Schedule
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : filteredRecords.length === 0 ? (
        <EmptyState
          title="No maintenance records found"
          description="Create a work record to log technician labor, replacement parts, and maintenance costs."
          actionLabel={canCreate ? "New Record" : undefined}
          onAction={canCreate ? () => setIsAddRecordModalOpen(true) : undefined}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Record #</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Technician / Vendor</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">Total Cost</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRecords.map((rec) => {
                  const statusCfg = RECORD_STATUS_CONFIG[rec.status] || {
                    label: rec.status,
                    className: "bg-slate-100 text-slate-700",
                  };
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        <Link
                          href={`/maintenance/records/${rec.id}`}
                          className="text-primary-600 hover:underline"
                        >
                          {rec.record_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {rec.asset ? (
                          <div>
                            <span className="font-medium text-slate-900">{rec.asset.name}</span>
                            <span className="text-xs text-slate-400 block font-mono">({rec.asset.asset_code})</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize font-medium text-slate-700">
                        {rec.maintenance_type.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3">
                        {rec.technician ? (
                          <span className="text-slate-900">
                            {rec.technician.first_name} {rec.technician.last_name}
                          </span>
                        ) : rec.vendor ? (
                          <span className="text-slate-900">{rec.vendor.name}</span>
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{rec.start_date}</td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        ${Number(rec.total_cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`capitalize ${statusCfg.className}`}>
                          {statusCfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/maintenance/records/${rec.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Details
                            </Button>
                          </Link>
                          {canUpdate && rec.status === "scheduled" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedRecord(rec);
                                setActionNotes("");
                                setFormError(null);
                                setIsStartRecordModalOpen(true);
                              }}
                              className="h-8 px-2 text-xs text-amber-600 hover:bg-amber-50"
                            >
                              <Play className="h-3.5 w-3.5 mr-1" />
                              Start
                            </Button>
                          )}
                          {canComplete && rec.status === "in_progress" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedRecord(rec);
                                setCompleteCostForm({
                                  labor_cost: Number(rec.labor_cost) || 0,
                                  parts_cost: Number(rec.parts_cost) || 0,
                                  other_cost: Number(rec.other_cost) || 0,
                                  completion_date: new Date().toISOString().split("T")[0],
                                });
                                setActionNotes("");
                                setFormError(null);
                                setIsCompleteRecordModalOpen(true);
                              }}
                              className="h-8 px-2 text-xs text-emerald-600 hover:bg-emerald-50"
                            >
                              <Check className="h-3.5 w-3.5 mr-1" />
                              Complete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create Maintenance Request */}
      <Modal
        isOpen={isAddRequestModalOpen}
        onClose={() => setIsAddRequestModalOpen(false)}
        title="Submit Maintenance Request"
      >
        <form onSubmit={handleCreateRequest} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <Label htmlFor="req_asset_id">Select Asset *</Label>
            <select
              id="req_asset_id"
              required
              value={requestForm.asset_id}
              onChange={(e) => setRequestForm({ ...requestForm, asset_id: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            >
              <option value="">-- Choose Asset --</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.asset_code} - {a.name} ({a.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="req_issue_title">Issue Title *</Label>
            <Input
              id="req_issue_title"
              required
              value={requestForm.issue_title}
              onChange={(e) => setRequestForm({ ...requestForm, issue_title: e.target.value })}
              placeholder="e.g. Printer jamming constantly"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="req_priority">Priority</Label>
              <select
                id="req_priority"
                value={requestForm.priority}
                onChange={(e) =>
                  setRequestForm({
                    ...requestForm,
                    priority: e.target.value as MaintenanceRequestPriority,
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <Label htmlFor="req_date">Requested Date</Label>
              <Input
                id="req_date"
                type="date"
                value={requestForm.requested_date}
                onChange={(e) => setRequestForm({ ...requestForm, requested_date: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="req_desc">Issue Description</Label>
            <textarea
              id="req_desc"
              rows={3}
              value={requestForm.issue_description || ""}
              onChange={(e) => setRequestForm({ ...requestForm, issue_description: e.target.value })}
              placeholder="Describe what happened, error codes, symptoms..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsAddRequestModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Create Maintenance Record */}
      <Modal
        isOpen={isAddRecordModalOpen}
        onClose={() => setIsAddRecordModalOpen(false)}
        title="Create Maintenance Record"
      >
        <form onSubmit={handleCreateRecord} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <Label htmlFor="rec_asset_id">Select Asset *</Label>
            <select
              id="rec_asset_id"
              required
              value={recordForm.asset_id}
              onChange={(e) => setRecordForm({ ...recordForm, asset_id: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            >
              <option value="">-- Choose Asset --</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.asset_code} - {a.name} ({a.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="rec_req_id">Linked Maintenance Request (Optional)</Label>
            <select
              id="rec_req_id"
              value={recordForm.maintenance_request_id || ""}
              onChange={(e) => setRecordForm({ ...recordForm, maintenance_request_id: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            >
              <option value="">-- None (Direct Work Order) --</option>
              {requests
                .filter((r) => !recordForm.asset_id || r.asset_id === recordForm.asset_id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.request_number} - {r.issue_title} ({r.status})
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rec_type">Maintenance Type</Label>
              <select
                id="rec_type"
                value={recordForm.maintenance_type}
                onChange={(e) =>
                  setRecordForm({
                    ...recordForm,
                    maintenance_type: e.target.value as MaintenanceType,
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
              >
                <option value="corrective">Corrective Repair</option>
                <option value="preventive">Preventative Service</option>
                <option value="inspection">Inspection</option>
                <option value="upgrade">Upgrade</option>
              </select>
            </div>

            <div>
              <Label htmlFor="rec_start_date">Scheduled Start Date</Label>
              <Input
                id="rec_start_date"
                type="date"
                value={recordForm.start_date}
                onChange={(e) => setRecordForm({ ...recordForm, start_date: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rec_technician">Technician</Label>
              <select
                id="rec_technician"
                value={recordForm.technician_id || ""}
                onChange={(e) => setRecordForm({ ...recordForm, technician_id: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
              >
                <option value="">-- Internal Staff --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="rec_vendor">External Vendor</Label>
              <select
                id="rec_vendor"
                value={recordForm.vendor_id || ""}
                onChange={(e) => setRecordForm({ ...recordForm, vendor_id: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
              >
                <option value="">-- None (In-House) --</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.vendor_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="rec_labor">Labor Cost ($)</Label>
              <Input
                id="rec_labor"
                type="number"
                min="0"
                step="0.01"
                value={recordForm.labor_cost}
                onChange={(e) => setRecordForm({ ...recordForm, labor_cost: parseFloat(e.target.value) || 0 })}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="rec_parts">Parts Cost ($)</Label>
              <Input
                id="rec_parts"
                type="number"
                min="0"
                step="0.01"
                value={recordForm.parts_cost}
                onChange={(e) => setRecordForm({ ...recordForm, parts_cost: parseFloat(e.target.value) || 0 })}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="rec_other">Other Cost ($)</Label>
              <Input
                id="rec_other"
                type="number"
                min="0"
                step="0.01"
                value={recordForm.other_cost}
                onChange={(e) => setRecordForm({ ...recordForm, other_cost: parseFloat(e.target.value) || 0 })}
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="rec_desc">Description / Scope of Work</Label>
            <textarea
              id="rec_desc"
              rows={2}
              value={recordForm.description || ""}
              onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })}
              placeholder="Work procedure, diagnostic checks..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsAddRecordModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Record"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Approve Request */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Approve Maintenance Request"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Approve request <strong>{selectedRequest?.request_number}</strong> for asset{" "}
            <strong>{selectedRequest?.asset?.name}</strong>?
          </p>
          <div>
            <Label htmlFor="appr_notes">Approval Notes (Optional)</Label>
            <textarea
              id="appr_notes"
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="e.g. Approved for contractor assignment"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsApproveModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApproveRequest} disabled={isSubmitting}>
              {isSubmitting ? "Approving..." : "Confirm Approval"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Reject Request */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Maintenance Request"
      >
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
              {formError}
            </div>
          )}
          <p className="text-sm text-slate-600">
            Reject request <strong>{selectedRequest?.request_number}</strong>. Please provide a reason.
          </p>
          <div>
            <Label htmlFor="rej_reason">Rejection Reason *</Label>
            <textarea
              id="rej_reason"
              required
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why this maintenance request cannot be approved..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRejectRequest} disabled={isSubmitting}>
              {isSubmitting ? "Rejecting..." : "Reject Request"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Schedule Request */}
      <Modal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        title="Schedule Maintenance Request"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Mark request <strong>{selectedRequest?.request_number}</strong> as scheduled.
          </p>
          <div>
            <Label htmlFor="sched_notes">Scheduling Notes (Optional)</Label>
            <textarea
              id="sched_notes"
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="e.g. Scheduled with technician for Thursday morning"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleRequest} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Schedule Request"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Start Record */}
      <Modal
        isOpen={isStartRecordModalOpen}
        onClose={() => setIsStartRecordModalOpen(false)}
        title="Start Maintenance Work"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Start work on record <strong>{selectedRecord?.record_number}</strong>? This will transition the record to{" "}
            <strong>in_progress</strong> and mark asset status as <strong>under_maintenance</strong>.
          </p>
          <div>
            <Label htmlFor="start_notes">Start Notes (Optional)</Label>
            <textarea
              id="start_notes"
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="e.g. Asset checked into repair shop"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsStartRecordModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartRecord} disabled={isSubmitting}>
              {isSubmitting ? "Starting..." : "Start Maintenance"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Complete Record */}
      <Modal
        isOpen={isCompleteRecordModalOpen}
        onClose={() => setIsCompleteRecordModalOpen(false)}
        title="Complete Maintenance Record"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Complete work order <strong>{selectedRecord?.record_number}</strong> and finalize costs. Asset status will be restored automatically.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="cmp_labor">Final Labor ($)</Label>
              <Input
                id="cmp_labor"
                type="number"
                min="0"
                step="0.01"
                value={completeCostForm.labor_cost}
                onChange={(e) => setCompleteCostForm({ ...completeCostForm, labor_cost: parseFloat(e.target.value) || 0 })}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="cmp_parts">Final Parts ($)</Label>
              <Input
                id="cmp_parts"
                type="number"
                min="0"
                step="0.01"
                value={completeCostForm.parts_cost}
                onChange={(e) => setCompleteCostForm({ ...completeCostForm, parts_cost: parseFloat(e.target.value) || 0 })}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="cmp_other">Other Cost ($)</Label>
              <Input
                id="cmp_other"
                type="number"
                min="0"
                step="0.01"
                value={completeCostForm.other_cost}
                onChange={(e) => setCompleteCostForm({ ...completeCostForm, other_cost: parseFloat(e.target.value) || 0 })}
                className="mt-1 font-mono"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="cmp_notes">Completion Notes</Label>
            <textarea
              id="cmp_notes"
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="e.g. Tested all electrical components and verified normal operational tolerances"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsCompleteRecordModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCompleteRecord} disabled={isSubmitting}>
              {isSubmitting ? "Completing..." : "Complete Maintenance"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Cancel Request */}
      <Modal
        isOpen={isCancelRequestModalOpen}
        onClose={() => setIsCancelRequestModalOpen(false)}
        title="Cancel Maintenance Request"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to cancel request <strong>{selectedRequest?.request_number}</strong>?
          </p>
          <div>
            <Label htmlFor="cancel_req_notes">Cancellation Notes</Label>
            <textarea
              id="cancel_req_notes"
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Reason for cancellation..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsCancelRequestModalOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" onClick={handleCancelRequest} disabled={isSubmitting}>
              {isSubmitting ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Cancel Record */}
      <Modal
        isOpen={isCancelRecordModalOpen}
        onClose={() => setIsCancelRecordModalOpen(false)}
        title="Cancel Maintenance Record"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to cancel record <strong>{selectedRecord?.record_number}</strong>?
          </p>
          <div>
            <Label htmlFor="cancel_rec_notes">Cancellation Notes</Label>
            <textarea
              id="cancel_rec_notes"
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Reason for cancellation..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsCancelRecordModalOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" onClick={handleCancelRecord} disabled={isSubmitting}>
              {isSubmitting ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
