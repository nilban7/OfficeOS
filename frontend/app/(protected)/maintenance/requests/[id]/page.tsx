"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Wrench,
  CheckCircle2,
  Check,
  X,
  Calendar,
  Box,
  User,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type {
  MaintenanceRequestDetail,
  MaintenanceRequestPriority,
  MaintenanceRequestStatus,
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

const PRIORITY_CONFIG: Record<MaintenanceRequestPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-slate-100 text-slate-700 border-slate-300" },
  medium: { label: "Medium", className: "bg-blue-50 text-blue-700 border-blue-200" },
  high: { label: "High", className: "bg-orange-50 text-orange-700 border-orange-200" },
  urgent: { label: "Urgent", className: "bg-red-50 text-red-700 border-red-200" },
};

export default function MaintenanceRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canUpdate = permissions.includes("maintenance.update");
  const canDelete = permissions.includes("maintenance.delete");

  const [request, setRequest] = React.useState<MaintenanceRequestDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isApproveModalOpen, setIsApproveModalOpen] = React.useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = React.useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = React.useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);

  const [actionNotes, setActionNotes] = React.useState("");
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const fetchDetail = React.useCallback(async () => {
    if (!currentOrganization || !id) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<MaintenanceRequestDetail>(
        API_ENDPOINTS.maintenanceRequests.detail(id),
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setRequest((res as any)?.data || res);
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load maintenance request details");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, id]);

  React.useEffect(() => {
    if (currentOrganization && id) {
      fetchDetail();
    }
  }, [currentOrganization, id, fetchDetail]);

  const handleApprove = async () => {
    if (!currentOrganization || !id) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRequests.approve(id),
        { notes: actionNotes },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Maintenance request approved.");
      setIsApproveModalOpen(false);
      setActionNotes("");
      fetchDetail();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!currentOrganization || !id) return;
    if (!rejectionReason.trim()) {
      setFormError("Rejection reason is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRequests.reject(id),
        { rejection_reason: rejectionReason },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Maintenance request rejected.");
      setIsRejectModalOpen(false);
      setRejectionReason("");
      fetchDetail();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSchedule = async () => {
    if (!currentOrganization || !id) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRequests.schedule(id),
        { notes: actionNotes },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Maintenance request scheduled.");
      setIsScheduleModalOpen(false);
      setActionNotes("");
      fetchDetail();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!currentOrganization || !id) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.maintenanceRequests.cancel(id),
        { notes: actionNotes },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      setSuccessMessage("Maintenance request cancelled.");
      setIsCancelModalOpen(false);
      setActionNotes("");
      fetchDetail();
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading maintenance request..." />;
  }

  if (error || !request) {
    return <ErrorState title="Request Not Found" message={error || "Maintenance request could not be loaded"} onRetry={fetchDetail} />;
  }

  const statusCfg = REQUEST_STATUS_CONFIG[request.status] || {
    label: request.status,
    className: "bg-slate-100 text-slate-700",
  };
  const priorityCfg = PRIORITY_CONFIG[request.priority] || {
    label: request.priority,
    className: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/maintenance"
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Maintenance
        </Link>
      </div>

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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-sm shrink-0">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{request.issue_title}</h1>
              <Badge variant="outline" className={`capitalize ${statusCfg.className}`}>
                {statusCfg.label}
              </Badge>
              <Badge variant="outline" className={`capitalize ${priorityCfg.className}`}>
                {priorityCfg.label}
              </Badge>
            </div>
            <p className="text-xs font-mono text-slate-500 mt-1">
              {request.request_number} • Requested on {request.requested_date}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {canUpdate && request.status === "submitted" && (
            <>
              <Button
                onClick={() => {
                  setActionNotes("");
                  setFormError(null);
                  setIsApproveModalOpen(true);
                }}
                className="flex items-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setRejectionReason("");
                  setFormError(null);
                  setIsRejectModalOpen(true);
                }}
                className="flex items-center gap-1.5"
              >
                <X className="h-4 w-4" />
                Reject
              </Button>
            </>
          )}
          {canUpdate && request.status === "approved" && (
            <Button
              onClick={() => {
                setActionNotes("");
                setFormError(null);
                setIsScheduleModalOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Calendar className="h-4 w-4" />
              Schedule Work
            </Button>
          )}
          {canDelete && !["completed", "cancelled"].includes(request.status) && (
            <Button
              variant="outline"
              onClick={() => {
                setActionNotes("");
                setFormError(null);
                setIsCancelModalOpen(true);
              }}
              className="flex items-center gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <X className="h-4 w-4" />
              Cancel Request
            </Button>
          )}
        </div>
      </div>

      {/* Grid details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Issue & Asset */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                Issue Description
              </h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {request.issue_description || "No detailed issue description provided."}
              </p>

              {request.rejection_reason && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <span className="text-xs font-semibold text-red-800 uppercase block">Rejection Reason</span>
                  <p className="text-sm text-red-700 mt-0.5">{request.rejection_reason}</p>
                </div>
              )}

              {request.notes && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="text-xs font-semibold text-slate-700 uppercase block">Activity Notes</span>
                  <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{request.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Associated Work Orders */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-slate-500" />
                  Associated Maintenance Work ({request.records?.length || 0})
                </h2>
              </div>

              {request.records && request.records.length > 0 ? (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden">
                  {request.records.map((rec) => (
                    <div key={rec.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <Link
                          href={`/maintenance/records/${rec.id}`}
                          className="font-mono font-medium text-primary-600 hover:underline text-sm"
                        >
                          {rec.record_number}
                        </Link>
                        <p className="text-xs text-slate-500 mt-0.5 capitalize">
                          Type: {rec.maintenance_type.replace("_", " ")} • Started: {rec.start_date}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-mono font-medium text-slate-900 block">
                          ${Number(rec.total_cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                        <Badge variant="outline" className="capitalize text-xs">
                          {rec.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No maintenance records logged for this request yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Asset & Requester Metadata */}
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Box className="h-4 w-4 text-slate-500" />
                Asset Information
              </h2>
              {request.asset ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 block">Asset Name</span>
                    <Link href={`/assets/${request.asset.id}`} className="font-medium text-primary-600 hover:underline">
                      {request.asset.name}
                    </Link>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Asset Tag / Code</span>
                    <span className="font-mono text-slate-800">{request.asset.asset_code}</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="capitalize text-xs">
                      Status: {request.asset.status}
                    </Badge>
                    <Badge variant="outline" className="capitalize text-xs">
                      Condition: {request.asset.condition}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Asset not available</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                Requester Details
              </h2>
              {request.requester ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 block">Name</span>
                    <span className="font-medium text-slate-900">
                      {request.requester.first_name} {request.requester.last_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Employee Code</span>
                    <span className="font-mono text-slate-800">{request.requester.employee_code}</span>
                  </div>
                  {request.requester.designation && (
                    <div>
                      <span className="text-xs text-slate-400 block">Designation</span>
                      <span className="text-slate-800">{request.requester.designation}</span>
                    </div>
                  )}
                  {request.branch && (
                    <div>
                      <span className="text-xs text-slate-400 block">Branch</span>
                      <span className="text-slate-800">{request.branch.name}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Requester not available</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal: Approve Request */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Approve Maintenance Request"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Confirm approval of maintenance request <strong>{request.request_number}</strong>?
          </p>
          <div>
            <Label htmlFor="appr_notes">Approval Note (Optional)</Label>
            <textarea
              id="appr_notes"
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="e.g. Approved for repairs"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsApproveModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={isSubmitting}>
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
            Reject request <strong>{request.request_number}</strong>. Please provide a reason.
          </p>
          <div>
            <Label htmlFor="rej_reason">Rejection Reason *</Label>
            <textarea
              id="rej_reason"
              required
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why this request cannot be approved..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={isSubmitting}>
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
            Mark request <strong>{request.request_number}</strong> as scheduled.
          </p>
          <div>
            <Label htmlFor="sched_notes">Scheduling Note (Optional)</Label>
            <textarea
              id="sched_notes"
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="e.g. Scheduled for Friday"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSchedule} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Schedule Request"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Cancel Request */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Maintenance Request"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to cancel maintenance request <strong>{request.request_number}</strong>?
          </p>
          <div>
            <Label htmlFor="cncl_notes">Cancellation Note (Optional)</Label>
            <textarea
              id="cncl_notes"
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Reason for cancellation..."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <Button variant="outline" onClick={() => setIsCancelModalOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isSubmitting}>
              {isSubmitting ? "Cancelling..." : "Confirm Cancel"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
