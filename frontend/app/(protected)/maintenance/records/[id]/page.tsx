"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Check,
  X,
  Box,
  User,
  DollarSign,
  Edit2,
  Play,
  Ban,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type { Employee } from "@/types/employee";
import type { Vendor } from "@/types/procurement";
import type {
  MaintenanceRecordCompletePayload,
  MaintenanceRecordDetail,
  MaintenanceRecordStartPayload,
  MaintenanceRecordStatus,
  MaintenanceRecordUpdatePayload,
  MaintenanceType,
} from "@/types/maintenance";

const RECORD_STATUS_CONFIG: Record<MaintenanceRecordStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-purple-50 text-purple-700 border-purple-200" },
  in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

const TYPE_CONFIG: Record<MaintenanceType, { label: string; className: string }> = {
  corrective: { label: "Corrective", className: "bg-rose-50 text-rose-700 border-rose-200" },
  preventive: { label: "Preventive", className: "bg-blue-50 text-blue-700 border-blue-200" },
  inspection: { label: "Inspection", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  upgrade: { label: "Upgrade", className: "bg-teal-50 text-teal-700 border-teal-200" },
};

export default function MaintenanceRecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canUpdate = permissions.includes("maintenance.update");
  const canComplete = permissions.includes("maintenance.complete");

  const [record, setRecord] = React.useState<MaintenanceRecordDetail | null>(null);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isStartModalOpen, setIsStartModalOpen] = React.useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = React.useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);

  // Form states
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Start Form
  const [startForm, setStartForm] = React.useState<MaintenanceRecordStartPayload>({
    start_date: new Date().toISOString().split("T")[0],
    technician_id: "",
    vendor_id: "",
    notes: "",
  });

  // Complete Form
  const [completeForm, setCompleteForm] = React.useState<MaintenanceRecordCompletePayload>({
    completion_date: new Date().toISOString().split("T")[0],
    labor_cost: 0,
    parts_cost: 0,
    other_cost: 0,
    description: "",
    parts_description: "",
    notes: "",
  });

  // Cancel Form
  const [cancelNotes, setCancelNotes] = React.useState("");

  // Edit Form
  const [editForm, setEditForm] = React.useState<MaintenanceRecordUpdatePayload>({
    technician_id: "",
    vendor_id: "",
    maintenance_type: "corrective",
    start_date: "",
    completion_date: "",
    description: "",
    parts_description: "",
    labor_cost: 0,
    parts_cost: 0,
    other_cost: 0,
    notes: "",
  });

  const fetchDetail = React.useCallback(async () => {
    if (!currentOrganization || !id) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<MaintenanceRecordDetail>(
        API_ENDPOINTS.maintenanceRecords.detail(id),
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setRecord((res as any)?.data || res);
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load maintenance record details");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, id]);

  const fetchAuxiliaryData = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const [empRes, venRes] = await Promise.all([
        apiClient.get<{ items: Employee[] }>(API_ENDPOINTS.employees.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
          params: { page_size: 100 },
        }),
        apiClient.get<{ items: Vendor[] }>(API_ENDPOINTS.vendors.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
          params: { page_size: 100 },
        }),
      ]);
      setEmployees((empRes as any)?.items || (empRes as any)?.data?.items || []);
      setVendors((venRes as any)?.items || (venRes as any)?.data?.items || []);
    } catch {
      // Non-critical background fetch failure
    }
  }, [currentOrganization]);

  React.useEffect(() => {
    if (currentOrganization && id) {
      fetchDetail();
      fetchAuxiliaryData();
    }
  }, [currentOrganization, id, fetchDetail, fetchAuxiliaryData]);

  const handleStartWork = async () => {
    if (!currentOrganization || !id) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRecords.start(id),
        {
          start_date: startForm.start_date || undefined,
          technician_id: startForm.technician_id || undefined,
          vendor_id: startForm.vendor_id || undefined,
          notes: startForm.notes || undefined,
        },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Maintenance work started. Asset marked as under maintenance.");
      setIsStartModalOpen(false);
      fetchDetail();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to start maintenance work");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteWork = async () => {
    if (!currentOrganization || !id) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRecords.complete(id),
        {
          completion_date: completeForm.completion_date || undefined,
          labor_cost: Number(completeForm.labor_cost) || 0,
          parts_cost: Number(completeForm.parts_cost) || 0,
          other_cost: Number(completeForm.other_cost) || 0,
          description: completeForm.description || undefined,
          parts_description: completeForm.parts_description || undefined,
          notes: completeForm.notes || undefined,
        },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Maintenance completed and asset status restored.");
      setIsCompleteModalOpen(false);
      fetchDetail();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to complete maintenance");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelWork = async () => {
    if (!currentOrganization || !id) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRecords.cancel(id),
        { notes: cancelNotes || undefined },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Maintenance record cancelled.");
      setIsCancelModalOpen(false);
      setCancelNotes("");
      fetchDetail();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to cancel maintenance record");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = () => {
    if (!record) return;
    setEditForm({
      technician_id: record.technician_id || "",
      vendor_id: record.vendor_id || "",
      maintenance_type: record.maintenance_type,
      start_date: record.start_date,
      completion_date: record.completion_date || "",
      description: record.description || "",
      parts_description: record.parts_description || "",
      labor_cost: record.labor_cost,
      parts_cost: record.parts_cost,
      other_cost: record.other_cost,
      notes: record.notes || "",
    });
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleUpdateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !id) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await apiClient.put(
        API_ENDPOINTS.maintenanceRecords.update(id),
        {
          technician_id: editForm.technician_id || undefined,
          vendor_id: editForm.vendor_id || undefined,
          maintenance_type: editForm.maintenance_type,
          start_date: editForm.start_date,
          completion_date: editForm.completion_date || undefined,
          description: editForm.description || undefined,
          parts_description: editForm.parts_description || undefined,
          labor_cost: Number(editForm.labor_cost) || 0,
          parts_cost: Number(editForm.parts_cost) || 0,
          other_cost: Number(editForm.other_cost) || 0,
          notes: editForm.notes || undefined,
        },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Record updated successfully.");
      setIsEditModalOpen(false);
      fetchDetail();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update maintenance record");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading maintenance record..." />;
  }

  if (error || !record) {
    return (
      <ErrorState
        title="Failed to Load Maintenance Record"
        message={error || "Maintenance record not found"}
        onRetry={fetchDetail}
      />
    );
  }

  const isEditable = record.status !== "completed" && record.status !== "cancelled";

  return (
    <div className="space-y-6 pb-12">
      {/* Back link & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/maintenance"
            className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Maintenance
          </Link>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {record.status === "scheduled" && canUpdate && (
            <Button
              onClick={() => {
                setStartForm({
                  start_date: new Date().toISOString().split("T")[0],
                  technician_id: record.technician_id || "",
                  vendor_id: record.vendor_id || "",
                  notes: "",
                });
                setFormError(null);
                setIsStartModalOpen(true);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Play className="mr-1.5 h-4 w-4" />
              Start Work
            </Button>
          )}

          {record.status === "in_progress" && canComplete && (
            <Button
              onClick={() => {
                setCompleteForm({
                  completion_date: new Date().toISOString().split("T")[0],
                  labor_cost: record.labor_cost,
                  parts_cost: record.parts_cost,
                  other_cost: record.other_cost,
                  description: record.description || "",
                  parts_description: record.parts_description || "",
                  notes: "",
                });
                setFormError(null);
                setIsCompleteModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="mr-1.5 h-4 w-4" />
              Complete Maintenance
            </Button>
          )}

          {isEditable && canUpdate && (
            <>
              <Button variant="outline" onClick={openEditModal}>
                <Edit2 className="mr-1.5 h-4 w-4 text-neutral-500" />
                Edit Record
              </Button>
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  setCancelNotes("");
                  setFormError(null);
                  setIsCancelModalOpen(true);
                }}
              >
                <Ban className="mr-1.5 h-4 w-4 text-red-500" />
                Cancel Record
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Success Alert */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                  {record.record_number}
                </h1>
                <Badge
                  variant="outline"
                  className={RECORD_STATUS_CONFIG[record.status]?.className || "bg-neutral-100 text-neutral-700"}
                >
                  {RECORD_STATUS_CONFIG[record.status]?.label || record.status}
                </Badge>
                <Badge
                  variant="outline"
                  className={TYPE_CONFIG[record.maintenance_type]?.className || "bg-neutral-100 text-neutral-700"}
                >
                  {TYPE_CONFIG[record.maintenance_type]?.label || record.maintenance_type}
                </Badge>
              </div>
              <p className="text-sm text-neutral-500">
                Created on {new Date(record.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-4 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
              <div className="text-right">
                <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Total Cost
                </span>
                <p className="text-xl font-bold text-neutral-900">
                  ${record.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Main Info */}
        <div className="space-y-6 lg:col-span-2">
          {/* Asset & Service Details */}
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
                  <Box className="h-4 w-4 text-neutral-500" />
                  Target Asset & Service Details
                </h3>
                {record.asset && (
                  <Link
                    href={`/assets/${record.asset.id}`}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
                  >
                    View Asset Profile &rarr;
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-medium text-neutral-500">Asset</span>
                  <p className="text-sm font-semibold text-neutral-900 mt-0.5">
                    {record.asset?.name || "Unknown Asset"} ({record.asset?.asset_code || record.asset_id})
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-neutral-500">Asset Condition</span>
                  <p className="text-sm text-neutral-900 mt-0.5 capitalize">
                    {record.asset?.condition || "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-neutral-500">Maintenance Type</span>
                  <p className="text-sm text-neutral-900 mt-0.5 capitalize font-medium">
                    {record.maintenance_type}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-neutral-500">Current Status</span>
                  <p className="text-sm text-neutral-900 mt-0.5 capitalize">
                    {record.status.replace("_", " ")}
                  </p>
                </div>
              </div>

              {/* Work Descriptions */}
              <div className="space-y-4 pt-4 border-t">
                <div>
                  <span className="text-xs font-medium text-neutral-500">Work Description</span>
                  <p className="text-sm text-neutral-800 mt-1 whitespace-pre-wrap bg-neutral-50 p-3 rounded-md border border-neutral-100 min-h-[60px]">
                    {record.description || "No specific work description provided."}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-medium text-neutral-500">Parts Used / Replaced</span>
                  <p className="text-sm text-neutral-800 mt-1 whitespace-pre-wrap bg-neutral-50 p-3 rounded-md border border-neutral-100 min-h-[60px]">
                    {record.parts_description || "No parts description recorded."}
                  </p>
                </div>

                {record.notes && (
                  <div>
                    <span className="text-xs font-medium text-neutral-500">Additional Notes</span>
                    <p className="text-sm text-neutral-800 mt-1 whitespace-pre-wrap bg-neutral-50 p-3 rounded-md border border-neutral-100">
                      {record.notes}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Linked Request (if any) */}
          {record.maintenance_request && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between border-b pb-4">
                  <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-neutral-500" />
                    Linked Maintenance Request
                  </h3>
                  <Link
                    href={`/maintenance/requests/${record.maintenance_request.id}`}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
                  >
                    View Request &rarr;
                  </Link>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <span className="text-xs font-medium text-neutral-500">Request Number</span>
                    <p className="text-sm font-semibold text-neutral-900 mt-0.5">
                      {record.maintenance_request.request_number}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-neutral-500">Issue Title</span>
                    <p className="text-sm font-medium text-neutral-900 mt-0.5">
                      {record.maintenance_request.issue_title}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-neutral-500">Requester</span>
                    <p className="text-sm text-neutral-900 mt-0.5">
                      {record.maintenance_request.requester
                        ? `${record.maintenance_request.requester.first_name} ${record.maintenance_request.requester.last_name}`
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-neutral-500">Request Status</span>
                    <p className="text-sm text-neutral-900 mt-0.5 capitalize">
                      {record.maintenance_request.status.replace("_", " ")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right 1 Col: Provider & Costs */}
        <div className="space-y-6">
          {/* Timeline & Schedule */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2 border-b pb-3">
                <Clock className="h-4 w-4 text-neutral-500" />
                Timeline & Schedule
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Start Date:</span>
                  <span className="font-medium text-neutral-900">
                    {record.start_date || "Not started"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Completion Date:</span>
                  <span className="font-medium text-neutral-900">
                    {record.completion_date || "Pending completion"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Provider / Assignee Details */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2 border-b pb-3">
                <User className="h-4 w-4 text-neutral-500" />
                Service Provider
              </h3>

              <div className="space-y-4">
                <div>
                  <span className="text-xs font-medium text-neutral-500">Internal Technician</span>
                  <p className="text-sm font-medium text-neutral-900 mt-0.5">
                    {record.technician
                      ? `${record.technician.first_name} ${record.technician.last_name} (${record.technician.employee_code})`
                      : "None assigned"}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-medium text-neutral-500">External Vendor</span>
                  <p className="text-sm font-medium text-neutral-900 mt-0.5">
                    {record.vendor
                      ? `${record.vendor.name} (${record.vendor.vendor_code})`
                      : "None assigned"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost Breakdown */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2 border-b pb-3">
                <DollarSign className="h-4 w-4 text-neutral-500" />
                Cost Breakdown
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Labor Cost:</span>
                  <span className="font-medium text-neutral-900">
                    ${record.labor_cost.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Parts Cost:</span>
                  <span className="font-medium text-neutral-900">
                    ${record.parts_cost.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Other Cost:</span>
                  <span className="font-medium text-neutral-900">
                    ${record.other_cost.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm pt-3 border-t font-semibold">
                  <span className="text-neutral-900">Total Cost:</span>
                  <span className="text-emerald-700 font-bold text-base">
                    ${record.total_cost.toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Start Work Modal */}
      <Modal
        isOpen={isStartModalOpen}
        onClose={() => !isSubmitting && setIsStartModalOpen(false)}
        title="Start Maintenance Work"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Starting this maintenance will automatically mark the target asset as{" "}
            <strong>Under Maintenance</strong>.
          </p>

          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="start_date">Start Date</Label>
            <Input
              id="start_date"
              type="date"
              value={startForm.start_date}
              onChange={(e) => setStartForm({ ...startForm, start_date: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="start_technician">Technician (Internal)</Label>
            <select
              id="start_technician"
              value={startForm.technician_id || ""}
              onChange={(e) => setStartForm({ ...startForm, technician_id: e.target.value })}
              className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            >
              <option value="">Select Technician (Optional)</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({emp.employee_code})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="start_vendor">Service Vendor (External)</Label>
            <select
              id="start_vendor"
              value={startForm.vendor_id || ""}
              onChange={(e) => setStartForm({ ...startForm, vendor_id: e.target.value })}
              className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            >
              <option value="">Select Vendor (Optional)</option>
              {vendors.map((ven) => (
                <option key={ven.id} value={ven.id}>
                  {ven.name} ({ven.vendor_code})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="start_notes">Notes (Optional)</Label>
            <textarea
              id="start_notes"
              rows={3}
              value={startForm.notes || ""}
              onChange={(e) => setStartForm({ ...startForm, notes: e.target.value })}
              placeholder="Notes on dispatch or work kickoff..."
              className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsStartModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartWork}
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isSubmitting ? "Starting..." : "Start Maintenance"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Complete Work Modal */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => !isSubmitting && setIsCompleteModalOpen(false)}
        title="Complete Maintenance Record"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Completing this maintenance will record final costs and restore the asset status to{" "}
            <strong>Assigned</strong> (if assigned) or <strong>Available</strong>.
          </p>

          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="comp_date">Completion Date</Label>
            <Input
              id="comp_date"
              type="date"
              value={completeForm.completion_date}
              onChange={(e) => setCompleteForm({ ...completeForm, completion_date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="comp_labor">Labor Cost ($)</Label>
              <Input
                id="comp_labor"
                type="number"
                min="0"
                step="0.01"
                value={completeForm.labor_cost}
                onChange={(e) => setCompleteForm({ ...completeForm, labor_cost: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp_parts">Parts Cost ($)</Label>
              <Input
                id="comp_parts"
                type="number"
                min="0"
                step="0.01"
                value={completeForm.parts_cost}
                onChange={(e) => setCompleteForm({ ...completeForm, parts_cost: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp_other">Other Cost ($)</Label>
              <Input
                id="comp_other"
                type="number"
                min="0"
                step="0.01"
                value={completeForm.other_cost}
                onChange={(e) => setCompleteForm({ ...completeForm, other_cost: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comp_desc">Work Summary</Label>
            <textarea
              id="comp_desc"
              rows={2}
              value={completeForm.description || ""}
              onChange={(e) => setCompleteForm({ ...completeForm, description: e.target.value })}
              placeholder="Summary of actions taken..."
              className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comp_parts_desc">Parts Used / Replaced</Label>
            <textarea
              id="comp_parts_desc"
              rows={2}
              value={completeForm.parts_description || ""}
              onChange={(e) => setCompleteForm({ ...completeForm, parts_description: e.target.value })}
              placeholder="Details on replacement parts..."
              className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comp_notes">Notes (Optional)</Label>
            <textarea
              id="comp_notes"
              rows={2}
              value={completeForm.notes || ""}
              onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
              placeholder="Final technician notes..."
              className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsCompleteModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCompleteWork}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? "Completing..." : "Complete Maintenance"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Record Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => !isSubmitting && setIsCancelModalOpen(false)}
        title="Cancel Maintenance Record"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Are you sure you want to cancel this maintenance record? If the asset was under maintenance,
            its status will be restored.
          </p>

          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cancel_notes">Cancellation Reason / Notes</Label>
            <textarea
              id="cancel_notes"
              rows={3}
              value={cancelNotes}
              onChange={(e) => setCancelNotes(e.target.value)}
              placeholder="Reason for cancelling this maintenance record..."
              className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelWork}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Record Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !isSubmitting && setIsEditModalOpen(false)}
        title="Edit Maintenance Record"
      >
        <form onSubmit={handleUpdateRecord} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_type">Maintenance Type</Label>
              <select
                id="edit_type"
                value={editForm.maintenance_type}
                onChange={(e) => setEditForm({ ...editForm, maintenance_type: e.target.value as MaintenanceType })}
                className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
              >
                <option value="corrective">Corrective</option>
                <option value="preventive">Preventive</option>
                <option value="inspection">Inspection</option>
                <option value="upgrade">Upgrade</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_start_date">Start Date</Label>
              <Input
                id="edit_start_date"
                type="date"
                value={editForm.start_date}
                onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_tech">Technician</Label>
              <select
                id="edit_tech"
                value={editForm.technician_id || ""}
                onChange={(e) => setEditForm({ ...editForm, technician_id: e.target.value })}
                className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
              >
                <option value="">None Assigned</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_vendor">Vendor</Label>
              <select
                id="edit_vendor"
                value={editForm.vendor_id || ""}
                onChange={(e) => setEditForm({ ...editForm, vendor_id: e.target.value })}
                className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
              >
                <option value="">None Assigned</option>
                {vendors.map((ven) => (
                  <option key={ven.id} value={ven.id}>
                    {ven.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_labor">Labor ($)</Label>
              <Input
                id="edit_labor"
                type="number"
                min="0"
                step="0.01"
                value={editForm.labor_cost}
                onChange={(e) => setEditForm({ ...editForm, labor_cost: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_parts">Parts ($)</Label>
              <Input
                id="edit_parts"
                type="number"
                min="0"
                step="0.01"
                value={editForm.parts_cost}
                onChange={(e) => setEditForm({ ...editForm, parts_cost: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_other">Other ($)</Label>
              <Input
                id="edit_other"
                type="number"
                min="0"
                step="0.01"
                value={editForm.other_cost}
                onChange={(e) => setEditForm({ ...editForm, other_cost: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_desc">Description</Label>
            <textarea
              id="edit_desc"
              rows={2}
              value={editForm.description || ""}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_parts_desc">Parts Description</Label>
            <textarea
              id="edit_parts_desc"
              rows={2}
              value={editForm.parts_description || ""}
              onChange={(e) => setEditForm({ ...editForm, parts_description: e.target.value })}
              className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
