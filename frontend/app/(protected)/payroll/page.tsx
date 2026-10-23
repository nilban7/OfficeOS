"use client";

import * as React from "react";
import Link from "next/link";
import {
  Banknote,
  Plus,
  Search,
  Eye,
  CheckCircle,
  Clock,
  DollarSign,
  Users,
  Calendar,
  FileText,
  SlidersHorizontal,
  Trash2,
  Gift,
  Sparkles,
  Send,
  XCircle,
  Ban,
  Check,
  Edit2,
  X,
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
import { ROUTES } from "@/constants/routes";
import type {
  Bonus,
  BonusAllocation,
  BonusCreate,
  BonusPreviewRequest,
  BonusPreviewResponse,
  BonusStatus,
  PayrollRun,
  PayrollRunCreate,
  PayrollStatus,
  PayrollSummaryKPI,
  Payslip,
  SalaryStructure,
  SalaryStructureCreate,
} from "@/types/payroll";

const STATUS_CONFIG: Record<PayrollStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  processing: { label: "Processing", className: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", className: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

const BONUS_STATUS_CONFIG: Record<BonusStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  pending_approval: { label: "Pending Approval", className: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved", className: "bg-blue-50 text-blue-700 border-blue-200" },
  included_in_payroll: { label: "Included in Payroll", className: "bg-purple-50 text-purple-700 border-purple-200" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", className: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500 border-gray-300" },
};

export default function PayrollPage() {
  const { currentOrganization, isLoading: isOrgLoading } = useOrganization();

  // Active Tab: 'runs' | 'structures' | 'payslips' | 'bonuses'
  const [activeTab, setActiveTab] = React.useState<"runs" | "structures" | "payslips" | "bonuses">("runs");

  // Data states
  const [kpi, setKpi] = React.useState<PayrollSummaryKPI | null>(null);
  const [runs, setRuns] = React.useState<PayrollRun[]>([]);
  const [structures, setStructures] = React.useState<SalaryStructure[]>([]);
  const [payslips, setPayslips] = React.useState<Payslip[]>([]);
  const [bonuses, setBonuses] = React.useState<Bonus[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = React.useState("");

  // Process Run Modal
  const [showRunModal, setShowRunModal] = React.useState(false);
  const [runLoading, setRunLoading] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [runForm, setRunForm] = React.useState<PayrollRunCreate>({
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    title: "",
    notes: "",
  });

  // Structure Modal
  const [showStructureModal, setShowStructureModal] = React.useState(false);
  const [structureLoading, setStructureLoading] = React.useState(false);
  const [structureError, setStructureError] = React.useState<string | null>(null);
  const [structureForm, setStructureForm] = React.useState<SalaryStructureCreate>({
    employee_id: "",
    currency: "USD",
    base_salary: 5000,
    hra: 1000,
    payment_frequency: "monthly",
    effective_from: new Date().toISOString().split("T")[0] as string,
  });

  // Common Entity Lists
  const [employees, setEmployees] = React.useState<Array<{ id: string; name: string; code: string }>>([]);
  const [departments, setDepartments] = React.useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string; project_code?: string; budget?: number }>>([]);

  // --- BONUS MANAGEMENT STATES ---
  const [showBulkBonusModal, setShowBulkBonusModal] = React.useState(false);
  const [bulkBonusLoading, setBulkBonusLoading] = React.useState(false);
  const [bulkBonusError, setBulkBonusError] = React.useState<string | null>(null);
  const [bulkBonusForm, setBulkBonusForm] = React.useState<{
    name: string;
    description: string;
    currency: string;
    period_month: number;
    period_year: number;
    calculation_type: "fixed" | "percentage";
    rate_or_amount: number;
    target_type: "all" | "department";
    target_department_id: string;
    notes: string;
  }>({
    name: "",
    description: "",
    currency: "USD",
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    calculation_type: "fixed",
    rate_or_amount: 1000,
    target_type: "all",
    target_department_id: "",
    notes: "",
  });
  const [bulkPreview, setBulkPreview] = React.useState<BonusPreviewResponse | null>(null);
  const [bulkPreviewLoading, setBulkPreviewLoading] = React.useState(false);

  // Individual / Project Bonus Modal
  const [showIndividualBonusModal, setShowIndividualBonusModal] = React.useState(false);
  const [indBonusLoading, setIndBonusLoading] = React.useState(false);
  const [indBonusError, setIndBonusError] = React.useState<string | null>(null);
  const [indBonusForm, setIndBonusForm] = React.useState<{
    name: string;
    description: string;
    bonus_type: "individual" | "project";
    employee_id: string;
    project_id: string;
    project_reference: string;
    calculation_type: "fixed" | "percentage";
    rate_or_amount: number;
    currency: string;
    period_month: number;
    period_year: number;
    notes: string;
  }>({
    name: "",
    description: "",
    bonus_type: "individual",
    employee_id: "",
    project_id: "",
    project_reference: "",
    calculation_type: "fixed",
    rate_or_amount: 500,
    currency: "USD",
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    notes: "",
  });
  const [indPreview, setIndPreview] = React.useState<BonusPreviewResponse | null>(null);
  const [indPreviewLoading, setIndPreviewLoading] = React.useState(false);

  // Rejection Modal
  const [showRejectModal, setShowRejectModal] = React.useState(false);
  const [rejectingBonusId, setRejectingBonusId] = React.useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [rejectionLoading, setRejectionLoading] = React.useState(false);
  const [rejectionError, setRejectionError] = React.useState<string | null>(null);

  // Allocation Detail Modal
  const [showAllocationsModal, setShowAllocationsModal] = React.useState(false);
  const [selectedBonus, setSelectedBonus] = React.useState<Bonus | null>(null);
  const [editingAllocId, setEditingAllocId] = React.useState<string | null>(null);
  const [editingAllocAmount, setEditingAllocAmount] = React.useState<number>(0);
  const [isSavingAlloc, setIsSavingAlloc] = React.useState(false);

  // Load Data
  const fetchData = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading((prev) => (runs.length === 0 ? true : prev));
    setError(null);
    try {
      const [kpiRes, runsRes, structuresRes, slipsRes, empRes, bonusRes, deptRes, projRes] =
        await Promise.all([
          apiClient.get<PayrollSummaryKPI>(API_ENDPOINTS.payroll.summary).catch(() => null),
          apiClient.get<PayrollRun[]>(API_ENDPOINTS.payroll.runs).catch(() => []),
          apiClient.get<SalaryStructure[]>(API_ENDPOINTS.payroll.structures).catch(() => []),
          apiClient.get<Payslip[]>(API_ENDPOINTS.payroll.payslips).catch(() => []),
          apiClient.get<any>(API_ENDPOINTS.employees.list).catch(() => null),
          apiClient.get<Bonus[]>(API_ENDPOINTS.payroll.bonuses).catch(() => []),
          apiClient.get<any>(API_ENDPOINTS.departments.list).catch(() => []),
          apiClient.get<any>(API_ENDPOINTS.projects.list).catch(() => []),
        ]);

      if (kpiRes) setKpi(kpiRes);
      setRuns(runsRes || []);
      setStructures(structuresRes || []);
      setPayslips(slipsRes || []);
      setBonuses(bonusRes || []);

      const rawEmployees = empRes?.items || empRes?.data?.items || empRes || [];
      if (Array.isArray(rawEmployees)) {
        setEmployees(
          rawEmployees.map((e: any) => ({
            id: e.id,
            name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.name || "Employee",
            code: e.employee_code || "",
          }))
        );
      }

      const rawDepts = deptRes?.items || deptRes?.data?.items || deptRes || [];
      if (Array.isArray(rawDepts)) {
        setDepartments(rawDepts.map((d: any) => ({ id: d.id, name: d.name })));
      }

      const rawProjects = projRes?.items || projRes?.data?.items || projRes || [];
      if (Array.isArray(rawProjects)) {
        setProjects(
          rawProjects.map((p: any) => ({
            id: p.id,
            name: p.name,
            project_code: p.project_code,
            budget: p.budget,
          }))
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load payroll data");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, runs.length]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Process Run Submit
  const handleProcessRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunLoading(true);
    setRunError(null);
    try {
      await apiClient.post(API_ENDPOINTS.payroll.runs, runForm);
      setShowRunModal(false);
      setRunForm({
        period_month: new Date().getMonth() + 1,
        period_year: new Date().getFullYear(),
        title: "",
        notes: "",
      });
      fetchData();
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : "Failed to generate payroll run");
    } finally {
      setRunLoading(false);
    }
  };

  // Handle Salary Structure Submit
  const handleSaveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    setStructureLoading(true);
    setStructureError(null);
    try {
      await apiClient.post(API_ENDPOINTS.payroll.structures, structureForm);
      setShowStructureModal(false);
      fetchData();
    } catch (err: unknown) {
      setStructureError(err instanceof Error ? err.message : "Failed to save salary structure");
    } finally {
      setStructureLoading(false);
    }
  };

  const openEditStructure = (struct: SalaryStructure) => {
    setStructureForm({
      employee_id: struct.employee_id,
      currency: struct.currency || "USD",
      base_salary: Number(struct.base_salary) || 0,
      hra: Number(struct.hra) || 0,
      payment_frequency: struct.payment_frequency || "monthly",
      effective_from: struct.effective_from || (new Date().toISOString().split("T")[0] as string),
    });
    setStructureError(null);
    setShowStructureModal(true);
  };

  const handleDeleteRun = async (runId: string) => {
    if (!confirm("Are you sure you want to delete this draft payroll run?")) return;
    try {
      await apiClient.delete(API_ENDPOINTS.payroll.deleteRun(runId));
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete payroll run");
    }
  };

  // --- BONUS ACTION HANDLERS ---
  const handlePreviewBulk = async () => {
    setBulkPreviewLoading(true);
    setBulkBonusError(null);
    try {
      const payload: BonusPreviewRequest = {
        bonus_type: "bulk",
        calculation_type: bulkBonusForm.calculation_type,
        calculation_base: "base_salary",
        rate_or_amount: Number(bulkBonusForm.rate_or_amount) || 0,
        currency: bulkBonusForm.currency,
        period_month: bulkBonusForm.period_month,
        period_year: bulkBonusForm.period_year,
        target_department_id:
          bulkBonusForm.target_type === "department" ? bulkBonusForm.target_department_id || undefined : undefined,
      };
      const res = await apiClient.post<BonusPreviewResponse>(API_ENDPOINTS.payroll.bonusPreview, payload);
      setBulkPreview(res);
    } catch (err: unknown) {
      setBulkBonusError(err instanceof Error ? err.message : "Failed to generate bonus preview");
    } finally {
      setBulkPreviewLoading(false);
    }
  };

  const handleCreateBulkBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkBonusLoading(true);
    setBulkBonusError(null);
    try {
      const payload: BonusCreate = {
        name: bulkBonusForm.name.trim(),
        description: bulkBonusForm.description.trim() || undefined,
        bonus_type: "bulk",
        calculation_type: bulkBonusForm.calculation_type,
        calculation_base: "base_salary",
        rate_or_amount: Number(bulkBonusForm.rate_or_amount) || 0,
        currency: bulkBonusForm.currency,
        period_month: bulkBonusForm.period_month,
        period_year: bulkBonusForm.period_year,
        target_department_id:
          bulkBonusForm.target_type === "department" ? bulkBonusForm.target_department_id || undefined : undefined,
        notes: bulkBonusForm.notes.trim() || undefined,
      };
      await apiClient.post(API_ENDPOINTS.payroll.bonuses, payload);
      setShowBulkBonusModal(false);
      setBulkPreview(null);
      setBulkBonusForm({
        name: "",
        description: "",
        currency: "USD",
        period_month: new Date().getMonth() + 1,
        period_year: new Date().getFullYear(),
        calculation_type: "fixed",
        rate_or_amount: 1000,
        target_type: "all",
        target_department_id: "",
        notes: "",
      });
      fetchData();
    } catch (err: unknown) {
      setBulkBonusError(err instanceof Error ? err.message : "Failed to create bonus campaign");
    } finally {
      setBulkBonusLoading(false);
    }
  };

  const handlePreviewIndividual = async () => {
    setIndPreviewLoading(true);
    setIndBonusError(null);
    try {
      const payload: BonusPreviewRequest = {
        bonus_type: indBonusForm.bonus_type,
        calculation_type: indBonusForm.calculation_type,
        calculation_base: "base_salary",
        rate_or_amount: Number(indBonusForm.rate_or_amount) || 0,
        currency: indBonusForm.currency,
        period_month: indBonusForm.period_month,
        period_year: indBonusForm.period_year,
        employee_ids:
          indBonusForm.bonus_type === "individual" && indBonusForm.employee_id
            ? [indBonusForm.employee_id]
            : undefined,
        project_id:
          indBonusForm.bonus_type === "project" && indBonusForm.project_id
            ? indBonusForm.project_id
            : undefined,
      };
      const res = await apiClient.post<BonusPreviewResponse>(API_ENDPOINTS.payroll.bonusPreview, payload);
      setIndPreview(res);
    } catch (err: unknown) {
      setIndBonusError(err instanceof Error ? err.message : "Failed to preview individual bonus");
    } finally {
      setIndPreviewLoading(false);
    }
  };

  const handleCreateIndividualBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    setIndBonusLoading(true);
    setIndBonusError(null);
    try {
      const selectedProject = projects.find((p) => p.id === indBonusForm.project_id);
      const payload: BonusCreate = {
        name: indBonusForm.name.trim(),
        description: indBonusForm.description.trim() || undefined,
        bonus_type: indBonusForm.bonus_type,
        calculation_type: indBonusForm.calculation_type,
        calculation_base: "base_salary",
        rate_or_amount: Number(indBonusForm.rate_or_amount) || 0,
        currency: indBonusForm.currency,
        period_month: indBonusForm.period_month,
        period_year: indBonusForm.period_year,
        employee_ids:
          indBonusForm.bonus_type === "individual" && indBonusForm.employee_id
            ? [indBonusForm.employee_id]
            : undefined,
        project_id:
          indBonusForm.bonus_type === "project" && indBonusForm.project_id
            ? indBonusForm.project_id
            : undefined,
        project_reference:
          indBonusForm.project_reference.trim() ||
          (selectedProject ? `${selectedProject.name} (${selectedProject.project_code || "Proj"})` : undefined),
        notes: indBonusForm.notes.trim() || undefined,
      };
      await apiClient.post(API_ENDPOINTS.payroll.bonuses, payload);
      setShowIndividualBonusModal(false);
      setIndPreview(null);
      setIndBonusForm({
        name: "",
        description: "",
        bonus_type: "individual",
        employee_id: "",
        project_id: "",
        project_reference: "",
        calculation_type: "fixed",
        rate_or_amount: 500,
        currency: "USD",
        period_month: new Date().getMonth() + 1,
        period_year: new Date().getFullYear(),
        notes: "",
      });
      fetchData();
    } catch (err: unknown) {
      setIndBonusError(err instanceof Error ? err.message : "Failed to award bonus");
    } finally {
      setIndBonusLoading(false);
    }
  };

  const handleSubmitBonus = async (bonusId: string) => {
    try {
      await apiClient.post(API_ENDPOINTS.payroll.submitBonus(bonusId));
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to submit bonus for approval");
    }
  };

  const handleApproveBonus = async (bonusId: string) => {
    try {
      await apiClient.post(API_ENDPOINTS.payroll.approveBonus(bonusId));
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to approve bonus");
    }
  };

  const openRejectModal = (bonusId: string) => {
    setRejectingBonusId(bonusId);
    setRejectionReason("");
    setRejectionError(null);
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingBonusId) return;
    if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
      setRejectionError("Please provide a valid reason for rejection (at least 3 characters).");
      return;
    }
    setRejectionLoading(true);
    setRejectionError(null);
    try {
      await apiClient.post(API_ENDPOINTS.payroll.rejectBonus(rejectingBonusId), {
        rejection_reason: rejectionReason.trim(),
      });
      setShowRejectModal(false);
      fetchData();
    } catch (err: unknown) {
      setRejectionError(err instanceof Error ? err.message : "Failed to reject bonus");
    } finally {
      setRejectionLoading(false);
    }
  };

  const handleCancelBonus = async (bonusId: string) => {
    if (!confirm("Are you sure you want to cancel this bonus campaign?")) return;
    try {
      await apiClient.post(API_ENDPOINTS.payroll.cancelBonus(bonusId));
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to cancel bonus");
    }
  };

  const handleDeleteBonus = async (bonusId: string) => {
    if (!confirm("Are you sure you want to delete this bonus campaign? This action cannot be undone.")) return;
    try {
      await apiClient.delete(API_ENDPOINTS.payroll.deleteBonus(bonusId));
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete bonus");
    }
  };

  const openAllocationsView = (bonus: Bonus) => {
    setSelectedBonus(bonus);
    setEditingAllocId(null);
    setShowAllocationsModal(true);
  };

  const handleSaveAllocationAmount = async (allocId: string) => {
    if (editingAllocAmount < 0) return;
    setIsSavingAlloc(true);
    try {
      const updated = await apiClient.patch<BonusAllocation>(
        API_ENDPOINTS.payroll.updateBonusAllocation(allocId),
        { amount: Number(editingAllocAmount) }
      );
      setSelectedBonus((prev) => {
        if (!prev) return prev;
        const currentAllocs = prev.allocations || [];
        const updatedAllocs = currentAllocs.map((a) =>
          a.id === allocId ? { ...a, amount: updated.amount } : a
        );
        const newTotal = updatedAllocs.reduce((sum, a) => sum + Number(a.amount), 0);
        return { ...prev, total_amount: newTotal, allocations: updatedAllocs };
      });
      setEditingAllocId(null);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update bonus amount");
    } finally {
      setIsSavingAlloc(false);
    }
  };

  if (isOrgLoading || (isLoading && runs.length === 0 && !error)) {
    return <LoadingState message="Loading payroll management..." />;
  }

  if (error && runs.length === 0) {
    return <ErrorState message={error} onRetry={fetchData} />;
  }

  // Filtered lists
  const filteredRuns = runs.filter((r) =>
    r.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredStructures = structures.filter(
    (s) =>
      s.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.employee_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSlips = payslips.filter(
    (p) =>
      p.payslip_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.employee_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBonuses = bonuses.filter(
    (b) =>
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.bonus_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.project_reference && b.project_reference.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Bonus KPIs calculation
  const totalBonusYTD = bonuses
    .filter((b) => b.status === "paid" || b.status === "included_in_payroll")
    .reduce((acc, b) => acc + Number(b.total_amount || 0), 0);

  const pendingBonusApprovals = bonuses.filter((b) => b.status === "pending_approval").length;

  const approvedUnpaidBonus = bonuses
    .filter((b) => b.status === "approved")
    .reduce((acc, b) => acc + Number(b.total_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Banknote className="h-7 w-7 text-emerald-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Payroll & Salary Management
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage compensation structures, automated monthly payroll calculations, bonus campaigns, and printable payslips.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {activeTab === "bonuses" ? (
            <>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => setShowIndividualBonusModal(true)}
              >
                <Gift className="h-4 w-4 text-emerald-600" />
                Award Individual/Project Bonus
              </Button>
              <Button
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setShowBulkBonusModal(true)}
              >
                <Sparkles className="h-4 w-4" />
                Create Bonus Campaign
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => setShowStructureModal(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Configure Salary
              </Button>
              <Button
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setShowRunModal(true)}
              >
                <Plus className="h-4 w-4" />
                Process New Payroll
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {activeTab === "bonuses" ? (
          <>
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Total Bonus Disbursed
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ${totalBonusYTD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-emerald-600 mt-0.5">Paid via payroll cycle</p>
                </div>
                <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                  <DollarSign className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pending Approvals
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    {pendingBonusApprovals}
                  </h3>
                  <p className="text-xs text-amber-600 mt-0.5">Campaigns awaiting review</p>
                </div>
                <div className="rounded-full bg-amber-50 p-3 text-amber-600">
                  <Clock className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Ready for Payroll
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ${approvedUnpaidBonus.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-purple-600 mt-0.5">Approved bonuses ready to include</p>
                </div>
                <div className="rounded-full bg-purple-50 p-3 text-purple-600">
                  <Sparkles className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Active Campaigns
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    {bonuses.length}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Bulk and project campaigns</p>
                </div>
                <div className="rounded-full bg-indigo-50 p-3 text-indigo-600">
                  <Gift className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Latest Monthly Total
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ${Number(kpi?.monthly_payroll_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-emerald-600 mt-0.5">Calculated net payout</p>
                </div>
                <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                  <DollarSign className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pending Approvals
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    {kpi?.pending_approvals_count ?? 0}
                  </h3>
                  <p className="text-xs text-amber-600 mt-0.5">Awaiting disbursement review</p>
                </div>
                <div className="rounded-full bg-amber-50 p-3 text-amber-600">
                  <Clock className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Total Disbursed (YTD)
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ${Number(kpi?.total_disbursed_ytd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-blue-600 mt-0.5">Successfully disbursed</p>
                </div>
                <div className="rounded-full bg-blue-50 p-3 text-blue-600">
                  <Banknote className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Active Employees
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    {kpi?.active_employees_count ?? 0}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Enrolled on organization payroll</p>
                </div>
                <div className="rounded-full bg-indigo-50 p-3 text-indigo-600">
                  <Users className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={activeTab === "runs" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("runs")}
          >
            Payroll Runs ({runs.length})
          </Button>
          <Button
            variant={activeTab === "structures" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("structures")}
          >
            Salary Structures ({structures.length})
          </Button>
          <Button
            variant={activeTab === "payslips" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("payslips")}
          >
            All Payslips ({payslips.length})
          </Button>
          <Button
            variant={activeTab === "bonuses" ? "primary" : "outline"}
            size="sm"
            className="flex items-center gap-1.5"
            onClick={() => setActiveTab("bonuses")}
          >
            <Gift className="h-3.5 w-3.5 text-amber-500" />
            Bonuses ({bonuses.length})
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Tab 1: Payroll Runs */}
      {activeTab === "runs" && (
        <>
          {approvedUnpaidBonus > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="text-amber-900 font-medium">
                  <strong>${approvedUnpaidBonus.toLocaleString()} in approved bonuses</strong> is ready and will be automatically included in your next payroll run generation.
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-800 hover:text-amber-900 hover:bg-amber-100 h-7 text-xs font-semibold"
                onClick={() => setActiveTab("bonuses")}
              >
                View All →
              </Button>
            </div>
          )}

          {filteredRuns.length === 0 ? (
            <EmptyState
              title="No payroll runs found"
              description="Click 'Process New Payroll' to calculate and generate the first compensation run for your team."
              actionLabel="Process New Payroll"
              onAction={() => setShowRunModal(true)}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Run Title</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Employees</th>
                    <th className="px-4 py-3">Bonus</th>
                    <th className="px-4 py-3">Gross Total</th>
                    <th className="px-4 py-3">Deductions</th>
                    <th className="px-4 py-3">Net Pay</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRuns.map((r) => {
                    const statusInfo = STATUS_CONFIG[r.status] || STATUS_CONFIG.draft;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            <span>{r.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {r.period_month}/{r.period_year}
                        </td>
                        <td className="px-4 py-3">{r.employee_count} staff</td>
                        <td className="px-4 py-3">
                          {Number(r.total_bonus_pay || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs border border-amber-200">
                              <Sparkles className="h-3 w-3 text-amber-500" />
                              +${Number(r.total_bonus_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          ${Number(r.total_gross_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-rose-600 font-medium">
                          -${Number(r.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600">
                          ${Number(r.total_net_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${statusInfo.className}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`${ROUTES.PAYROLL_RUNS}/${r.id}`}>
                              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                                <Eye className="h-3.5 w-3.5" />
                                View Run
                              </Button>
                            </Link>
                            {(r.status === "draft" || r.status === "cancelled") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteRun(r.id)}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                title="Delete draft run"
                                aria-label="Delete draft run"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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
          )}
        </>
      )}

      {/* Tab 2: Salary Structures */}
      {activeTab === "structures" && (
        <>
          {filteredStructures.length === 0 ? (
            <EmptyState
              title="No salary structures configured"
              description="Configure recurring base compensation, HRA, and custom allowances for your employees."
              actionLabel="Configure Salary"
              onAction={() => setShowStructureModal(true)}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Frequency</th>
                    <th className="px-4 py-3">Base Salary</th>
                    <th className="px-4 py-3">HRA</th>
                    <th className="px-4 py-3">Effective Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStructures.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {s.employee_name || "Employee"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {s.employee_code || "—"}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600">
                        {s.payment_frequency}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        ${Number(s.base_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })} {s.currency}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        ${Number(s.hra || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{s.effective_from}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                            s.is_active
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditStructure(s)}
                          className="h-8 gap-1 text-xs"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Tab 3: All Payslips */}
      {activeTab === "payslips" && (
        <>
          {filteredSlips.length === 0 ? (
            <EmptyState
              title="No payslips generated yet"
              description="Process a monthly payroll run to generate itemized employee payslips."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Payslip #</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Bonus</th>
                    <th className="px-4 py-3">Gross Pay</th>
                    <th className="px-4 py-3">Deductions</th>
                    <th className="px-4 py-3">Net Pay</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSlips.map((slip) => {
                    const slipBonus = slip.bonus_amount
                      ? Number(slip.bonus_amount)
                      : Object.entries(slip.earnings_breakdown || {})
                          .filter(([k]) => k.toLowerCase().startsWith("bonus"))
                          .reduce((sum, [, val]) => sum + Number(val || 0), 0);

                    return (
                      <tr key={slip.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <FileText className="h-4 w-4 text-emerald-600" />
                            <span>{slip.payslip_number}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {slip.employee_name || "Employee"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {slip.department_name || "General"}
                        </td>
                        <td className="px-4 py-3">
                          {slipBonus > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs border border-amber-200">
                              <Sparkles className="h-3 w-3 text-amber-500" />
                              +${slipBonus.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          ${Number(slip.gross_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-medium text-rose-600">
                          -${Number(slip.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600">
                          ${Number(slip.net_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border capitalize bg-slate-50 text-slate-700 border-slate-200">
                            {slip.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`${ROUTES.PAYROLL_SLIPS}/${slip.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                              <Eye className="h-3.5 w-3.5" />
                              View & Print
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
        </>
      )}

      {/* Tab 4: Bonuses & Allocations */}
      {activeTab === "bonuses" && (
        <>
          {filteredBonuses.length === 0 ? (
            <EmptyState
              title="No bonus campaigns found"
              description="Reward your team with festive, company-wide bulk bonuses or award individual project performance bonuses."
              actionLabel="Create Bonus Campaign"
              onAction={() => setShowBulkBonusModal(true)}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Bonus Campaign</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Formula / Rate</th>
                    <th className="px-4 py-3">Employees</th>
                    <th className="px-4 py-3">Total Amount</th>
                    <th className="px-4 py-3">Approval</th>
                    <th className="px-4 py-3">Payroll Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBonuses.map((b) => {
                    const statusInfo = BONUS_STATUS_CONFIG[b.status] || BONUS_STATUS_CONFIG.draft;
                    const isIncluded = b.status === "included_in_payroll" || b.status === "paid";
                    const isReady = b.status === "approved";

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <div>
                              <p className="font-semibold text-slate-900">{b.name}</p>
                              {b.description && (
                                <p className="text-xs text-slate-500 truncate max-w-xs">
                                  {b.description}
                                </p>
                              )}
                              {b.project_reference && (
                                <p className="text-xs text-indigo-600 font-medium">
                                  Ref: {b.project_reference}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 capitalize border border-slate-200">
                            {b.bonus_type === "bulk" ? "Company-Wide" : b.bonus_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-medium">
                          {b.period_month}/{b.period_year}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {b.calculation_type === "percentage" ? (
                            <span>{b.rate_or_amount}% of Base</span>
                          ) : (
                            <span>Fixed ${Number(b.rate_or_amount).toLocaleString()}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-800 font-medium">{b.employee_count}</span> staff
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600">
                          ${Number(b.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {b.currency}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${statusInfo.className}`}
                          >
                            {statusInfo.label}
                          </span>
                          {b.rejection_reason && b.status === "rejected" && (
                            <p className="text-xs text-rose-600 mt-1 italic">
                              Reason: {b.rejection_reason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isIncluded ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              <Check className="h-3 w-3" />
                              {b.status === "paid" ? "Disbursed" : "In Payroll Run"}
                            </span>
                          ) : isReady ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Ready for Payroll
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Not in payroll</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* View allocations */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
                              onClick={() => openAllocationsView(b)}
                              title="View Employee Allocations"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>

                            {/* Submit for approval */}
                            {(b.status === "draft" || b.status === "rejected") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                                onClick={() => handleSubmitBonus(b.id)}
                                title="Submit for Approval"
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}

                            {/* Approve */}
                            {(b.status === "draft" || b.status === "pending_approval") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50"
                                onClick={() => handleApproveBonus(b.id)}
                                title="Approve Bonus"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}

                            {/* Reject */}
                            {(b.status === "draft" || b.status === "pending_approval") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                onClick={() => openRejectModal(b.id)}
                                title="Reject Bonus"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}

                            {/* Cancel */}
                            {b.status !== "paid" && b.status !== "included_in_payroll" && b.status !== "cancelled" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50"
                                onClick={() => handleCancelBonus(b.id)}
                                title="Cancel Campaign"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}

                            {/* Delete */}
                            {(b.status === "draft" || b.status === "rejected" || b.status === "cancelled") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                onClick={() => handleDeleteBonus(b.id)}
                                title="Delete Campaign"
                              >
                                <Trash2 className="h-4 w-4" />
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
          )}
        </>
      )}

      {/* Modal: Process New Payroll Run */}
      <Modal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        title="Process New Monthly Payroll Run"
      >
        <form onSubmit={handleProcessRun} className="space-y-4">
          {runError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600 border border-rose-200">
              {runError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="period_month">Month</Label>
              <select
                id="period_month"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={runForm.period_month}
                onChange={(e) =>
                  setRunForm((prev) => ({ ...prev, period_month: Number(e.target.value) }))
                }
              >
                {[
                  "January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"
                ].map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="period_year">Year</Label>
              <Input
                id="period_year"
                type="number"
                value={runForm.period_year}
                onChange={(e) =>
                  setRunForm((prev) => ({ ...prev, period_year: Number(e.target.value) }))
                }
                min={2020}
                max={2030}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="run_title">Run Title (Optional)</Label>
            <Input
              id="run_title"
              placeholder="e.g. October 2026 Regular Payroll"
              value={runForm.title || ""}
              onChange={(e) => setRunForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="run_notes">Notes / Memo</Label>
            <Input
              id="run_notes"
              placeholder="e.g. Approved seasonal bonuses included"
              value={runForm.notes || ""}
              onChange={(e) => setRunForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div className="rounded-md bg-emerald-50 p-3 border border-emerald-200 text-xs text-emerald-800 space-y-1">
            <p className="font-semibold flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              Automated Calculation & Bonus Integration:
            </p>
            <p>
              OfficeOS will automatically pull all active employee salary structures, prorate unpaid leaves and absences, and seamlessly include all approved bonuses scheduled for this period as itemized payslip earnings.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowRunModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={runLoading}
            >
              {runLoading ? "Calculating Payroll..." : "Calculate & Generate Run"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Salary Structure Configuration */}
      <Modal
        isOpen={showStructureModal}
        onClose={() => setShowStructureModal(false)}
        title="Configure Employee Salary Structure"
      >
        <form onSubmit={handleSaveStructure} className="space-y-4">
          {structureError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600 border border-rose-200">
              {structureError}
            </div>
          )}

          <div>
            <Label htmlFor="struct_employee">Employee</Label>
            <select
              id="struct_employee"
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
              value={structureForm.employee_id}
              onChange={(e) =>
                setStructureForm((prev) => ({ ...prev, employee_id: e.target.value }))
              }
              required
            >
              <option value="">Select Employee...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.code || "No Code"})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="base_salary">Base Salary</Label>
              <Input
                id="base_salary"
                type="number"
                min={0}
                step="0.01"
                value={structureForm.base_salary}
                onChange={(e) =>
                  setStructureForm((prev) => ({ ...prev, base_salary: Number(e.target.value) }))
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="hra">House Rent Allowance (HRA)</Label>
              <Input
                id="hra"
                type="number"
                min={0}
                step="0.01"
                value={structureForm.hra}
                onChange={(e) =>
                  setStructureForm((prev) => ({ ...prev, hra: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={structureForm.currency}
                onChange={(e) =>
                  setStructureForm((prev) => ({ ...prev, currency: e.target.value }))
                }
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="INR">INR (₹)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="payment_frequency">Payment Frequency</Label>
              <select
                id="payment_frequency"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={structureForm.payment_frequency}
                onChange={(e) =>
                  setStructureForm((prev) => ({ ...prev, payment_frequency: e.target.value }))
                }
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="weekly">Weekly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="effective_from">Effective From</Label>
            <Input
              id="effective_from"
              type="date"
              value={structureForm.effective_from}
              onChange={(e) =>
                setStructureForm((prev) => ({ ...prev, effective_from: e.target.value }))
              }
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowStructureModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={structureLoading}
            >
              {structureLoading ? "Saving..." : "Save Salary Structure"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Create Company-Wide / Bulk Bonus Campaign */}
      <Modal
        isOpen={showBulkBonusModal}
        onClose={() => setShowBulkBonusModal(false)}
        title="Create Bulk / Company-Wide Bonus Campaign"
      >
        <form onSubmit={handleCreateBulkBonus} className="space-y-4">
          {bulkBonusError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600 border border-rose-200">
              {bulkBonusError}
            </div>
          )}

          <div>
            <Label htmlFor="bulk_name">Bonus Campaign Name</Label>
            <Input
              id="bulk_name"
              placeholder="e.g. Durga Puja Bonus 2026, Annual Festival Bonus"
              value={bulkBonusForm.name}
              onChange={(e) => setBulkBonusForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="bulk_desc">Description / Purpose</Label>
            <Input
              id="bulk_desc"
              placeholder="e.g. All-employee holiday appreciation award"
              value={bulkBonusForm.description}
              onChange={(e) => setBulkBonusForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bulk_currency">Currency</Label>
              <select
                id="bulk_currency"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={bulkBonusForm.currency}
                onChange={(e) => setBulkBonusForm((prev) => ({ ...prev, currency: e.target.value }))}
              >
                <option value="USD">USD ($)</option>
                <option value="INR">INR (₹)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>

            <div>
              <Label htmlFor="bulk_calc_type">Calculation Method</Label>
              <select
                id="bulk_calc_type"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={bulkBonusForm.calculation_type}
                onChange={(e) =>
                  setBulkBonusForm((prev) => ({
                    ...prev,
                    calculation_type: e.target.value as "fixed" | "percentage",
                  }))
                }
              >
                <option value="fixed">Fixed Amount per Employee</option>
                <option value="percentage">Percentage of Base Salary</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bulk_rate">
                {bulkBonusForm.calculation_type === "fixed" ? "Fixed Amount" : "Percentage Rate (%)"}
              </Label>
              <Input
                id="bulk_rate"
                type="number"
                min={0}
                step={bulkBonusForm.calculation_type === "fixed" ? "0.01" : "0.1"}
                value={bulkBonusForm.rate_or_amount}
                onChange={(e) =>
                  setBulkBonusForm((prev) => ({ ...prev, rate_or_amount: Number(e.target.value) }))
                }
                required
              />
            </div>

            <div>
              <Label htmlFor="bulk_target">Target Audience</Label>
              <select
                id="bulk_target"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={bulkBonusForm.target_type}
                onChange={(e) =>
                  setBulkBonusForm((prev) => ({
                    ...prev,
                    target_type: e.target.value as "all" | "department",
                  }))
                }
              >
                <option value="all">All Active Employees</option>
                <option value="department">Filter by Department</option>
              </select>
            </div>
          </div>

          {bulkBonusForm.target_type === "department" && (
            <div>
              <Label htmlFor="bulk_dept">Select Department</Label>
              <select
                id="bulk_dept"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={bulkBonusForm.target_department_id}
                onChange={(e) =>
                  setBulkBonusForm((prev) => ({ ...prev, target_department_id: e.target.value }))
                }
                required
              >
                <option value="">Select Department...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bulk_month">Scheduled Payroll Month</Label>
              <select
                id="bulk_month"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={bulkBonusForm.period_month}
                onChange={(e) =>
                  setBulkBonusForm((prev) => ({ ...prev, period_month: Number(e.target.value) }))
                }
              >
                {[
                  "January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"
                ].map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="bulk_year">Scheduled Year</Label>
              <Input
                id="bulk_year"
                type="number"
                min={2020}
                max={2030}
                value={bulkBonusForm.period_year}
                onChange={(e) =>
                  setBulkBonusForm((prev) => ({ ...prev, period_year: Number(e.target.value) }))
                }
                required
              />
            </div>
          </div>

          {/* Live Preview Button and Box */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Cost & Allocation Preview
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreviewBulk}
                disabled={bulkPreviewLoading}
                className="h-7 text-xs gap-1"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {bulkPreviewLoading ? "Calculating..." : "Preview Allocations"}
              </Button>
            </div>

            {bulkPreview && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm bg-white p-2.5 rounded border border-slate-200">
                  <div>
                    <span className="text-xs text-slate-500">Selected Staff:</span>
                    <p className="font-bold text-slate-900">{bulkPreview.employee_count} employees</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500">Estimated Total Cost:</span>
                    <p className="font-bold text-emerald-600 text-base">
                      ${Number(bulkPreview.total_estimated_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {bulkPreview.currency}
                    </p>
                  </div>
                </div>

                <div className="max-h-40 overflow-y-auto rounded border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="p-2">Employee</th>
                        <th className="p-2">Dept</th>
                        <th className="p-2">Base Salary</th>
                        <th className="p-2 text-right">Calculated Bonus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulkPreview.items.map((item) => (
                        <tr key={item.employee_id}>
                          <td className="p-2 font-medium">{item.employee_name}</td>
                          <td className="p-2 text-slate-500">{item.department_name || "—"}</td>
                          <td className="p-2 text-slate-600">
                            ${Number(item.base_salary).toLocaleString()}
                          </td>
                          <td className="p-2 text-right font-bold text-emerald-600">
                            ${Number(item.bonus_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowBulkBonusModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={bulkBonusLoading}
            >
              {bulkBonusLoading ? "Creating Campaign..." : "Confirm & Create Campaign"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Award Individual / Project Bonus */}
      <Modal
        isOpen={showIndividualBonusModal}
        onClose={() => setShowIndividualBonusModal(false)}
        title="Award Individual / Project Performance Bonus"
      >
        <form onSubmit={handleCreateIndividualBonus} className="space-y-4">
          {indBonusError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600 border border-rose-200">
              {indBonusError}
            </div>
          )}

          <div>
            <Label htmlFor="ind_name">Bonus Title</Label>
            <Input
              id="ind_name"
              placeholder="e.g. Q3 Performance Bonus, Cloud Migration Project Bonus"
              value={indBonusForm.name}
              onChange={(e) => setIndBonusForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ind_target_type">Award Target</Label>
              <select
                id="ind_target_type"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={indBonusForm.bonus_type}
                onChange={(e) =>
                  setIndBonusForm((prev) => ({
                    ...prev,
                    bonus_type: e.target.value as "individual" | "project",
                  }))
                }
              >
                <option value="individual">Individual Employee</option>
                <option value="project">Project Team</option>
              </select>
            </div>

            <div>
              <Label htmlFor="ind_currency">Currency</Label>
              <select
                id="ind_currency"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={indBonusForm.currency}
                onChange={(e) => setIndBonusForm((prev) => ({ ...prev, currency: e.target.value }))}
              >
                <option value="USD">USD ($)</option>
                <option value="INR">INR (₹)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          {indBonusForm.bonus_type === "individual" ? (
            <div>
              <Label htmlFor="ind_emp">Select Employee</Label>
              <select
                id="ind_emp"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={indBonusForm.employee_id}
                onChange={(e) => setIndBonusForm((prev) => ({ ...prev, employee_id: e.target.value }))}
                required
              >
                <option value="">Select Employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.code || "No Code"})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="ind_proj">Select Project</Label>
                <select
                  id="ind_proj"
                  className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                  value={indBonusForm.project_id}
                  onChange={(e) => {
                    const pId = e.target.value;
                    const proj = projects.find((p) => p.id === pId);
                    setIndBonusForm((prev) => ({
                      ...prev,
                      project_id: pId,
                      project_reference: proj ? `${proj.name} (${proj.project_code || "PRJ"})` : "",
                    }));
                  }}
                  required
                >
                  <option value="">Select Project...</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name} ({proj.project_code || "Code"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="ind_proj_ref">Project Reference / Identifier</Label>
                <Input
                  id="ind_proj_ref"
                  placeholder="e.g. Website Redesign Milestone 1"
                  value={indBonusForm.project_reference}
                  onChange={(e) =>
                    setIndBonusForm((prev) => ({ ...prev, project_reference: e.target.value }))
                  }
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ind_calc_type">Calculation Method</Label>
              <select
                id="ind_calc_type"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={indBonusForm.calculation_type}
                onChange={(e) =>
                  setIndBonusForm((prev) => ({
                    ...prev,
                    calculation_type: e.target.value as "fixed" | "percentage",
                  }))
                }
              >
                <option value="fixed">Fixed Bonus Amount</option>
                <option value="percentage">Percentage of Base Salary</option>
              </select>
            </div>

            <div>
              <Label htmlFor="ind_rate">
                {indBonusForm.calculation_type === "fixed" ? "Bonus Amount" : "Percentage (%)"}
              </Label>
              <Input
                id="ind_rate"
                type="number"
                min={0}
                step={indBonusForm.calculation_type === "fixed" ? "0.01" : "0.1"}
                value={indBonusForm.rate_or_amount}
                onChange={(e) =>
                  setIndBonusForm((prev) => ({ ...prev, rate_or_amount: Number(e.target.value) }))
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ind_month">Payroll Month</Label>
              <select
                id="ind_month"
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                value={indBonusForm.period_month}
                onChange={(e) =>
                  setIndBonusForm((prev) => ({ ...prev, period_month: Number(e.target.value) }))
                }
              >
                {[
                  "January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"
                ].map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ind_year">Payroll Year</Label>
              <Input
                id="ind_year"
                type="number"
                min={2020}
                max={2030}
                value={indBonusForm.period_year}
                onChange={(e) =>
                  setIndBonusForm((prev) => ({ ...prev, period_year: Number(e.target.value) }))
                }
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ind_notes">Reason / Justification</Label>
            <Input
              id="ind_notes"
              placeholder="e.g. Exceptional leadership during sprint deliverable"
              value={indBonusForm.notes}
              onChange={(e) => setIndBonusForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          {/* Live Preview Button and Box */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Allocation Calculation Preview
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreviewIndividual}
                disabled={indPreviewLoading}
                className="h-7 text-xs gap-1"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {indPreviewLoading ? "Calculating..." : "Preview Amount"}
              </Button>
            </div>

            {indPreview && (
              <div className="flex items-center justify-between text-sm bg-white p-2.5 rounded border border-slate-200">
                <div>
                  <span className="text-xs text-slate-500">Recipient Count:</span>
                  <p className="font-bold text-slate-900">{indPreview.employee_count} employees</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">Total Award:</span>
                  <p className="font-bold text-emerald-600 text-base">
                    ${Number(indPreview.total_estimated_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {indPreview.currency}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowIndividualBonusModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={indBonusLoading}
            >
              {indBonusLoading ? "Awarding Bonus..." : "Confirm & Award Bonus"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Reject Bonus (Mandatory Reason) */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject Bonus Campaign"
      >
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          {rejectionError && (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600 border border-rose-200">
              {rejectionError}
            </div>
          )}

          <div>
            <Label htmlFor="rej_reason">
              Reason for Rejection <span className="text-rose-600">*</span>
            </Label>
            <textarea
              id="rej_reason"
              rows={3}
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none"
              placeholder="Provide a clear justification for rejecting this bonus allocation..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowRejectModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={rejectionLoading}
            >
              {rejectionLoading ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: View Employee Allocations */}
      <Modal
        isOpen={showAllocationsModal}
        onClose={() => setShowAllocationsModal(false)}
        title={`Employee Allocations: ${selectedBonus?.name || "Bonus Details"}`}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm">
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Total Allocation</p>
              <p className="text-lg font-bold text-emerald-600">
                ${Number(selectedBonus?.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {selectedBonus?.currency}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Recipients</p>
              <p className="text-lg font-bold text-slate-900">{selectedBonus?.employee_count || 0} staff</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Period</p>
              <p className="text-lg font-bold text-slate-900">
                {selectedBonus?.period_month}/{selectedBonus?.period_year}
              </p>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Calculation</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedBonus?.allocations && selectedBonus.allocations.length > 0 ? (
                  selectedBonus.allocations.map((alloc) => (
                    <tr key={alloc.id} className="hover:bg-slate-50/75">
                      <td className="p-3 font-medium text-slate-900">
                        {alloc.employee_name || "Employee"}
                        {alloc.employee_code && (
                          <span className="block text-slate-400 text-[10px]">{alloc.employee_code}</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-500">{alloc.department_name || "—"}</td>
                      <td className="p-3 text-slate-600">
                        {alloc.percentage_rate ? `${alloc.percentage_rate}% of Base` : "Fixed"}
                      </td>
                      <td className="p-3 font-bold text-emerald-600">
                        {editingAllocId === alloc.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-xs">$</span>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-7 w-24 text-xs font-bold"
                              value={editingAllocAmount}
                              onChange={(e) => setEditingAllocAmount(Number(e.target.value))}
                            />
                            <Button
                              size="sm"
                              className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={isSavingAlloc}
                              onClick={() => handleSaveAllocationAmount(alloc.id)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-slate-500 hover:bg-slate-100"
                              onClick={() => setEditingAllocId(null)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>
                              ${Number(alloc.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {alloc.currency}
                            </span>
                            {selectedBonus?.status !== "paid" && alloc.status !== "paid" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAllocId(alloc.id);
                                  setEditingAllocAmount(Number(alloc.amount));
                                }}
                                className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
                                title="Edit bonus amount"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border capitalize bg-slate-100 text-slate-700 border-slate-200">
                          {alloc.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                      No individual allocations recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setShowAllocationsModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
