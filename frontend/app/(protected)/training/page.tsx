"use client";

import * as React from "react";
import Link from "next/link";
import {
  GraduationCap,
  Plus,
  Search,
  CheckCircle2,
  Eye,
  X,
  Calendar,
  Award,
  BookOpen,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type { Employee } from "@/types/employee";
import type {
  TrainingDeliveryMode,
  TrainingEnrollment,
  TrainingEnrollmentAttendPayload,
  TrainingEnrollmentCompletePayload,
  TrainingEnrollmentCreatePayload,
  TrainingEnrollmentResult,
  TrainingEnrollmentStatus,
  TrainingProgram,
  TrainingProgramCreatePayload,
  TrainingProgramStatus,
  TrainingSession,
  TrainingSessionCreatePayload,
  TrainingSessionStatus,
} from "@/types/training";

const PROGRAM_STATUS_CONFIG: Record<TrainingProgramStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  published: { label: "Published", className: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

const DELIVERY_MODE_CONFIG: Record<TrainingDeliveryMode, { label: string; className: string }> = {
  in_person: { label: "In Person", className: "bg-purple-50 text-purple-700 border-purple-200" },
  online: { label: "Online", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  hybrid: { label: "Hybrid", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  self_paced: { label: "Self Paced", className: "bg-amber-50 text-amber-700 border-amber-200" },
};

const SESSION_STATUS_CONFIG: Record<TrainingSessionStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-purple-50 text-purple-700 border-purple-200" },
  in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

const ENROLLMENT_STATUS_CONFIG: Record<TrainingEnrollmentStatus, { label: string; className: string }> = {
  enrolled: { label: "Enrolled", className: "bg-blue-50 text-blue-700 border-blue-200" },
  attended: { label: "Attended", className: "bg-teal-50 text-teal-700 border-teal-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  no_show: { label: "No Show", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function TrainingPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canCreate = permissions.includes("training.create");
  const canUpdate = permissions.includes("training.update");
  const canManage = permissions.includes("training.manage") || permissions.includes("training.create");
  const canComplete = permissions.includes("training.complete");

  // State
  const [activeTab, setActiveTab] = React.useState<"programs" | "sessions" | "enrollments">("programs");
  const [programs, setPrograms] = React.useState<TrainingProgram[]>([]);
  const [sessions, setSessions] = React.useState<TrainingSession[]>([]);
  const [enrollments, setEnrollments] = React.useState<TrainingEnrollment[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);

  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  // Modals
  const [isAddProgramModalOpen, setIsAddProgramModalOpen] = React.useState(false);
  const [isAddSessionModalOpen, setIsAddSessionModalOpen] = React.useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = React.useState(false);
  const [isAttendModalOpen, setIsAttendModalOpen] = React.useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = React.useState(false);

  const [selectedEnrollment, setSelectedEnrollment] = React.useState<TrainingEnrollment | null>(null);

  // Form states
  const [programForm, setProgramForm] = React.useState<TrainingProgramCreatePayload>({
    title: "",
    code: "",
    description: "",
    category: "General",
    provider: "",
    trainer: "",
    delivery_mode: "in_person",
    duration_hours: 4,
    capacity: 20,
    cost: 0,
    start_date: "",
    end_date: "",
    status: "draft",
  });

  const [sessionForm, setSessionForm] = React.useState<TrainingSessionCreatePayload>({
    training_program_id: "",
    session_number: "",
    title: "",
    session_date: new Date().toISOString().slice(0, 10),
    start_time: "09:00",
    end_time: "17:00",
    location: "Main Office",
    trainer: "",
    capacity: 20,
    notes: "",
    status: "scheduled",
  });

  const [enrollForm, setEnrollForm] = React.useState<TrainingEnrollmentCreatePayload>({
    training_program_id: "",
    training_session_id: null,
    employee_id: "",
    enrollment_date: new Date().toISOString().slice(0, 10),
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

  const fetchData = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    setIsLoading(true);
    setError(null);

    try {
      const [progsRes, sessRes, enrRes, empsRes] = await Promise.all([
        apiClient.get<{ items: TrainingProgram[] }>(API_ENDPOINTS.trainingPrograms.list),
        apiClient.get<{ items: TrainingSession[] }>(API_ENDPOINTS.trainingSessions.list),
        apiClient.get<{ items: TrainingEnrollment[] }>(API_ENDPOINTS.trainingEnrollments.list),
        apiClient.get<{ items: Employee[] }>(API_ENDPOINTS.employees.list).catch(() => ({ items: [] })),
      ]);

      setPrograms((progsRes as any)?.items || (progsRes as any)?.data?.items || []);
      setSessions((sessRes as any)?.items || (sessRes as any)?.data?.items || []);
      setEnrollments((enrRes as any)?.items || (enrRes as any)?.data?.items || []);
      setEmployees((empsRes as any)?.items || (empsRes as any)?.data?.items || []);
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load training data.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id]);

  React.useEffect(() => {
    if (!isOrgLoading && currentOrganization?.id) {
      fetchData();
    }
  }, [isOrgLoading, currentOrganization?.id, fetchData]);

  // Handle Add Program
  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programForm.title || !programForm.code) {
      setFormError("Title and Code are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingPrograms.create, {
        ...programForm,
        duration_hours: Number(programForm.duration_hours) || 0,
        capacity: Number(programForm.capacity) || 0,
        cost: Number(programForm.cost) || 0,
        start_date: programForm.start_date || null,
        end_date: programForm.end_date || null,
      });
      setSuccessMessage("Training program created successfully.");
      setIsAddProgramModalOpen(false);
      setProgramForm({
        title: "",
        code: "",
        description: "",
        category: "General",
        provider: "",
        trainer: "",
        delivery_mode: "in_person",
        duration_hours: 4,
        capacity: 20,
        cost: 0,
        start_date: "",
        end_date: "",
        status: "draft",
      });
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create training program.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Session
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionForm.training_program_id || !sessionForm.session_number || !sessionForm.session_date) {
      setFormError("Program, Session Number, and Date are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingSessions.create, {
        ...sessionForm,
        capacity: Number(sessionForm.capacity) || 0,
      });
      setSuccessMessage("Training session scheduled successfully.");
      setIsAddSessionModalOpen(false);
      setSessionForm({
        training_program_id: "",
        session_number: "",
        title: "",
        session_date: new Date().toISOString().slice(0, 10),
        start_time: "09:00",
        end_time: "17:00",
        location: "Main Office",
        trainer: "",
        capacity: 20,
        notes: "",
        status: "scheduled",
      });
      fetchData();
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

  // Handle Enroll Employee
  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollForm.training_program_id) {
      setFormError("Training program is required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.trainingEnrollments.create, {
        ...enrollForm,
        training_session_id: enrollForm.training_session_id || null,
        employee_id: enrollForm.employee_id || null,
      });
      setSuccessMessage("Employee enrolled successfully.");
      setIsEnrollModalOpen(false);
      setEnrollForm({
        training_program_id: "",
        training_session_id: null,
        employee_id: "",
        enrollment_date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      fetchData();
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

  // Handle Mark Attendance
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
      fetchData();
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

  // Handle Complete Enrollment
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
      setSuccessMessage("Training enrollment completed successfully.");
      setIsCompleteModalOpen(false);
      setSelectedEnrollment(null);
      fetchData();
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

  // Publish Program
  const handlePublishProgram = async (id: string) => {
    try {
      await apiClient.post(API_ENDPOINTS.trainingPrograms.publish(id));
      setSuccessMessage("Training program published.");
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      }
    }
  };

  // Filtered lists
  const filteredPrograms = programs.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      (p.trainer && p.trainer.toLowerCase().includes(search.toLowerCase())) ||
      (p.provider && p.provider.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      (s.title && s.title.toLowerCase().includes(search.toLowerCase())) ||
      s.session_number.toLowerCase().includes(search.toLowerCase()) ||
      (s.location && s.location.toLowerCase().includes(search.toLowerCase())) ||
      (s.trainer && s.trainer.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredEnrollments = enrollments.filter((e) => {
    const empName = e.employee ? `${e.employee.first_name} ${e.employee.last_name}` : "";
    const progTitle = e.training_program ? e.training_program.title : "";
    const matchesSearch =
      empName.toLowerCase().includes(search.toLowerCase()) ||
      progTitle.toLowerCase().includes(search.toLowerCase()) ||
      (e.certificate_number && e.certificate_number.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Metrics
  const publishedCount = programs.filter((p) => p.status === "published").length;
  const activeSessionsCount = sessions.filter((s) => s.status === "scheduled" || s.status === "in_progress").length;
  const completedEnrollmentsCount = enrollments.filter((e) => e.status === "completed").length;

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading training modules..." />;
  }

  if (error && !programs.length && !sessions.length && !enrollments.length) {
    return <ErrorState message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-neutral-700" />
            Training Management
          </h1>
          <p className="text-sm text-neutral-500">
            Manage training programs, schedule learning sessions, track employee certifications and course completions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <Button onClick={() => setIsAddProgramModalOpen(true)} className="gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" />
              New Program
            </Button>
          )}
          {canManage && (
            <Button variant="outline" onClick={() => setIsAddSessionModalOpen(true)} className="gap-1.5 shadow-sm">
              <Calendar className="h-4 w-4" />
              Schedule Session
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsEnrollModalOpen(true)} className="gap-1.5 shadow-sm">
            <Users className="h-4 w-4" />
            Enroll Employee
          </Button>
        </div>
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

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Programs</p>
              <h3 className="text-2xl font-bold text-neutral-900">{programs.length}</h3>
              <p className="text-xs text-neutral-400 mt-0.5">{publishedCount} active & published</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-purple-100 p-3 text-purple-600">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Scheduled Sessions</p>
              <h3 className="text-2xl font-bold text-neutral-900">{sessions.length}</h3>
              <p className="text-xs text-neutral-400 mt-0.5">{activeSessionsCount} currently active</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-indigo-100 p-3 text-indigo-600">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Enrollments</p>
              <h3 className="text-2xl font-bold text-neutral-900">{enrollments.length}</h3>
              <p className="text-xs text-neutral-400 mt-0.5">Across all learning modules</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-emerald-100 p-3 text-emerald-600">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Certifications & Completed</p>
              <h3 className="text-2xl font-bold text-neutral-900">{completedEnrollmentsCount}</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                {enrollments.length > 0
                  ? `${Math.round((completedEnrollmentsCount / enrollments.length) * 100)}% completion rate`
                  : "0% completion rate"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200">
        <button
          onClick={() => {
            setActiveTab("programs");
            setStatusFilter("all");
            setSearch("");
          }}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "programs"
              ? "border-neutral-900 text-neutral-900 font-semibold"
              : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
          }`}
        >
          Training Programs ({programs.length})
        </button>
        <button
          onClick={() => {
            setActiveTab("sessions");
            setStatusFilter("all");
            setSearch("");
          }}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "sessions"
              ? "border-neutral-900 text-neutral-900 font-semibold"
              : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
          }`}
        >
          Training Sessions ({sessions.length})
        </button>
        <button
          onClick={() => {
            setActiveTab("enrollments");
            setStatusFilter("all");
            setSearch("");
          }}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "enrollments"
              ? "border-neutral-900 text-neutral-900 font-semibold"
              : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
          }`}
        >
          Enrollments & Records ({enrollments.length})
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder={
              activeTab === "programs"
                ? "Search programs, trainers, codes..."
                : activeTab === "sessions"
                ? "Search sessions, locations..."
                : "Search employees, certificates..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          >
            <option value="all">All Statuses</option>
            {activeTab === "programs" && (
              <>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </>
            )}
            {activeTab === "sessions" && (
              <>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </>
            )}
            {activeTab === "enrollments" && (
              <>
                <option value="enrolled">Enrolled</option>
                <option value="attended">Attended</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Tab 1: Programs Table */}
      {activeTab === "programs" && (
        <Card>
          <CardContent className="p-0">
            {filteredPrograms.length === 0 ? (
              <EmptyState
                title="No training programs found"
                description={search ? "No programs match your search criteria." : "Create a new training program to get started."}
                actionLabel={canCreate ? "Create Program" : undefined}
                onAction={canCreate ? () => setIsAddProgramModalOpen(true) : undefined}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-neutral-600">
                  <thead className="border-b border-neutral-200 bg-neutral-50/75 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    <tr>
                      <th className="px-6 py-3.5">Code & Title</th>
                      <th className="px-6 py-3.5">Category</th>
                      <th className="px-6 py-3.5">Mode</th>
                      <th className="px-6 py-3.5">Trainer / Provider</th>
                      <th className="px-6 py-3.5">Duration & Capacity</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {filteredPrograms.map((p) => {
                      const statusConf = PROGRAM_STATUS_CONFIG[p.status] || PROGRAM_STATUS_CONFIG.draft;
                      const modeConf = DELIVERY_MODE_CONFIG[p.delivery_mode] || DELIVERY_MODE_CONFIG.in_person;
                      return (
                        <tr key={p.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <Link
                              href={`/training/programs/${p.id}`}
                              className="font-medium text-neutral-900 hover:text-blue-600 transition-colors"
                            >
                              {p.title}
                            </Link>
                            <div className="text-xs text-neutral-400 font-mono mt-0.5">{p.code}</div>
                          </td>
                          <td className="px-6 py-4 text-neutral-600">
                            {p.category || "General"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${modeConf.className}`}>
                              {modeConf.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-neutral-600">
                            {p.trainer || p.provider || "—"}
                          </td>
                          <td className="px-6 py-4 text-neutral-600">
                            <div>{p.duration_hours} hrs</div>
                            <div className="text-xs text-neutral-400 mt-0.5">
                              {p.enrolled_count ?? 0} / {p.capacity > 0 ? p.capacity : "∞"} enrolled
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                              {statusConf.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {p.status === "draft" && canUpdate && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePublishProgram(p.id)}
                                  className="h-8 text-xs font-medium text-blue-600 border-blue-200 hover:bg-blue-50"
                                >
                                  Publish
                                </Button>
                              )}
                              <Link href={`/training/programs/${p.id}`}>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Sessions Table */}
      {activeTab === "sessions" && (
        <Card>
          <CardContent className="p-0">
            {filteredSessions.length === 0 ? (
              <EmptyState
                title="No training sessions scheduled"
                description={search ? "No sessions match your search criteria." : "Schedule a training session for a program."}
                actionLabel={canManage ? "Schedule Session" : undefined}
                onAction={canManage ? () => setIsAddSessionModalOpen(true) : undefined}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-neutral-600">
                  <thead className="border-b border-neutral-200 bg-neutral-50/75 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    <tr>
                      <th className="px-6 py-3.5">Session #</th>
                      <th className="px-6 py-3.5">Program</th>
                      <th className="px-6 py-3.5">Date & Time</th>
                      <th className="px-6 py-3.5">Location / Trainer</th>
                      <th className="px-6 py-3.5">Capacity</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {filteredSessions.map((s) => {
                      const statusConf = SESSION_STATUS_CONFIG[s.status] || SESSION_STATUS_CONFIG.scheduled;
                      return (
                        <tr key={s.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <Link
                              href={`/training/sessions/${s.id}`}
                              className="font-medium text-neutral-900 hover:text-blue-600 transition-colors"
                            >
                              {s.session_number}
                            </Link>
                            {s.title && <div className="text-xs text-neutral-400 mt-0.5">{s.title}</div>}
                          </td>
                          <td className="px-6 py-4">
                            {s.training_program ? (
                              <Link
                                href={`/training/programs/${s.training_program.id}`}
                                className="text-neutral-900 font-medium hover:underline"
                              >
                                {s.training_program.title}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-6 py-4 text-neutral-600">
                            <div>{s.session_date}</div>
                            {(s.start_time || s.end_time) && (
                              <div className="text-xs text-neutral-400 mt-0.5">
                                {s.start_time || ""} {s.end_time ? `- ${s.end_time}` : ""}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-neutral-600">
                            <div>{s.location || "Online / TBD"}</div>
                            {s.trainer && <div className="text-xs text-neutral-400 mt-0.5">{s.trainer}</div>}
                          </td>
                          <td className="px-6 py-4 text-neutral-600">
                            {s.enrolled_count ?? 0} / {s.capacity > 0 ? s.capacity : "∞"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                              {statusConf.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link href={`/training/sessions/${s.id}`}>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Enrollments Table */}
      {activeTab === "enrollments" && (
        <Card>
          <CardContent className="p-0">
            {filteredEnrollments.length === 0 ? (
              <EmptyState
                title="No training enrollments"
                description={search ? "No enrollments match your search criteria." : "Enroll employees in active training programs."}
                actionLabel="Enroll Employee"
                onAction={() => setIsEnrollModalOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-neutral-600">
                  <thead className="border-b border-neutral-200 bg-neutral-50/75 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    <tr>
                      <th className="px-6 py-3.5">Employee</th>
                      <th className="px-6 py-3.5">Training Program</th>
                      <th className="px-6 py-3.5">Enrollment Date</th>
                      <th className="px-6 py-3.5">Score / Result</th>
                      <th className="px-6 py-3.5">Certificate</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {filteredEnrollments.map((e) => {
                      const statusConf = ENROLLMENT_STATUS_CONFIG[e.status] || ENROLLMENT_STATUS_CONFIG.enrolled;
                      return (
                        <tr key={e.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-6 py-4">
                            {e.employee ? (
                              <div>
                                <div className="font-medium text-neutral-900">
                                  {e.employee.first_name} {e.employee.last_name}
                                </div>
                                <div className="text-xs text-neutral-400 font-mono mt-0.5">
                                  {e.employee.employee_code}
                                </div>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {e.training_program ? (
                              <Link
                                href={`/training/programs/${e.training_program.id}`}
                                className="font-medium text-neutral-900 hover:underline"
                              >
                                {e.training_program.title}
                              </Link>
                            ) : (
                              "—"
                            )}
                            {e.training_session && (
                              <div className="text-xs text-neutral-400 mt-0.5">
                                Session: {e.training_session.session_number}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-neutral-600">
                            {e.enrollment_date}
                          </td>
                          <td className="px-6 py-4 text-neutral-600">
                            {e.score !== null && e.score !== undefined ? (
                              <div>
                                <span className="font-semibold text-neutral-900">{e.score}%</span>
                                {e.result && <span className="ml-1.5 capitalize text-xs text-neutral-400">({e.result})</span>}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-6 py-4 text-neutral-600 font-mono text-xs">
                            {e.certificate_number || "—"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                              {statusConf.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
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
                              <Link href={`/training/enrollments/${e.id}`}>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal: Add Program */}
      <Modal
        isOpen={isAddProgramModalOpen}
        onClose={() => setIsAddProgramModalOpen(false)}
        title="Create Training Program"
      >
        <form onSubmit={handleCreateProgram} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prog-code">Program Code *</Label>
              <Input
                id="prog-code"
                placeholder="e.g. TRN-SEC-101"
                value={programForm.code}
                onChange={(e) => setProgramForm({ ...programForm, code: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="prog-title">Title *</Label>
              <Input
                id="prog-title"
                placeholder="e.g. Security & Compliance 2025"
                value={programForm.title}
                onChange={(e) => setProgramForm({ ...programForm, title: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prog-category">Category</Label>
              <Input
                id="prog-category"
                placeholder="e.g. Compliance, Tech, Leadership"
                value={programForm.category || ""}
                onChange={(e) => setProgramForm({ ...programForm, category: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="prog-delivery">Delivery Mode</Label>
              <select
                id="prog-delivery"
                value={programForm.delivery_mode}
                onChange={(e) =>
                  setProgramForm({
                    ...programForm,
                    delivery_mode: e.target.value as TrainingDeliveryMode,
                  })
                }
                className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="in_person">In Person</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
                <option value="self_paced">Self Paced</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prog-trainer">Trainer Name</Label>
              <Input
                id="prog-trainer"
                placeholder="e.g. Sarah Connor"
                value={programForm.trainer || ""}
                onChange={(e) => setProgramForm({ ...programForm, trainer: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="prog-provider">Provider / Vendor</Label>
              <Input
                id="prog-provider"
                placeholder="e.g. Internal SecOps / Coursera"
                value={programForm.provider || ""}
                onChange={(e) => setProgramForm({ ...programForm, provider: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="prog-duration">Duration (hrs)</Label>
              <Input
                id="prog-duration"
                type="number"
                step="0.5"
                min="0"
                value={programForm.duration_hours}
                onChange={(e) => setProgramForm({ ...programForm, duration_hours: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="prog-capacity">Capacity</Label>
              <Input
                id="prog-capacity"
                type="number"
                min="0"
                placeholder="0 for unlimited"
                value={programForm.capacity}
                onChange={(e) => setProgramForm({ ...programForm, capacity: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="prog-cost">Cost ($)</Label>
              <Input
                id="prog-cost"
                type="number"
                step="0.01"
                min="0"
                value={programForm.cost}
                onChange={(e) => setProgramForm({ ...programForm, cost: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="prog-start">Start Date</Label>
              <Input
                id="prog-start"
                type="date"
                value={programForm.start_date || ""}
                onChange={(e) => setProgramForm({ ...programForm, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="prog-end">End Date</Label>
              <Input
                id="prog-end"
                type="date"
                value={programForm.end_date || ""}
                onChange={(e) => setProgramForm({ ...programForm, end_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="prog-desc">Description</Label>
            <textarea
              id="prog-desc"
              rows={3}
              value={programForm.description || ""}
              onChange={(e) => setProgramForm({ ...programForm, description: e.target.value })}
              className="w-full rounded-md border border-neutral-300 p-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              placeholder="Outline objectives, syllabus, and requirements..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddProgramModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Program"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Schedule Session */}
      <Modal
        isOpen={isAddSessionModalOpen}
        onClose={() => setIsAddSessionModalOpen(false)}
        title="Schedule Training Session"
      >
        <form onSubmit={handleCreateSession} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div>
            <Label htmlFor="sess-prog">Training Program *</Label>
            <select
              id="sess-prog"
              value={sessionForm.training_program_id}
              onChange={(e) => setSessionForm({ ...sessionForm, training_program_id: e.target.value })}
              className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              required
            >
              <option value="">Select a Program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sess-num">Session Number *</Label>
              <Input
                id="sess-num"
                placeholder="e.g. SES-2025-01"
                value={sessionForm.session_number}
                onChange={(e) => setSessionForm({ ...sessionForm, session_number: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="sess-title">Session Title</Label>
              <Input
                id="sess-title"
                placeholder="e.g. Module 1: Architecture"
                value={sessionForm.title || ""}
                onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="sess-date">Session Date *</Label>
              <Input
                id="sess-date"
                type="date"
                value={sessionForm.session_date}
                onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="sess-start">Start Time</Label>
              <Input
                id="sess-start"
                placeholder="09:00"
                value={sessionForm.start_time || ""}
                onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="sess-end">End Time</Label>
              <Input
                id="sess-end"
                placeholder="17:00"
                value={sessionForm.end_time || ""}
                onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sess-loc">Location</Label>
              <Input
                id="sess-loc"
                placeholder="Room 301 / Zoom Link"
                value={sessionForm.location || ""}
                onChange={(e) => setSessionForm({ ...sessionForm, location: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="sess-cap">Capacity</Label>
              <Input
                id="sess-cap"
                type="number"
                min="0"
                value={sessionForm.capacity}
                onChange={(e) => setSessionForm({ ...sessionForm, capacity: Number(e.target.value) })}
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
      <Modal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        title="Enroll Employee in Training"
      >
        <form onSubmit={handleEnroll} className="space-y-4">
          {formError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div>
            <Label htmlFor="enr-prog">Training Program *</Label>
            <select
              id="enr-prog"
              value={enrollForm.training_program_id}
              onChange={(e) => setEnrollForm({ ...enrollForm, training_program_id: e.target.value, training_session_id: null })}
              className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              required
            >
              <option value="">Select a Program</option>
              {programs
                .filter((p) => p.status === "published" || p.status === "draft")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.code})
                  </option>
                ))}
            </select>
          </div>

          {canManage && (
            <div>
              <Label htmlFor="enr-emp">Employee</Label>
              <select
                id="enr-emp"
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
            <Label htmlFor="enr-sess">Specific Session (Optional)</Label>
            <select
              id="enr-sess"
              value={enrollForm.training_session_id || ""}
              onChange={(e) => setEnrollForm({ ...enrollForm, training_session_id: e.target.value || null })}
              className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="">Any / Not Assigned</option>
              {sessions
                .filter((s) => !enrollForm.training_program_id || s.training_program_id === enrollForm.training_program_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.session_number} - {s.session_date} ({s.title || "Untitled"})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <Label htmlFor="enr-notes">Notes</Label>
            <Input
              id="enr-notes"
              placeholder="e.g. Required for Q2 compliance"
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
            <Label htmlFor="att-status">Attendance Status</Label>
            <select
              id="att-status"
              value={attendForm.status}
              onChange={(e) => setAttendForm({ ...attendForm, status: e.target.value as "attended" | "no_show" })}
              className="w-full h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="attended">Attended</option>
              <option value="no_show">No Show</option>
            </select>
          </div>

          <div>
            <Label htmlFor="att-notes">Notes</Label>
            <Input
              id="att-notes"
              placeholder="e.g. Attended online session on time"
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
              <Label htmlFor="comp-score">Score (%)</Label>
              <Input
                id="comp-score"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={completeForm.score ?? 100}
                onChange={(e) => setCompleteForm({ ...completeForm, score: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="comp-res">Result</Label>
              <select
                id="comp-res"
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
              <Label htmlFor="comp-cert">Certificate Number</Label>
              <Input
                id="comp-cert"
                placeholder="e.g. CERT-2025-9921"
                value={completeForm.certificate_number || ""}
                onChange={(e) => setCompleteForm({ ...completeForm, certificate_number: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="comp-date">Completion Date</Label>
              <Input
                id="comp-date"
                type="date"
                value={completeForm.completion_date || ""}
                onChange={(e) => setCompleteForm({ ...completeForm, completion_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="comp-notes">Notes</Label>
            <Input
              id="comp-notes"
              placeholder="e.g. Passed final exam with distinction"
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
    </div>
  );
}
