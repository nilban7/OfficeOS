"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Edit2,
  Trash2,
  Check,
  X,
  BookOpen,
  Plus,
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
import type { Employee } from "@/types/employee";
import type {
  TrainingEnrollment,
  TrainingEnrollmentAttendPayload,
  TrainingEnrollmentCompletePayload,
  TrainingEnrollmentCreatePayload,
  TrainingEnrollmentResult,
  TrainingSessionDetail,
  TrainingSessionStatus,
  TrainingSessionUpdatePayload,
} from "@/types/training";

const SESSION_STATUS_CONFIG: Record<TrainingSessionStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-purple-50 text-purple-700 border-purple-200" },
  in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

export default function TrainingSessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id;

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canUpdate = permissions.includes("training.update");
  const canDelete = permissions.includes("training.delete");
  const canManage = permissions.includes("training.manage") || permissions.includes("training.create");
  const canComplete = permissions.includes("training.complete");

  const [session, setSession] = React.useState<TrainingSessionDetail | null>(null);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = React.useState(false);
  const [isAttendModalOpen, setIsAttendModalOpen] = React.useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = React.useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = React.useState<TrainingEnrollment | null>(null);

  // Forms
  const [editForm, setEditForm] = React.useState<TrainingSessionUpdatePayload>({});
  const [enrollForm, setEnrollForm] = React.useState<TrainingEnrollmentCreatePayload>({
    training_program_id: "",
    training_session_id: sessionId,
    employee_id: "",
    enrollment_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

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

  const fetchSession = React.useCallback(async () => {
    if (!currentOrganization?.id || !sessionId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [sessRes, empsRes] = await Promise.all([
        apiClient.get<TrainingSessionDetail>(API_ENDPOINTS.trainingSessions.detail(sessionId)),
        apiClient.get<{ items: Employee[] }>(API_ENDPOINTS.employees.list).catch(() => ({ data: { items: [] } })),
      ]);

      const sessData = (sessRes as any)?.data || sessRes;
      const empsData = (empsRes as any)?.data?.items || (empsRes as any)?.items || [];

      setSession(sessData);
      setEmployees(empsData);
      setEditForm({
        session_number: sessData.session_number,
        title: sessData.title,
        session_date: sessData.session_date,
        start_time: sessData.start_time,
        end_time: sessData.end_time,
        location: sessData.location,
        trainer: sessData.trainer,
        capacity: sessData.capacity,
        notes: sessData.notes,
        status: sessData.status,
      });
      setEnrollForm((prev) => ({
        ...prev,
        training_program_id: sessData.training_program_id,
        training_session_id: sessionId,
      }));
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load training session details.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, sessionId]);

  React.useEffect(() => {
    if (!isOrgLoading && currentOrganization?.id) {
      fetchSession();
    }
  }, [isOrgLoading, currentOrganization?.id, fetchSession]);

  // Update Session
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.patch(API_ENDPOINTS.trainingSessions.update(sessionId), {
        ...editForm,
        capacity: editForm.capacity !== undefined ? Number(editForm.capacity) : undefined,
      });
      setSuccessMessage("Training session updated.");
      setIsEditModalOpen(false);
      fetchSession();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update session.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status Change
  const handleStatusChange = async (newStatus: TrainingSessionStatus) => {
    try {
      await apiClient.patch(API_ENDPOINTS.trainingSessions.update(sessionId), {
        status: newStatus,
      });
      setSuccessMessage(`Session status updated to ${newStatus}.`);
      fetchSession();
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      }
    }
  };

  // Delete Session
  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.delete(API_ENDPOINTS.trainingSessions.delete(sessionId));
      router.push("/training");
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to delete session.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enroll in Session
  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingEnrollments.create, {
        training_program_id: session.training_program_id,
        training_session_id: sessionId,
        employee_id: enrollForm.employee_id || null,
        enrollment_date: enrollForm.enrollment_date || new Date().toISOString().split("T")[0],
        notes: enrollForm.notes || null,
      });
      setSuccessMessage("Employee enrolled in this session.");
      setIsEnrollModalOpen(false);
      fetchSession();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to enroll employee.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mark Attendance
  const handleAttend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingEnrollments.attend(selectedEnrollment.id), attendForm);
      setSuccessMessage("Attendance recorded successfully.");
      setIsAttendModalOpen(false);
      setSelectedEnrollment(null);
      fetchSession();
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
    if (!selectedEnrollment) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingEnrollments.complete(selectedEnrollment.id), {
        ...completeForm,
        score: completeForm.score !== null ? Number(completeForm.score) : null,
      });
      setSuccessMessage("Enrollment completed successfully.");
      setIsCompleteModalOpen(false);
      setSelectedEnrollment(null);
      fetchSession();
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

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading session details..." />;
  }

  if (error && !session) {
    return <ErrorState message={error} onRetry={fetchSession} />;
  }

  if (!session) return null;

  const statusConf = SESSION_STATUS_CONFIG[session.status] || SESSION_STATUS_CONFIG.scheduled;

  return (
    <div className="space-y-6 pb-12">
      {/* Back link */}
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
                  {session.session_number}: {session.title || "Training Session"}
                </h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                  {statusConf.label}
                </span>
              </div>
              {session.training_program && (
                <div className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500">
                  <BookOpen className="h-4 w-4" />
                  <span>Program:</span>
                  <Link
                    href={`/training/programs/${session.training_program.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {session.training_program.title} ({session.training_program.code})
                  </Link>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {session.status === "scheduled" && canUpdate && (
                <Button onClick={() => handleStatusChange("in_progress")} className="gap-1.5 shadow-sm">
                  Start Session
                </Button>
              )}
              {session.status === "in_progress" && canUpdate && (
                <Button onClick={() => handleStatusChange("completed")} variant="outline" className="gap-1.5 shadow-sm text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                  <Check className="h-4 w-4" />
                  Mark Completed
                </Button>
              )}
              {session.status !== "completed" && session.status !== "cancelled" && canUpdate && (
                <Button onClick={() => handleStatusChange("cancelled")} variant="outline" className="gap-1.5 shadow-sm text-neutral-600">
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              )}
              {canUpdate && (
                <Button variant="outline" onClick={() => setIsEditModalOpen(true)} className="gap-1.5 shadow-sm">
                  <Edit2 className="h-4 w-4" />
                  Edit
                </Button>
              )}
              {canDelete && (!session.enrollments || session.enrollments.length === 0) && (
                <Button variant="outline" onClick={() => setIsDeleteModalOpen(true)} className="gap-1.5 shadow-sm text-red-600 border-red-200 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-neutral-100">
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Session Date</p>
              <p className="text-lg font-bold text-neutral-900 mt-0.5">{session.session_date}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Timing</p>
              <p className="text-lg font-bold text-neutral-900 mt-0.5">
                {session.start_time || "—"} {session.end_time ? `- ${session.end_time}` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Location</p>
              <p className="text-lg font-bold text-neutral-900 mt-0.5">{session.location || "Online / TBD"}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Attendees</p>
              <p className="text-lg font-bold text-neutral-900 mt-0.5">
                {session.enrolled_count ?? 0} / {session.capacity > 0 ? session.capacity : "Unlimited"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes / Instructions */}
      {session.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Session Notes & Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-700 whitespace-pre-line leading-relaxed">
              {session.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Attendees Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">
            Registered Attendees ({session.enrollments?.length || 0})
          </CardTitle>
          <Button size="sm" onClick={() => setIsEnrollModalOpen(true)} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add Attendee
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!session.enrollments || session.enrollments.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              No employees registered for this session yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-neutral-600">
                <thead className="border-b border-neutral-200 bg-neutral-50/75 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-6 py-3">Employee</th>
                    <th className="px-6 py-3">Enrollment Date</th>
                    <th className="px-6 py-3">Score / Result</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {session.enrollments.map((e) => (
                    <tr key={e.id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-3.5 font-medium text-neutral-900">
                        {e.employee ? (
                          <Link href={`/training/enrollments/${e.id}`} className="hover:underline text-blue-600">
                            {e.employee.first_name} {e.employee.last_name} ({e.employee.employee_code})
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-3.5">{e.enrollment_date}</td>
                      <td className="px-6 py-3.5">
                        {e.score !== null && e.score !== undefined ? `${e.score}% (${e.result || ""})` : "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 capitalize">
                          {e.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManage && e.status === "enrolled" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedEnrollment(e);
                                setIsAttendModalOpen(true);
                              }}
                              className="h-7 text-xs px-2"
                            >
                              Mark Attended
                            </Button>
                          )}
                          {canComplete && (e.status === "enrolled" || e.status === "attended") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedEnrollment(e);
                                setIsCompleteModalOpen(true);
                              }}
                              className="h-7 text-xs px-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            >
                              Complete
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
        </CardContent>
      </Card>

      {/* Modal: Edit Session */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Session">
        <form onSubmit={handleUpdate} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ed-num">Session Number *</Label>
              <Input
                id="ed-num"
                value={editForm.session_number || ""}
                onChange={(e) => setEditForm({ ...editForm, session_number: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="ed-title">Title</Label>
              <Input
                id="ed-title"
                value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="ed-date">Date *</Label>
              <Input
                id="ed-date"
                type="date"
                value={editForm.session_date || ""}
                onChange={(e) => setEditForm({ ...editForm, session_date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="ed-start">Start Time</Label>
              <Input
                id="ed-start"
                value={editForm.start_time || ""}
                onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="ed-end">End Time</Label>
              <Input
                id="ed-end"
                value={editForm.end_time || ""}
                onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ed-loc">Location</Label>
              <Input
                id="ed-loc"
                value={editForm.location || ""}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="ed-cap">Capacity</Label>
              <Input
                id="ed-cap"
                type="number"
                value={editForm.capacity || 0}
                onChange={(e) => setEditForm({ ...editForm, capacity: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ed-notes">Notes</Label>
            <textarea
              id="ed-notes"
              rows={3}
              value={editForm.notes || ""}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className="w-full rounded-md border border-neutral-300 p-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Enroll Employee */}
      <Modal isOpen={isEnrollModalOpen} onClose={() => setIsEnrollModalOpen(false)} title="Add Attendee to Session">
        <form onSubmit={handleEnroll} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          {canManage && (
            <div>
              <Label htmlFor="sess-emp">Employee</Label>
              <select
                id="sess-emp"
                value={enrollForm.employee_id || ""}
                onChange={(e) => setEnrollForm({ ...enrollForm, employee_id: e.target.value })}
                className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="">Self Enrollment (Current User)</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="sess-notes">Notes</Label>
            <Input
              id="sess-notes"
              value={enrollForm.notes || ""}
              onChange={(e) => setEnrollForm({ ...enrollForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsEnrollModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Attendee"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Mark Attended */}
      <Modal
        isOpen={isAttendModalOpen}
        onClose={() => {
          setIsAttendModalOpen(false);
          setSelectedEnrollment(null);
        }}
        title="Record Attendance"
      >
        <form onSubmit={handleAttend} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div>
            <Label htmlFor="att-st">Attendance Status</Label>
            <select
              id="att-st"
              value={attendForm.status}
              onChange={(e) => setAttendForm({ ...attendForm, status: e.target.value as "attended" | "no_show" })}
              className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="attended">Attended</option>
              <option value="no_show">No Show</option>
            </select>
          </div>

          <div>
            <Label htmlFor="att-nt">Notes</Label>
            <Input
              id="att-nt"
              value={attendForm.notes || ""}
              onChange={(e) => setAttendForm({ ...attendForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAttendModalOpen(false);
                setSelectedEnrollment(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record Attendance"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Complete Enrollment */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => {
          setIsCompleteModalOpen(false);
          setSelectedEnrollment(null);
        }}
        title="Complete Training & Issue Certificate"
      >
        <form onSubmit={handleComplete} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cs-score">Score (%)</Label>
              <Input
                id="cs-score"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={completeForm.score ?? 100}
                onChange={(e) => setCompleteForm({ ...completeForm, score: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="cs-res">Result</Label>
              <select
                id="cs-res"
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
              <Label htmlFor="cs-cert">Certificate Number</Label>
              <Input
                id="cs-cert"
                placeholder="e.g. CERT-2025-001"
                value={completeForm.certificate_number || ""}
                onChange={(e) => setCompleteForm({ ...completeForm, certificate_number: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cs-date">Completion Date</Label>
              <Input
                id="cs-date"
                type="date"
                value={completeForm.completion_date || ""}
                onChange={(e) => setCompleteForm({ ...completeForm, completion_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cs-notes">Notes</Label>
            <Input
              id="cs-notes"
              value={completeForm.notes || ""}
              onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCompleteModalOpen(false);
                setSelectedEnrollment(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Completing..." : "Complete & Issue"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Session">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Are you sure you want to permanently delete this training session?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              {isSubmitting ? "Deleting..." : "Delete Session"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
