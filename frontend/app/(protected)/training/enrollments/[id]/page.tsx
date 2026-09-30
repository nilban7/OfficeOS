"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Award,
  BookOpen,
  Check,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type {
  TrainingEnrollmentAttendPayload,
  TrainingEnrollmentCompletePayload,
  TrainingEnrollmentDetail,
  TrainingEnrollmentResult,
  TrainingEnrollmentStatus,
} from "@/types/training";

const STATUS_CONFIG: Record<TrainingEnrollmentStatus, { label: string; className: string }> = {
  enrolled: { label: "Enrolled", className: "bg-blue-50 text-blue-700 border-blue-200" },
  attended: { label: "Attended", className: "bg-teal-50 text-teal-700 border-teal-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  no_show: { label: "No Show", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function TrainingEnrollmentDetailPage() {
  const params = useParams<{ id: string }>();
  const enrollmentId = params?.id;

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canManage = permissions.includes("training.manage") || permissions.includes("training.create");
  const canComplete = permissions.includes("training.complete");

  const [enrollment, setEnrollment] = React.useState<TrainingEnrollmentDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isAttendModalOpen, setIsAttendModalOpen] = React.useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = React.useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);

  // Forms
  const [attendForm, setAttendForm] = React.useState<TrainingEnrollmentAttendPayload>({
    status: "attended",
    notes: "",
  });

  const [completeForm, setCompleteForm] = React.useState<TrainingEnrollmentCompletePayload>({
    completion_date: new Date().toISOString().split("T")[0],
    score: 100,
    result: "passed",
    certificate_number: "",
    notes: "",
  });

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const fetchEnrollment = React.useCallback(async () => {
    if (!currentOrganization?.id || !enrollmentId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<TrainingEnrollmentDetail>(
        API_ENDPOINTS.trainingEnrollments.detail(enrollmentId)
      );
      const enrData = (res as any)?.data || res;
      setEnrollment(enrData);
      if (enrData.notes) {
        setAttendForm((prev) => ({ ...prev, notes: enrData.notes || "" }));
        setCompleteForm((prev) => ({ ...prev, notes: enrData.notes || "" }));
      }
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load enrollment record.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, enrollmentId]);

  React.useEffect(() => {
    if (!isOrgLoading && currentOrganization?.id) {
      fetchEnrollment();
    }
  }, [isOrgLoading, currentOrganization?.id, fetchEnrollment]);

  // Mark Attendance
  const handleAttend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingEnrollments.attend(enrollmentId), attendForm);
      setSuccessMessage("Attendance recorded.");
      setIsAttendModalOpen(false);
      fetchEnrollment();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to record attendance.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete Enrollment
  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingEnrollments.complete(enrollmentId), {
        ...completeForm,
        score: completeForm.score !== null ? Number(completeForm.score) : null,
      });
      setSuccessMessage("Enrollment completed and certificate recorded.");
      setIsCompleteModalOpen(false);
      fetchEnrollment();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to complete enrollment.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Enrollment
  const handleCancel = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.trainingEnrollments.cancel(enrollmentId));
      setSuccessMessage("Enrollment cancelled.");
      setIsCancelModalOpen(false);
      fetchEnrollment();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to cancel enrollment.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading enrollment record..." />;
  }

  if (error && !enrollment) {
    return <ErrorState message={error} onRetry={fetchEnrollment} />;
  }

  if (!enrollment) return null;

  const statusConf = STATUS_CONFIG[enrollment.status] || STATUS_CONFIG.enrolled;

  return (
    <div className="space-y-6 pb-12">
      {/* Back button */}
      <div>
        <Link
          href="/training"
          className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Training Hub
        </Link>
      </div>

      {/* Success Alert */}
      {successMessage && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                  {enrollment.employee ? `${enrollment.employee.first_name} ${enrollment.employee.last_name}` : "Participant Record"}
                </h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                  {statusConf.label}
                </span>
              </div>
              <p className="text-sm text-neutral-500 mt-1">
                {enrollment.employee?.employee_code && <span className="font-mono">{enrollment.employee.employee_code} • </span>}
                Enrolled on {enrollment.enrollment_date}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {canManage && enrollment.status === "enrolled" && (
                <Button onClick={() => setIsAttendModalOpen(true)} className="gap-1.5 shadow-sm">
                  <Check className="h-4 w-4" />
                  Mark Attendance
                </Button>
              )}
              {canComplete && (enrollment.status === "enrolled" || enrollment.status === "attended") && (
                <Button onClick={() => setIsCompleteModalOpen(true)} className="gap-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Award className="h-4 w-4" />
                  Complete & Issue Certificate
                </Button>
              )}
              {enrollment.status !== "completed" && enrollment.status !== "cancelled" && (
                <Button variant="outline" onClick={() => setIsCancelModalOpen(true)} className="gap-1.5 shadow-sm text-neutral-600">
                  <X className="h-4 w-4" />
                  Cancel Enrollment
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Course Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-600" />
              Program & Session Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {enrollment.training_program ? (
              <>
                <div className="flex justify-between py-1.5 border-b border-neutral-100">
                  <span className="text-neutral-500">Program Title</span>
                  <Link
                    href={`/training/programs/${enrollment.training_program.id}`}
                    className="font-medium text-blue-600 hover:underline text-right"
                  >
                    {enrollment.training_program.title}
                  </Link>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-100">
                  <span className="text-neutral-500">Program Code</span>
                  <span className="font-mono text-neutral-900">{enrollment.training_program.code}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-100">
                  <span className="text-neutral-500">Delivery Mode</span>
                  <span className="capitalize text-neutral-900">{enrollment.training_program.delivery_mode.replace("_", " ")}</span>
                </div>
              </>
            ) : (
              <p className="text-neutral-400">No program linked.</p>
            )}

            {enrollment.training_session && (
              <>
                <div className="flex justify-between py-1.5 border-b border-neutral-100">
                  <span className="text-neutral-500">Assigned Session</span>
                  <Link
                    href={`/training/sessions/${enrollment.training_session.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {enrollment.training_session.session_number}
                  </Link>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-100">
                  <span className="text-neutral-500">Session Date</span>
                  <span className="text-neutral-900">{enrollment.training_session.session_date}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Completion & Certification */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-600" />
              Certification & Evaluation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="text-neutral-500">Score</span>
              <span className="font-bold text-neutral-900">
                {enrollment.score !== null && enrollment.score !== undefined ? `${enrollment.score}%` : "Pending Evaluation"}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="text-neutral-500">Result</span>
              <span className="font-medium capitalize text-neutral-900">{enrollment.result || "—"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="text-neutral-500">Certificate Number</span>
              <span className="font-mono text-neutral-900">{enrollment.certificate_number || "None Issued"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="text-neutral-500">Completion Date</span>
              <span className="text-neutral-900">{enrollment.completion_date || "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {enrollment.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Notes & Evaluation Log</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-700 whitespace-pre-line leading-relaxed">
              {enrollment.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Modal: Mark Attended */}
      <Modal isOpen={isAttendModalOpen} onClose={() => setIsAttendModalOpen(false)} title="Record Attendance">
        <form onSubmit={handleAttend} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div>
            <Label htmlFor="att-st2">Status</Label>
            <select
              id="att-st2"
              value={attendForm.status}
              onChange={(e) => setAttendForm({ ...attendForm, status: e.target.value as "attended" | "no_show" })}
              className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="attended">Attended</option>
              <option value="no_show">No Show</option>
            </select>
          </div>

          <div>
            <Label htmlFor="att-nt2">Notes</Label>
            <Input
              id="att-nt2"
              value={attendForm.notes || ""}
              onChange={(e) => setAttendForm({ ...attendForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAttendModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Attendance"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Complete Enrollment */}
      <Modal isOpen={isCompleteModalOpen} onClose={() => setIsCompleteModalOpen(false)} title="Complete & Issue Certificate">
        <form onSubmit={handleComplete} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ce-sc">Score (%)</Label>
              <Input
                id="ce-sc"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={completeForm.score ?? 100}
                onChange={(e) => setCompleteForm({ ...completeForm, score: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="ce-res">Result</Label>
              <select
                id="ce-res"
                value={completeForm.result}
                onChange={(e) => setCompleteForm({ ...completeForm, result: e.target.value as TrainingEnrollmentResult })}
                className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="attended">Attended</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ce-cert">Certificate Number</Label>
              <Input
                id="ce-cert"
                placeholder="e.g. CERT-2025-001"
                value={completeForm.certificate_number || ""}
                onChange={(e) => setCompleteForm({ ...completeForm, certificate_number: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="ce-date">Completion Date</Label>
              <Input
                id="ce-date"
                type="date"
                value={completeForm.completion_date || ""}
                onChange={(e) => setCompleteForm({ ...completeForm, completion_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ce-notes">Notes</Label>
            <Input
              id="ce-notes"
              value={completeForm.notes || ""}
              onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsCompleteModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Completing..." : "Complete & Issue"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Cancel Enrollment */}
      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Cancel Enrollment">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Are you sure you want to cancel this training enrollment?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsCancelModalOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isSubmitting}>
              {isSubmitting ? "Cancelling..." : "Cancel Enrollment"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
