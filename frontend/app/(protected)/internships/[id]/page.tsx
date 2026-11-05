"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Star,
  Plus,
  Trash2,
  X,
  Calendar,
  Building2,
  Mail,
  DollarSign,
  FileText,
  Download,
  CreditCard,
  CheckCircle2,
  GraduationCap,
  ShieldCheck,
  UserCheck,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
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
import type {
  InternshipDetail,
  InternshipStatus,
  InternshipReviewCreate,
  InternshipSupervisorCreate,
  InternshipStudentCreate,
  InternshipDocumentCreate,
  InternshipDocumentType,
  StipendDisbursement,
  StipendCreateDisburseRequest,
} from "@/types/internship";

const STATUS_CONFIG: Record<InternshipStatus, { label: string; className: string }> = {
  planned: { label: "Planned", className: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  active: { label: "Active", className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800" },
  extended: { label: "Extended", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800" },
  terminated: { label: "Terminated", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700" },
};

const DOC_TYPES: { value: InternshipDocumentType; label: string }[] = [
  { value: "offer_letter", label: "Offer Letter" },
  { value: "agreement_nda", label: "Agreement / NDA" },
  { value: "id_proof", label: "ID Proof / Government ID" },
  { value: "college_noc", label: "College NOC" },
  { value: "completion_certificate", label: "Completion Certificate" },
  { value: "evaluation_report", label: "Evaluation Report" },
  { value: "other", label: "Other Document" },
];

type Tab = "overview" | "students" | "documents" | "supervisors" | "reviews" | "stipends";

export default function InternshipDetailPage() {
  const params = useParams<{ id: string }>();
  const internshipId = params?.id || "";
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canManage = permissions.includes("internships.manage") || permissions.includes("internships.edit");
  const canReview = permissions.includes("internships.review");
  const canView = permissions.includes("internships.view");

  const [internship, setInternship] = React.useState<InternshipDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("overview");

  // Lifecycle action state
  const [actionLoading, setActionLoading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Supervisor modal
  const [showAddSupervisorModal, setShowAddSupervisorModal] = React.useState(false);
  const [supForm, setSupForm] = React.useState<InternshipSupervisorCreate>({
    employee_id: "",
    role: "supervisor",
  });
  const [supLoading, setSupLoading] = React.useState(false);
  const [supError, setSupError] = React.useState<string | null>(null);

  // Review modal
  const [showAddReviewModal, setShowAddReviewModal] = React.useState(false);
  const [reviewForm, setReviewForm] = React.useState<InternshipReviewCreate>({
    review_date: new Date().toISOString().slice(0, 10),
    rating: undefined,
    feedback: "",
    status: "draft",
  });
  const [reviewLoading, setReviewLoading] = React.useState(false);
  const [reviewError, setReviewError] = React.useState<string | null>(null);

  // Students (Cohort enrollees)
  const [showAddStudentModal, setShowAddStudentModal] = React.useState(false);
  const [studentForm, setStudentForm] = React.useState<InternshipStudentCreate>({
    student_name: "",
    student_email: "",
    institution: "",
    stipend: "0.00",
    status: "active",
    notes: "",
  });
  const [studentLoading, setStudentLoading] = React.useState(false);
  const [studentError, setStudentError] = React.useState<string | null>(null);

  // Documents
  const [showAddDocModal, setShowAddDocModal] = React.useState(false);
  const [docForm, setDocForm] = React.useState<InternshipDocumentCreate>({
    title: "",
    document_type: "offer_letter",
    intern_name: "",
    file_name: "",
    file_size: 102400,
    mime_type: "application/pdf",
    file_url: "",
    notes: "",
  });
  const [docLoading, setDocLoading] = React.useState(false);
  const [docError, setDocError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const processSelectedFile = (file: File) => {
    setSelectedFile(file);
    const cleanTitle = docForm.title.trim() === "" ? file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ") : docForm.title;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result as string;
      setDocForm((prev) => ({
        ...prev,
        title: cleanTitle,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || "application/pdf",
        // If file_url is not manually populated, set to dataUrl
        file_url: prev.file_url && prev.file_url.trim() !== "" ? prev.file_url : dataUrl,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  // Stipends
  const [stipends, setStipends] = React.useState<StipendDisbursement[]>([]);
  const [stipendsLoading, setStipendsLoading] = React.useState(false);
  const [showDisburseModal, setShowDisburseModal] = React.useState(false);
  const [disburseForm, setDisburseForm] = React.useState<StipendCreateDisburseRequest>({
    internship_id: internshipId,
    intern_name: "",
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    stipend_amount: "0.00",
    payment_method: "bank_transfer",
    payment_reference: "",
    notes: "",
  });
  const [disburseLoading, setDisburseLoading] = React.useState(false);
  const [disburseError, setDisburseError] = React.useState<string | null>(null);

  const fetchInternship = React.useCallback(async () => {
    if (!currentOrganization?.id || !internshipId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.internships.detail(internshipId));
      const data = (res as any)?.data || res;
      setInternship(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load internship.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, internshipId]);

  const fetchStipends = React.useCallback(async () => {
    if (!currentOrganization?.id || !internshipId) return;
    setStipendsLoading(true);
    try {
      const res = await apiClient.get<any>(
        `${API_ENDPOINTS.internships.stipends}?internship_id=${internshipId}`
      );
      const data = (res as any)?.data || res;
      setStipends(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setStipendsLoading(false);
    }
  }, [currentOrganization?.id, internshipId]);

  React.useEffect(() => {
    if (canView) {
      fetchInternship();
      fetchStipends();
    }
  }, [fetchInternship, fetchStipends, canView]);

  // Set default student name & stipend on modal open
  React.useEffect(() => {
    if (internship) {
      setDisburseForm((prev) => ({
        ...prev,
        internship_id: internship.id,
        intern_name: prev.intern_name || internship.intern_name,
        stipend_amount: prev.stipend_amount && prev.stipend_amount !== "0.00" ? prev.stipend_amount : internship.stipend || "0.00",
      }));
      setDocForm((prev) => ({
        ...prev,
        intern_name: prev.intern_name || internship.intern_name,
      }));
    }
  }, [internship]);

  const handleLifecycleAction = async (action: "start" | "complete" | "terminate") => {
    if (!internship) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const endpoint =
        action === "start"
          ? API_ENDPOINTS.internships.start(internship.id)
          : action === "complete"
          ? API_ENDPOINTS.internships.complete(internship.id)
          : API_ENDPOINTS.internships.terminate(internship.id);
      await apiClient.post(endpoint, {});
      fetchInternship();
    } catch (err: any) {
      setActionError(err?.message || `Failed to ${action} internship.`);
    } finally {
      setActionLoading(false);
    }
  };

  // Supervisor handlers
  const handleAddSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internship) return;
    setSupLoading(true);
    setSupError(null);
    try {
      await apiClient.post(API_ENDPOINTS.internships.supervisors(internship.id), supForm);
      setShowAddSupervisorModal(false);
      setSupForm({ employee_id: "", role: "supervisor" });
      fetchInternship();
    } catch (err: any) {
      setSupError(err?.message || "Failed to add supervisor.");
    } finally {
      setSupLoading(false);
    }
  };

  const handleRemoveSupervisor = async (supervisorId: string) => {
    if (!internship) return;
    try {
      await apiClient.delete(API_ENDPOINTS.internships.supervisor(internship.id, supervisorId));
      fetchInternship();
    } catch {
      // silently fail
    }
  };

  // Review handlers
  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internship) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      await apiClient.post(API_ENDPOINTS.internships.reviews(internship.id), reviewForm);
      setShowAddReviewModal(false);
      setReviewForm({ review_date: new Date().toISOString().slice(0, 10), status: "draft" });
      fetchInternship();
    } catch (err: any) {
      setReviewError(err?.message || "Failed to create review.");
    } finally {
      setReviewLoading(false);
    }
  };

  // Student handlers
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internship) return;
    setStudentLoading(true);
    setStudentError(null);
    try {
      await apiClient.post(API_ENDPOINTS.internships.students(internship.id), studentForm);
      setShowAddStudentModal(false);
      setStudentForm({
        student_name: "",
        student_email: "",
        institution: internship.institution || "",
        stipend: internship.stipend || "0.00",
        status: "active",
        notes: "",
      });
      fetchInternship();
    } catch (err: any) {
      setStudentError(err?.message || "Failed to enroll student.");
    } finally {
      setStudentLoading(false);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!internship) return;
    try {
      await apiClient.delete(API_ENDPOINTS.internships.studentDetail(internship.id, studentId));
      fetchInternship();
    } catch {
      // ignore
    }
  };

  // Document handlers
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internship) return;
    setDocLoading(true);
    setDocError(null);
    try {
      const computedFileName =
        docForm.file_name.trim() ||
        selectedFile?.name ||
        `${(docForm.title || "document").toLowerCase().replace(/[^a-z0-9]/g, "_")}.pdf`;

      const payload: InternshipDocumentCreate = {
        ...docForm,
        file_name: computedFileName,
        file_size: selectedFile?.size || docForm.file_size || 102400,
        file_url: docForm.file_url?.trim() || undefined,
      };

      await apiClient.post(API_ENDPOINTS.internships.documents(internship.id), payload);
      setShowAddDocModal(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setDocForm({
        title: "",
        document_type: "offer_letter",
        intern_name: internship.intern_name,
        file_name: "",
        file_size: 102400,
        mime_type: "application/pdf",
        file_url: "",
        notes: "",
      });
      fetchInternship();
    } catch (err: any) {
      setDocError(err?.message || "Failed to save document record.");
    } finally {
      setDocLoading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!internship) return;
    try {
      await apiClient.delete(API_ENDPOINTS.internships.documentDetail(internship.id, docId));
      fetchInternship();
    } catch {
      // ignore
    }
  };

  // Stipend disburse handler
  const handleDisburseStipend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internship) return;
    setDisburseLoading(true);
    setDisburseError(null);
    try {
      await apiClient.post(API_ENDPOINTS.internships.disburseStipend, disburseForm);
      setShowDisburseModal(false);
      setDisburseForm((prev) => ({
        ...prev,
        payment_reference: "",
        notes: "",
      }));
      fetchStipends();
    } catch (err: any) {
      setDisburseError(err?.message || "Failed to disburse stipend.");
    } finally {
      setDisburseLoading(false);
    }
  };

  if (isOrgLoading || isLoading) return <LoadingState message="Loading internship..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchInternship} />;
  if (!internship) return <ErrorState title="Not Found" message="Internship not found." />;

  const statusCfg = STATUS_CONFIG[internship.status];
  const enrolledStudents = internship.students || [];
  const storedDocuments = internship.documents || [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/internships"
          className="mt-1 p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
              {internship.title}
            </h1>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${statusCfg.className}`}
            >
              {statusCfg.label}
            </span>
            <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700">
              {internship.code}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {internship.code} · {internship.intern_name}
          </p>
        </div>

        {/* Lifecycle Actions */}
        {canManage && (
          <div className="flex gap-2 shrink-0">
            {internship.status === "planned" && (
              <Button size="sm" onClick={() => handleLifecycleAction("start")} disabled={actionLoading}>
                Start
              </Button>
            )}
            {(internship.status === "active" || internship.status === "extended") && (
              <Button
                size="sm"
                onClick={() => handleLifecycleAction("complete")}
                disabled={actionLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Complete
              </Button>
            )}
            {!["completed", "terminated", "cancelled"].includes(internship.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleLifecycleAction("terminate")}
                disabled={actionLoading}
                className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                Terminate
              </Button>
            )}
          </div>
        )}
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-md bg-rose-50 dark:bg-rose-950/60 p-3 text-sm text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
          <X className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <nav className="-mb-px flex gap-6">
          {(
            [
              { key: "overview", label: "Overview" },
              { key: "students", label: "Students / Interns", count: enrolledStudents.length },
              { key: "documents", label: "Documents", count: storedDocuments.length },
              { key: "supervisors", label: "Supervisors", count: internship.supervisors?.length ?? 0 },
              { key: "reviews", label: "Reviews", count: internship.reviews?.length ?? 0 },
              { key: "stipends", label: "Stipends", count: stipends.length },
            ] as { key: Tab; label: string; count?: number }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    activeTab === tab.key
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Intern Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 text-sm">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Users className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="font-medium text-slate-700 dark:text-slate-300">Primary Intern:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{internship.intern_name}</span>
              </div>
              {internship.intern_email && (
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Email:</span>
                  <a href={`mailto:${internship.intern_email}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                    {internship.intern_email}
                  </a>
                </div>
              )}
              {internship.institution && (
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Institution:</span>
                  <span>{internship.institution}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="font-medium text-slate-700 dark:text-slate-300">Program Duration:</span>
                <span className="font-mono text-xs">
                  {internship.start_date.slice(0, 10)} → {internship.end_date.slice(0, 10)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <DollarSign className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="font-medium text-slate-700 dark:text-slate-300">Base Stipend:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  ₹{Number(internship.stipend).toLocaleString()}/month
                </span>
              </div>
            </CardContent>
          </Card>

          {internship.description && (
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Program Objectives & Scope</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {internship.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Quick Metrics */}
          <Card className="lg:col-span-2 dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Cohort & Engagement Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Enrolled Students</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {enrolledStudents.length > 0 ? enrolledStudents.length : 1}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Documents Stored</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {storedDocuments.length}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Supervisors Assigned</p>
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                    {internship.supervisors?.length ?? 0}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Stipend Disbursements</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {stipends.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: Students / Enrolled Interns */}
      {activeTab === "students" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Cohort Enrollees & Students
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage multiple students enrolled inside this internship run
              </p>
            </div>
            {canManage && (
              <Button onClick={() => setShowAddStudentModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Enroll Student
              </Button>
            )}
          </div>

          {enrolledStudents.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-slate-300 dark:border-slate-700 dark:bg-slate-900">
              <Users className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Primary intern is {internship.intern_name}.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                You can enroll additional cohort students to manage team or group internships together.
              </p>
              {canManage && (
                <Button
                  onClick={() => setShowAddStudentModal(true)}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Enroll First Student
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {enrolledStudents.map((st) => (
                <Card key={st.id} className="dark:bg-slate-900 dark:border-slate-800">
                  <CardContent className="p-5 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {st.student_name}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border capitalize ${
                            st.status === "active"
                              ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                              : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {st.status}
                        </span>
                      </div>
                      {st.student_email && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{st.student_email}</p>
                      )}
                      {st.institution && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {st.institution}
                        </p>
                      )}
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-2">
                        Stipend: ₹{Number(st.stipend).toLocaleString()}/month
                      </p>
                      {st.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">
                          &ldquo;{st.notes}&rdquo;
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteStudent(st.id)}
                        className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Documents */}
      {activeTab === "documents" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Intern Documents Repository
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Store and manage Offer Letters, NDA agreements, ID proof, College NOCs, and Completion Certificates
              </p>
            </div>
            {canManage && (
              <Button onClick={() => setShowAddDocModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Document
              </Button>
            )}
          </div>

          {storedDocuments.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-slate-300 dark:border-slate-700 dark:bg-slate-900">
              <FileText className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No documents uploaded yet.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Upload offer letters, NDA agreements, ID proofs, and NOC certificates for compliance and records.
              </p>
              {canManage && (
                <Button
                  onClick={() => setShowAddDocModal(true)}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add First Document
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {storedDocuments.map((doc) => {
                const docTypeLabel =
                  DOC_TYPES.find((d) => d.value === doc.document_type)?.label || doc.document_type;
                return (
                  <Card key={doc.id} className="dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-between">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm line-clamp-1">
                              {doc.title}
                            </h3>
                            <span className="inline-block mt-0.5 text-xs font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {docTypeLabel}
                            </span>
                          </div>
                        </div>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-1.5 h-auto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="mt-3.5 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {doc.intern_name && (
                          <p>
                            Intern: <strong className="text-slate-800 dark:text-slate-200">{doc.intern_name}</strong>
                          </p>
                        )}
                        <p>File: <span className="font-mono text-slate-700 dark:text-slate-300">{doc.file_name}</span></p>
                        <p>Uploaded: {doc.created_at.slice(0, 10)}</p>
                        {doc.notes && (
                          <p className="italic text-slate-600 dark:text-slate-400 mt-1">&ldquo;{doc.notes}&rdquo;</p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                          {doc.file_size ? `${Math.round(doc.file_size / 1024)} KB` : "PDF Document"}
                        </span>
                        {doc.file_url ? (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" />
                            View Document
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                            Verified Record
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Supervisors */}
      {activeTab === "supervisors" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Supervisors & Mentors
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Multiple supervisors can oversee and review this internship cohort
              </p>
            </div>
            {canManage && (
              <Button onClick={() => setShowAddSupervisorModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Supervisor
              </Button>
            )}
          </div>

          {!internship.supervisors?.length ? (
            <Card className="p-8 text-center border-dashed border-slate-300 dark:border-slate-700 dark:bg-slate-900">
              <Users className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No supervisors assigned yet.
              </p>
              {canManage && (
                <Button
                  onClick={() => setShowAddSupervisorModal(true)}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Assign Supervisor
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {internship.supervisors.map((sup) => (
                <Card key={sup.id} className="dark:bg-slate-900 dark:border-slate-800">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                        <UserCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {sup.employee
                            ? `${sup.employee.first_name} ${sup.employee.last_name}`
                            : sup.employee_id}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                          {sup.role} {sup.employee?.designation ? `· ${sup.employee.designation}` : ""}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSupervisor(sup.id)}
                        className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Reviews */}
      {activeTab === "reviews" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Performance Evaluations & Reviews
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track intern periodic feedback, ratings, and milestones
              </p>
            </div>
            {canReview && (
              <Button onClick={() => setShowAddReviewModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Review
              </Button>
            )}
          </div>

          {!internship.reviews?.length ? (
            <Card className="p-8 text-center border-dashed border-slate-300 dark:border-slate-700 dark:bg-slate-900">
              <Star className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No reviews yet.
              </p>
              {canReview && (
                <Button
                  onClick={() => setShowAddReviewModal(true)}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add First Review
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {internship.reviews.map((review) => (
                <Card key={review.id} className="dark:bg-slate-900 dark:border-slate-800">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Date: {review.review_date.slice(0, 10)}
                      </span>
                      <div className="flex items-center gap-3">
                        {review.rating != null && (
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3.5 w-3.5 ${
                                  i < review.rating! ? "text-amber-400 fill-amber-400" : "text-slate-300 dark:text-slate-600"
                                }`}
                              />
                            ))}
                          </div>
                        )}
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            review.status === "submitted"
                              ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                              : review.status === "acknowledged"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {review.status}
                        </span>
                      </div>
                    </div>
                    {review.feedback && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        {review.feedback}
                      </p>
                    )}
                    {review.reviewer && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                        Reviewed by: {review.reviewer.first_name} {review.reviewer.last_name}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Stipends */}
      {activeTab === "stipends" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Stipend Disbursements & Payroll Runs
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track intern stipend payments, disbursement vouchers, and transaction references
              </p>
            </div>
            {canManage && (
              <Button
                onClick={() => setShowDisburseModal(true)}
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CreditCard className="h-4 w-4" />
                Disburse Stipend
              </Button>
            )}
          </div>

          {stipendsLoading && stipends.length === 0 ? (
            <LoadingState message="Loading stipend disbursements..." />
          ) : stipends.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-slate-300 dark:border-slate-700 dark:bg-slate-900">
              <CreditCard className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No stipend disbursements recorded yet.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                You can disburse stipends directly from here or link them during a monthly Salary Run.
              </p>
              {canManage && (
                <Button
                  onClick={() => setShowDisburseModal(true)}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Record First Disbursement
                </Button>
              )}
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Intern Name</th>
                    <th className="py-3 px-4">Period</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Method & Reference</th>
                    <th className="py-3 px-4">Disbursed At</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {stipends.map((stipend) => (
                    <tr key={stipend.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {stipend.intern_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {new Date(stipend.period_year, stipend.period_month - 1).toLocaleString("default", {
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                        ₹{Number(stipend.stipend_amount).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        <span className="capitalize">{stipend.payment_method.replace("_", " ")}</span>
                        {stipend.payment_reference && (
                          <span className="block font-mono text-slate-500 dark:text-slate-400">
                            Ref: {stipend.payment_reference}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {stipend.disbursed_at ? stipend.disbursed_at.slice(0, 10) : "Pending"}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          {stipend.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Student Modal */}
      <Modal
        isOpen={showAddStudentModal}
        onClose={() => { setShowAddStudentModal(false); setStudentError(null); }}
        title="Enroll Student in Internship"
        size="md"
      >
        <form onSubmit={handleAddStudent} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="st_name">Student Name *</Label>
            <Input
              id="st_name"
              required
              value={studentForm.student_name}
              onChange={(e) => setStudentForm({ ...studentForm, student_name: e.target.value })}
              placeholder="e.g. Rahul Sharma"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="st_email">Email</Label>
              <Input
                id="st_email"
                type="email"
                value={studentForm.student_email || ""}
                onChange={(e) => setStudentForm({ ...studentForm, student_email: e.target.value })}
                placeholder="student@college.edu"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st_inst">College / Institution</Label>
              <Input
                id="st_inst"
                value={studentForm.institution || ""}
                onChange={(e) => setStudentForm({ ...studentForm, institution: e.target.value })}
                placeholder="University name"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="st_stipend">Monthly Stipend (₹)</Label>
              <Input
                id="st_stipend"
                type="number"
                min={0}
                step="0.01"
                value={studentForm.stipend}
                onChange={(e) => setStudentForm({ ...studentForm, stipend: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st_status">Status</Label>
              <select
                id="st_status"
                value={studentForm.status}
                onChange={(e) => setStudentForm({ ...studentForm, status: e.target.value as any })}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st_notes">Notes</Label>
            <Input
              id="st_notes"
              value={studentForm.notes || ""}
              onChange={(e) => setStudentForm({ ...studentForm, notes: e.target.value })}
              placeholder="Roll number, department, mentor remarks..."
            />
          </div>

          {studentError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 dark:bg-rose-950/60 p-3 text-sm text-rose-700 dark:text-rose-300">
              <X className="h-4 w-4 shrink-0" />
              {studentError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAddStudentModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={studentLoading}>
              {studentLoading ? "Enrolling..." : "Enroll Student"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Document Modal */}
      <Modal
        isOpen={showAddDocModal}
        onClose={() => { setShowAddDocModal(false); setDocError(null); }}
        title="Store Intern Document"
        size="md"
      >
        <form onSubmit={handleAddDocument} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc_title">Document Title *</Label>
            <Input
              id="doc_title"
              required
              value={docForm.title}
              onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
              placeholder="e.g. Signed Offer Letter / NDA"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc_type">Document Category *</Label>
              <select
                id="doc_type"
                value={docForm.document_type}
                onChange={(e) => setDocForm({ ...docForm, document_type: e.target.value as any })}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc_intern">Intern / Student</Label>
              <Input
                id="doc_intern"
                value={docForm.intern_name || ""}
                onChange={(e) => setDocForm({ ...docForm, intern_name: e.target.value })}
                placeholder={internship.intern_name}
              />
            </div>
          </div>

          {/* Direct File Upload Zone */}
          <div className="space-y-1.5">
            <Label>Direct File Upload</Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.txt"
            />

            {selectedFile ? (
              <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Direct file attached
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    setDocForm((prev) => ({ ...prev, file_name: "", file_size: 102400 }));
                  }}
                  className="text-slate-400 hover:text-rose-500 p-1.5 h-auto rounded-md"
                  title="Remove selected file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) processSelectedFile(f);
                }}
                className={cn(
                  "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors duration-150",
                  isDragging
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                )}
              >
                <UploadCloud className="h-7 w-7 mx-auto text-blue-600 dark:text-blue-400 mb-1" />
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Click to upload or drag and drop file
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5">
                  PDF, Word, Excel, or Image (up to 15MB)
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc_filename">File Name</Label>
              <Input
                id="doc_filename"
                value={docForm.file_name}
                onChange={(e) => setDocForm({ ...docForm, file_name: e.target.value })}
                placeholder={selectedFile?.name || "e.g. offer_letter.pdf"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc_url">
                Document URL / Link <span className="text-slate-400 font-normal text-xs">(Optional)</span>
              </Label>
              <Input
                id="doc_url"
                value={docForm.file_url || ""}
                onChange={(e) => setDocForm({ ...docForm, file_url: e.target.value })}
                placeholder="https://... (Optional cloud link)"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc_notes">Notes / Observations</Label>
            <Input
              id="doc_notes"
              value={docForm.notes || ""}
              onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })}
              placeholder="Signed by Dean, stamp verified..."
            />
          </div>

          {docError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 dark:bg-rose-950/60 p-3 text-sm text-rose-700 dark:text-rose-300">
              <X className="h-4 w-4 shrink-0" />
              {docError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAddDocModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={docLoading}>
              {docLoading ? "Saving..." : "Save Document"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Disburse Stipend Modal */}
      <Modal
        isOpen={showDisburseModal}
        onClose={() => { setShowDisburseModal(false); setDisburseError(null); }}
        title="Disburse Intern Stipend"
        size="md"
      >
        <form onSubmit={handleDisburseStipend} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dsp_intern">Intern Name *</Label>
            <Input
              id="dsp_intern"
              required
              value={disburseForm.intern_name}
              onChange={(e) => setDisburseForm({ ...disburseForm, intern_name: e.target.value })}
              placeholder={internship.intern_name}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dsp_month">Period Month</Label>
              <select
                id="dsp_month"
                value={disburseForm.period_month}
                onChange={(e) => setDisburseForm({ ...disburseForm, period_month: Number(e.target.value) })}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString("default", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dsp_year">Period Year</Label>
              <Input
                id="dsp_year"
                type="number"
                min={2020}
                max={2035}
                value={disburseForm.period_year}
                onChange={(e) => setDisburseForm({ ...disburseForm, period_year: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dsp_amount">Stipend Amount (₹) *</Label>
              <Input
                id="dsp_amount"
                type="number"
                min={0}
                step="0.01"
                required
                value={disburseForm.stipend_amount}
                onChange={(e) => setDisburseForm({ ...disburseForm, stipend_amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dsp_method">Payment Method</Label>
              <select
                id="dsp_method"
                value={disburseForm.payment_method}
                onChange={(e) => setDisburseForm({ ...disburseForm, payment_method: e.target.value })}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dsp_ref">Payment Reference / UTR Number</Label>
            <Input
              id="dsp_ref"
              value={disburseForm.payment_reference || ""}
              onChange={(e) => setDisburseForm({ ...disburseForm, payment_reference: e.target.value })}
              placeholder="e.g. UTR-998822441"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dsp_notes">Notes</Label>
            <Input
              id="dsp_notes"
              value={disburseForm.notes || ""}
              onChange={(e) => setDisburseForm({ ...disburseForm, notes: e.target.value })}
              placeholder="Monthly stipend disbursement confirmation"
            />
          </div>

          {disburseError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 dark:bg-rose-950/60 p-3 text-sm text-rose-700 dark:text-rose-300">
              <X className="h-4 w-4 shrink-0" />
              {disburseError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowDisburseModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={disburseLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {disburseLoading ? "Disbursing..." : "Confirm Disbursement"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Supervisor Modal */}
      <Modal
        isOpen={showAddSupervisorModal}
        onClose={() => { setShowAddSupervisorModal(false); setSupError(null); }}
        title="Add Supervisor"
        size="sm"
      >
        <form onSubmit={handleAddSupervisor} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="employee_id">Employee ID *</Label>
            <Input
              id="employee_id"
              required
              value={supForm.employee_id}
              onChange={(e) => setSupForm({ ...supForm, employee_id: e.target.value })}
              placeholder="Enter employee UUID"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup_role">Role</Label>
            <Input
              id="sup_role"
              value={supForm.role || "supervisor"}
              onChange={(e) => setSupForm({ ...supForm, role: e.target.value })}
              placeholder="supervisor"
            />
          </div>
          {supError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 dark:bg-rose-950/60 p-3 text-sm text-rose-700 dark:text-rose-300">
              <X className="h-4 w-4 shrink-0" />
              {supError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddSupervisorModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={supLoading}>
              {supLoading ? "Adding..." : "Add Supervisor"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Review Modal */}
      <Modal
        isOpen={showAddReviewModal}
        onClose={() => { setShowAddReviewModal(false); setReviewError(null); }}
        title="Add Review"
        size="md"
      >
        <form onSubmit={handleAddReview} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="review_date">Review Date *</Label>
            <Input
              id="review_date"
              type="date"
              required
              value={reviewForm.review_date}
              onChange={(e) => setReviewForm({ ...reviewForm, review_date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rating">Rating (1–5)</Label>
            <Input
              id="rating"
              type="number"
              min={1}
              max={5}
              value={reviewForm.rating ?? ""}
              onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback">Feedback</Label>
            <textarea
              id="feedback"
              rows={3}
              value={reviewForm.feedback || ""}
              onChange={(e) => setReviewForm({ ...reviewForm, feedback: e.target.value })}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter feedback..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review_status">Status</Label>
            <select
              id="review_status"
              value={reviewForm.status}
              onChange={(e) => setReviewForm({ ...reviewForm, status: e.target.value as any })}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="acknowledged">Acknowledged</option>
            </select>
          </div>
          {reviewError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 dark:bg-rose-950/60 p-3 text-sm text-rose-700 dark:text-rose-300">
              <X className="h-4 w-4 shrink-0" />
              {reviewError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAddReviewModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={reviewLoading}>
              {reviewLoading ? "Saving..." : "Add Review"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
