"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Edit2,
  Trash2,
  Award,
  Check,
  X,
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
  TrainingDeliveryMode,
  TrainingEnrollmentCreatePayload,
  TrainingProgramDetail,
  TrainingProgramStatus,
  TrainingProgramUpdatePayload,
  TrainingSessionCreatePayload,
} from "@/types/training";

const STATUS_CONFIG: Record<TrainingProgramStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  published: { label: "Published", className: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

const MODE_CONFIG: Record<TrainingDeliveryMode, { label: string; className: string }> = {
  in_person: { label: "In Person", className: "bg-purple-50 text-purple-700 border-purple-200" },
  online: { label: "Online", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  hybrid: { label: "Hybrid", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  self_paced: { label: "Self Paced", className: "bg-amber-50 text-amber-700 border-amber-200" },
};

export default function TrainingProgramDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const programId = params?.id || "";

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canUpdate = permissions.includes("training.update");
  const canDelete = permissions.includes("training.delete");
  const canManage = permissions.includes("training.manage") || permissions.includes("training.create");
  const canComplete = permissions.includes("training.complete");

  const [program, setProgram] = React.useState<TrainingProgramDetail | null>(null);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isAddSessionModalOpen, setIsAddSessionModalOpen] = React.useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = React.useState(false);

  // Form states
  const [editForm, setEditForm] = React.useState<TrainingProgramUpdatePayload>({});
  const [sessionForm, setSessionForm] = React.useState<TrainingSessionCreatePayload>({
    training_program_id: programId,
    session_number: "",
    title: "",
    session_date: new Date().toISOString().slice(0, 10),
    start_time: "09:00",
    end_time: "17:00",
    location: "",
    trainer: "",
    capacity: 20,
    notes: "",
    status: "scheduled",
  });

  const [enrollForm, setEnrollForm] = React.useState<TrainingEnrollmentCreatePayload>({
    training_program_id: programId,
    training_session_id: null,
    employee_id: "",
    enrollment_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const fetchProgram = React.useCallback(async () => {
    if (!currentOrganization?.id || !programId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [progRes, empsRes] = await Promise.all([
        apiClient.get<TrainingProgramDetail>(API_ENDPOINTS.trainingPrograms.detail(programId)),
        apiClient.get<{ items: Employee[] }>(API_ENDPOINTS.employees.list).catch(() => ({ data: { items: [] } })),
      ]);

      const progData = (progRes as any)?.data || progRes;
      const empsData = (empsRes as any)?.data?.items || (empsRes as any)?.items || [];

      setProgram(progData);
      setEmployees(empsData);
      setEditForm({
        title: progData.title,
        code: progData.code,
        description: progData.description,
        category: progData.category,
        provider: progData.provider,
        trainer: progData.trainer,
        delivery_mode: progData.delivery_mode,
        duration_hours: progData.duration_hours,
        capacity: progData.capacity,
        cost: progData.cost,
        start_date: progData.start_date,
        end_date: progData.end_date,
        status: progData.status,
      });
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load training program details.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, programId]);

  React.useEffect(() => {
    if (!isOrgLoading && currentOrganization?.id) {
      fetchProgram();
    }
  }, [isOrgLoading, currentOrganization?.id, fetchProgram]);

  // Update Program
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.patch(API_ENDPOINTS.trainingPrograms.update(programId), {
        ...editForm,
        duration_hours: editForm.duration_hours !== undefined ? Number(editForm.duration_hours) : undefined,
        capacity: editForm.capacity !== undefined ? Number(editForm.capacity) : undefined,
        cost: editForm.cost !== undefined ? Number(editForm.cost) : undefined,
      });
      setSuccessMessage("Training program updated successfully.");
      setIsEditModalOpen(false);
      fetchProgram();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update program.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Publish Program
  const handlePublish = async () => {
    try {
      await apiClient.post(API_ENDPOINTS.trainingPrograms.publish(programId));
      setSuccessMessage("Program published successfully.");
      fetchProgram();
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      }
    }
  };

  // Complete Program
  const handleComplete = async () => {
    try {
      await apiClient.post(API_ENDPOINTS.trainingPrograms.complete(programId));
      setSuccessMessage("Program marked as completed.");
      fetchProgram();
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      }
    }
  };

  // Cancel Program
  const handleCancel = async () => {
    try {
      await apiClient.post(API_ENDPOINTS.trainingPrograms.cancel(programId));
      setSuccessMessage("Program cancelled.");
      fetchProgram();
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      }
    }
  };

  // Delete Program
  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.delete(API_ENDPOINTS.trainingPrograms.delete(programId));
      router.push("/training");
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to delete program.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Session
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingSessions.create, {
        ...sessionForm,
        training_program_id: programId,
        capacity: Number(sessionForm.capacity) || 0,
      });
      setSuccessMessage("Session scheduled successfully.");
      setIsAddSessionModalOpen(false);
      fetchProgram();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to schedule session.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enroll Employee
  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingEnrollments.create, {
        ...enrollForm,
        training_program_id: programId,
        training_session_id: enrollForm.training_session_id || null,
        employee_id: enrollForm.employee_id || null,
      });
      setSuccessMessage("Employee enrolled successfully.");
      setIsEnrollModalOpen(false);
      fetchProgram();
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

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading program details..." />;
  }

  if (error && !program) {
    return <ErrorState message={error} onRetry={fetchProgram} />;
  }

  if (!program) return null;

  const statusConf = STATUS_CONFIG[program.status] || STATUS_CONFIG.draft;
  const modeConf = MODE_CONFIG[program.delivery_mode] || MODE_CONFIG.in_person;

  return (
    <div className="space-y-6 pb-12">
      {/* Back Button */}
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

      {/* Main Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{program.title}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                  {statusConf.label}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${modeConf.className}`}>
                  {modeConf.label}
                </span>
              </div>
              <p className="font-mono text-sm text-neutral-500 mt-1">{program.code}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {program.status === "draft" && canUpdate && (
                <Button onClick={handlePublish} className="gap-1.5 shadow-sm">
                  <Check className="h-4 w-4" />
                  Publish Program
                </Button>
              )}
              {program.status === "published" && canComplete && (
                <Button onClick={handleComplete} variant="outline" className="gap-1.5 shadow-sm text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                  <Award className="h-4 w-4" />
                  Complete Program
                </Button>
              )}
              {program.status !== "completed" && program.status !== "cancelled" && canDelete && (
                <Button onClick={handleCancel} variant="outline" className="gap-1.5 shadow-sm text-neutral-600">
                  <X className="h-4 w-4" />
                  Cancel Program
                </Button>
              )}
              {canUpdate && (
                <Button variant="outline" onClick={() => setIsEditModalOpen(true)} className="gap-1.5 shadow-sm">
                  <Edit2 className="h-4 w-4" />
                  Edit
                </Button>
              )}
              {canDelete && (!program.enrollments || program.enrollments.length === 0) && (
                <Button variant="outline" onClick={() => setIsDeleteModalOpen(true)} className="gap-1.5 shadow-sm text-red-600 border-red-200 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-neutral-100">
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Duration</p>
              <p className="text-lg font-bold text-neutral-900 mt-0.5">{program.duration_hours} hours</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Enrolled / Capacity</p>
              <p className="text-lg font-bold text-neutral-900 mt-0.5">
                {program.enrolled_count ?? 0} / {program.capacity > 0 ? program.capacity : "Unlimited"}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Trainer / Provider</p>
              <p className="text-lg font-bold text-neutral-900 mt-0.5">{program.trainer || program.provider || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Cost</p>
              <p className="text-lg font-bold text-neutral-900 mt-0.5">
                {program.cost > 0 ? `$${program.cost.toFixed(2)}` : "Free / Internal"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description & Syllabus */}
      {program.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Program Overview & Syllabus</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-700 whitespace-pre-line leading-relaxed">
              {program.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sessions Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">
            Scheduled Sessions ({program.sessions?.length || 0})
          </CardTitle>
          {canManage && (
            <Button size="sm" onClick={() => setIsAddSessionModalOpen(true)} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add Session
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!program.sessions || program.sessions.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              No sessions scheduled for this program yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-neutral-600">
                <thead className="border-b border-neutral-200 bg-neutral-50/75 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-6 py-3">Session #</th>
                    <th className="px-6 py-3">Date & Time</th>
                    <th className="px-6 py-3">Location</th>
                    <th className="px-6 py-3">Trainer</th>
                    <th className="px-6 py-3">Capacity</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {program.sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-3.5 font-medium text-neutral-900">
                        <Link href={`/training/sessions/${s.id}`} className="hover:underline text-blue-600">
                          {s.session_number}
                        </Link>
                        {s.title && <div className="text-xs text-neutral-400 font-normal">{s.title}</div>}
                      </td>
                      <td className="px-6 py-3.5">
                        {s.session_date} {s.start_time ? `(${s.start_time} - ${s.end_time || ""})` : ""}
                      </td>
                      <td className="px-6 py-3.5">{s.location || "TBD"}</td>
                      <td className="px-6 py-3.5">{s.trainer || "—"}</td>
                      <td className="px-6 py-3.5">{s.capacity > 0 ? s.capacity : "Unlimited"}</td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 capitalize">
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrollments Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">
            Enrolled Employees ({program.enrollments?.length || 0})
          </CardTitle>
          <Button size="sm" onClick={() => setIsEnrollModalOpen(true)} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Enroll Employee
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!program.enrollments || program.enrollments.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              No employees enrolled in this program yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-neutral-600">
                <thead className="border-b border-neutral-200 bg-neutral-50/75 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-6 py-3">Employee</th>
                    <th className="px-6 py-3">Enrollment Date</th>
                    <th className="px-6 py-3">Score / Result</th>
                    <th className="px-6 py-3">Certificate #</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {program.enrollments.map((e) => (
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
                      <td className="px-6 py-3.5 font-mono text-xs">{e.certificate_number || "—"}</td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 capitalize">
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Edit Program */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Training Program">
        <form onSubmit={handleUpdate} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-code">Code</Label>
              <Input
                id="edit-code"
                value={editForm.code || ""}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-cat">Category</Label>
              <Input
                id="edit-cat"
                value={editForm.category || ""}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-mode">Delivery Mode</Label>
              <select
                id="edit-mode"
                value={editForm.delivery_mode}
                onChange={(e) => setEditForm({ ...editForm, delivery_mode: e.target.value as TrainingDeliveryMode })}
                className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="in_person">In Person</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
                <option value="self_paced">Self Paced</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="edit-dur">Duration (hrs)</Label>
              <Input
                id="edit-dur"
                type="number"
                step="0.5"
                value={editForm.duration_hours || 0}
                onChange={(e) => setEditForm({ ...editForm, duration_hours: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="edit-cap">Capacity</Label>
              <Input
                id="edit-cap"
                type="number"
                value={editForm.capacity || 0}
                onChange={(e) => setEditForm({ ...editForm, capacity: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="edit-cost">Cost ($)</Label>
              <Input
                id="edit-cost"
                type="number"
                step="0.01"
                value={editForm.cost || 0}
                onChange={(e) => setEditForm({ ...editForm, cost: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-desc">Description</Label>
            <textarea
              id="edit-desc"
              rows={3}
              value={editForm.description || ""}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
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

      {/* Modal: Add Session */}
      <Modal isOpen={isAddSessionModalOpen} onClose={() => setIsAddSessionModalOpen(false)} title="Schedule Session">
        <form onSubmit={handleCreateSession} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="s-num">Session Number *</Label>
              <Input
                id="s-num"
                value={sessionForm.session_number}
                onChange={(e) => setSessionForm({ ...sessionForm, session_number: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="s-title">Title</Label>
              <Input
                id="s-title"
                value={sessionForm.title || ""}
                onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="s-date">Date *</Label>
              <Input
                id="s-date"
                type="date"
                value={sessionForm.session_date}
                onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="s-start">Start Time</Label>
              <Input
                id="s-start"
                value={sessionForm.start_time || ""}
                onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="s-end">End Time</Label>
              <Input
                id="s-end"
                value={sessionForm.end_time || ""}
                onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddSessionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Scheduling..." : "Schedule Session"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Enroll Employee */}
      <Modal isOpen={isEnrollModalOpen} onClose={() => setIsEnrollModalOpen(false)} title="Enroll Employee">
        <form onSubmit={handleEnroll} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          {canManage && (
            <div>
              <Label htmlFor="e-emp">Employee</Label>
              <select
                id="e-emp"
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
            <Label htmlFor="e-sess">Session (Optional)</Label>
            <select
              id="e-sess"
              value={enrollForm.training_session_id || ""}
              onChange={(e) => setEnrollForm({ ...enrollForm, training_session_id: e.target.value || null })}
              className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="">Any Session / Unassigned</option>
              {program.sessions?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.session_number} ({s.session_date})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="e-notes">Notes</Label>
            <Input
              id="e-notes"
              value={enrollForm.notes || ""}
              onChange={(e) => setEnrollForm({ ...enrollForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsEnrollModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enrolling..." : "Enroll"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Program">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Are you sure you want to permanently delete this training program? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              {isSubmitting ? "Deleting..." : "Delete Program"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
