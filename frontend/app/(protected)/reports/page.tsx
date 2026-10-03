"use client";

import * as React from "react";
import {
  BarChart3,
  Users,
  Clock,
  CalendarDays,
  Layers,
  ShoppingBag,
  DollarSign,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { SimpleBarChart, SimpleDonutChart, SimpleProgressBar } from "@/components/ui/simple-chart";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  AssetReport,
  AttendanceReport,
  AuditActivityReport,
  DocumentsReport,
  ExecutiveOverviewReport,
  FinanceReport,
  InternshipReport,
  LeaveReport,
  MaintenanceReport,
  OperationsReport,
  ProcurementReport,
  ProjectReport,
  TrainingReport,
  WorkforceReport,
} from "@/types/reports";

type ReportTab =
  | "overview"
  | "workforce"
  | "attendance_leave"
  | "projects_ops"
  | "procurement_assets"
  | "finance"
  | "audit";

type DateRangePreset = "today" | "7d" | "30d" | "this_month" | "last_month" | "custom";

export default function ReportsPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canViewReports =
    permissions.includes("reports.view") ||
    permissions.includes("organizations.view") ||
    permissions.includes("org:read");
  const canViewFinance =
    permissions.includes("reports.finance") ||
    permissions.includes("finance.view") ||
    permissions.includes("finance:read");
  const canViewAudit =
    permissions.includes("reports.audit") || permissions.includes("audit_logs.view");
  const canViewWorkforce =
    permissions.includes("reports.workforce") ||
    permissions.includes("employees.view") ||
    permissions.includes("employee:read");
  const canViewAttendance =
    permissions.includes("reports.attendance") ||
    permissions.includes("attendance.view") ||
    permissions.includes("attendance:read");
  const canViewLeave =
    permissions.includes("reports.leave") ||
    permissions.includes("leave.view") ||
    permissions.includes("leave:read");

  // State
  const [activeTab, setActiveTab] = React.useState<ReportTab>("overview");
  const [datePreset, setDatePreset] = React.useState<DateRangePreset>("30d");
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");

  // Loading & Error States
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Report Data
  const [overview, setOverview] = React.useState<ExecutiveOverviewReport | null>(null);
  const [workforce, setWorkforce] = React.useState<WorkforceReport | null>(null);
  const [attendance, setAttendance] = React.useState<AttendanceReport | null>(null);
  const [leave, setLeave] = React.useState<LeaveReport | null>(null);
  const [projects, setProjects] = React.useState<ProjectReport | null>(null);
  const [procurement, setProcurement] = React.useState<ProcurementReport | null>(null);
  const [assets, setAssets] = React.useState<AssetReport | null>(null);
  const [maintenance, setMaintenance] = React.useState<MaintenanceReport | null>(null);
  const [training, setTraining] = React.useState<TrainingReport | null>(null);
  const [internships, setInternships] = React.useState<InternshipReport | null>(null);
  const [operations, setOperations] = React.useState<OperationsReport | null>(null);
  const [finance, setFinance] = React.useState<FinanceReport | null>(null);
  const [documents, setDocuments] = React.useState<DocumentsReport | null>(null);
  const [audit, setAudit] = React.useState<AuditActivityReport | null>(null);

  // Initialize date range based on preset
  React.useEffect(() => {
    const today = new Date();
    const toIso = today.toISOString().split("T")[0] || "";

    if (datePreset === "today") {
      setDateFrom(toIso);
      setDateTo(toIso);
    } else if (datePreset === "7d") {
      const past = new Date(today);
      past.setDate(past.getDate() - 7);
      setDateFrom(past.toISOString().split("T")[0] || "");
      setDateTo(toIso);
    } else if (datePreset === "30d") {
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      setDateFrom(past.toISOString().split("T")[0] || "");
      setDateTo(toIso);
    } else if (datePreset === "this_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(firstDay.toISOString().split("T")[0] || "");
      setDateTo(toIso);
    } else if (datePreset === "last_month") {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      setDateFrom(firstDayLastMonth.toISOString().split("T")[0] || "");
      setDateTo(lastDayLastMonth.toISOString().split("T")[0] || "");
    }
  }, [datePreset]);

  // Fetch report data
  const fetchReportData = React.useCallback(async () => {
    if (!currentOrganization?.id || !canViewReports) return;

    setIsLoading(true);
    setError(null);

    const queryParams: Record<string, string> = {};
    if (dateFrom) queryParams.date_from = dateFrom;
    if (dateTo) queryParams.date_to = dateTo;
    const queryString = new URLSearchParams(queryParams).toString();
    const withQuery = queryString ? `?${queryString}` : "";

    try {
      if (activeTab === "overview") {
        const res = await apiClient.get<any>(API_ENDPOINTS.reports.overview);
        setOverview(res?.data || res);
      } else if (activeTab === "workforce") {
        if (canViewWorkforce) {
          const [wfRes, trainRes, internRes] = await Promise.all([
            apiClient.get<any>(API_ENDPOINTS.reports.workforce),
            apiClient.get<any>(API_ENDPOINTS.reports.training),
            apiClient.get<any>(API_ENDPOINTS.reports.internships),
          ]);
          setWorkforce(wfRes?.data || wfRes);
          setTraining(trainRes?.data || trainRes);
          setInternships(internRes?.data || internRes);
        }
      } else if (activeTab === "attendance_leave") {
        const promises: Promise<any>[] = [];
        if (canViewAttendance) {
          promises.push(apiClient.get<any>(`${API_ENDPOINTS.reports.attendance}${withQuery}`));
        } else {
          promises.push(Promise.resolve(null));
        }
        if (canViewLeave) {
          promises.push(apiClient.get<any>(`${API_ENDPOINTS.reports.leave}${withQuery}`));
        } else {
          promises.push(Promise.resolve(null));
        }
        const [attRes, leaveRes] = await Promise.all(promises);
        if (attRes) setAttendance(attRes?.data || attRes);
        if (leaveRes) setLeave(leaveRes?.data || leaveRes);
      } else if (activeTab === "projects_ops") {
        const [prjRes, opsRes, docRes] = await Promise.all([
          apiClient.get<any>(API_ENDPOINTS.reports.projects),
          apiClient.get<any>(API_ENDPOINTS.reports.operations),
          apiClient.get<any>(API_ENDPOINTS.reports.documents),
        ]);
        setProjects(prjRes?.data || prjRes);
        setOperations(opsRes?.data || opsRes);
        setDocuments(docRes?.data || docRes);
      } else if (activeTab === "procurement_assets") {
        const [procRes, astRes, maintRes] = await Promise.all([
          apiClient.get<any>(API_ENDPOINTS.reports.procurement),
          apiClient.get<any>(API_ENDPOINTS.reports.assets),
          apiClient.get<any>(API_ENDPOINTS.reports.maintenance),
        ]);
        setProcurement(procRes?.data || procRes);
        setAssets(astRes?.data || astRes);
        setMaintenance(maintRes?.data || maintRes);
      } else if (activeTab === "finance") {
        if (canViewFinance) {
          const res = await apiClient.get<any>(`${API_ENDPOINTS.reports.finance}${withQuery}`);
          setFinance(res?.data || res);
        }
      } else if (activeTab === "audit") {
        if (canViewAudit) {
          const res = await apiClient.get<any>(`${API_ENDPOINTS.reports.auditActivity}${withQuery}`);
          setAudit(res?.data || res);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load reporting data.");
    } finally {
      setIsLoading(false);
    }
  }, [
    currentOrganization?.id,
    canViewReports,
    canViewWorkforce,
    canViewAttendance,
    canViewLeave,
    canViewFinance,
    canViewAudit,
    activeTab,
    dateFrom,
    dateTo,
  ]);

  React.useEffect(() => {
    if (canViewReports && dateFrom && dateTo) {
      fetchReportData();
    }
  }, [fetchReportData, canViewReports, dateFrom, dateTo]);

  if (isOrgLoading) {
    return <LoadingState message="Verifying reporting credentials..." />;
  }

  if (!canViewReports) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/40 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="mt-1 max-w-md text-sm text-slate-600">
          You do not have permission to view organizational reports. Contact your organization administrator to request access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports & Analytics</h1>
              <p className="text-xs text-slate-500">
                Operational intelligence, cross-module analytics, and executive metrics for{" "}
                <span className="font-semibold text-slate-700">{currentOrganization?.name}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Buttons */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm text-xs">
            <button
              onClick={() => setDatePreset("7d")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                datePreset === "7d" ? "bg-primary-50 text-primary-700 font-semibold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              7D
            </button>
            <button
              onClick={() => setDatePreset("30d")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                datePreset === "30d" ? "bg-primary-50 text-primary-700 font-semibold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              30D
            </button>
            <button
              onClick={() => setDatePreset("this_month")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                datePreset === "this_month" ? "bg-primary-50 text-primary-700 font-semibold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setDatePreset("custom")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                datePreset === "custom" ? "bg-primary-50 text-primary-700 font-semibold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Custom
            </button>
          </div>

          {/* Date Picker (shown if custom or for precise review) */}
          {datePreset === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-xs w-32"
                aria-label="Start date"
              />
              <span className="text-slate-400 text-xs">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-xs w-32"
                aria-label="End date"
              />
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReportData()}
            disabled={isLoading}
            className="h-8 gap-1.5 text-xs"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6 overflow-x-auto text-sm font-medium">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-1.5 pb-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "overview"
                ? "border-primary-600 text-primary-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Executive Overview
          </button>

          {canViewWorkforce && (
            <button
              onClick={() => setActiveTab("workforce")}
              className={`flex items-center gap-1.5 pb-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "workforce"
                  ? "border-primary-600 text-primary-600 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Users className="h-4 w-4" />
              Workforce & Talent
            </button>
          )}

          {(canViewAttendance || canViewLeave) && (
            <button
              onClick={() => setActiveTab("attendance_leave")}
              className={`flex items-center gap-1.5 pb-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "attendance_leave"
                  ? "border-primary-600 text-primary-600 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Clock className="h-4 w-4" />
              Attendance & Leave
            </button>
          )}

          <button
            onClick={() => setActiveTab("projects_ops")}
            className={`flex items-center gap-1.5 pb-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "projects_ops"
                ? "border-primary-600 text-primary-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Layers className="h-4 w-4" />
            Projects & Operations
          </button>

          <button
            onClick={() => setActiveTab("procurement_assets")}
            className={`flex items-center gap-1.5 pb-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "procurement_assets"
                ? "border-primary-600 text-primary-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            Procurement & Assets
          </button>

          {canViewFinance && (
            <button
              onClick={() => setActiveTab("finance")}
              className={`flex items-center gap-1.5 pb-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "finance"
                  ? "border-primary-600 text-primary-600 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <DollarSign className="h-4 w-4" />
              Finance & Cash Flow
            </button>
          )}

          {canViewAudit && (
            <button
              onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-1.5 pb-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "audit"
                  ? "border-primary-600 text-primary-600 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Audit Activity
            </button>
          )}
        </nav>
      </div>

      {/* Main Content Viewport */}
      {isLoading ? (
        <LoadingState message="Aggregating operational reports..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchReportData} />
      ) : (
        <div className="space-y-6">
          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {activeTab === "overview" && overview && (
            <div className="space-y-6">
              {/* Primary KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card hover>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Active Workforce
                    </CardTitle>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Users className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-slate-900">{overview.active_employees_count}</div>
                    <p className="mt-1 text-xs text-slate-500">Total active team members</p>
                  </CardContent>
                </Card>

                <Card hover>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Attendance Today
                    </CardTitle>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Clock className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-slate-900">
                      {overview.attendance_today_count}
                      <span className="text-sm font-normal text-slate-500 ml-1.5">
                        ({overview.attendance_rate_today}%)
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-emerald-600 font-medium">Daily attendance rate</p>
                  </CardContent>
                </Card>

                <Card hover>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Active Projects
                    </CardTitle>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <Layers className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-slate-900">{overview.active_projects_count}</div>
                    <p className="mt-1 text-xs text-slate-500">Across {overview.active_clients_count} active clients</p>
                  </CardContent>
                </Card>

                <Card hover>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Pending Approvals
                    </CardTitle>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <CalendarDays className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-slate-900">
                      {overview.pending_leaves_count + overview.pending_purchase_requests_count}
                    </div>
                    <p className="mt-1 text-xs text-amber-600 font-medium">
                      {overview.pending_leaves_count} leaves • {overview.pending_purchase_requests_count} purchases
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Secondary Status Matrix */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base font-bold">Operational Activity Status</CardTitle>
                    <CardDescription>Live queues requiring managerial and departmental attention</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <SimpleProgressBar
                      label="Open Maintenance Requests"
                      value={overview.open_maintenance_requests_count}
                      total={Math.max(overview.open_maintenance_requests_count + 10, 10)}
                      colorClass="bg-amber-500"
                    />
                    <SimpleProgressBar
                      label="Open Operations Tasks"
                      value={overview.open_operations_tasks_count}
                      total={Math.max(overview.open_operations_tasks_count + 15, 15)}
                      colorClass="bg-blue-500"
                    />
                    <SimpleProgressBar
                      label="Active Internships"
                      value={overview.active_internships_count}
                      total={Math.max(overview.active_internships_count + 5, 5)}
                      colorClass="bg-purple-500"
                    />
                    <SimpleProgressBar
                      label="Upcoming Training Sessions"
                      value={overview.upcoming_training_sessions_count}
                      total={Math.max(overview.upcoming_training_sessions_count + 5, 5)}
                      colorClass="bg-emerald-500"
                    />
                  </CardContent>
                </Card>

                {/* Session & Finance Snapshot */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-bold">Executive Highlights</CardTitle>
                    <CardDescription>Security context & sensitive totals</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-2 border border-slate-100">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Stored Documents</span>
                        <span className="font-semibold text-slate-800">{overview.documents_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Unread User Alerts</span>
                        <span className="font-semibold text-slate-800">{overview.unread_notifications_count}</span>
                      </div>
                    </div>

                    {overview.finance_metrics_included ? (
                      <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold">
                          <span>Expenses (MTD)</span>
                          <Badge variant="success" className="text-[10px] px-1.5 py-0">Authorized</Badge>
                        </div>
                        <div className="text-xl font-bold text-emerald-900">
                          {`$${overview.total_expenses_mtd ?? "0.00"}`}
                        </div>
                        <p className="text-[11px] text-emerald-700">
                          {overview.pending_expenses_count ?? 0} expense claims awaiting approval
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center text-xs text-slate-500">
                        <ShieldAlert className="h-4 w-4 mx-auto mb-1 text-slate-400" />
                        Financial summary redacted (requires finance permissions)
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 2: WORKFORCE & TALENT */}
          {activeTab === "workforce" && workforce && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Headcount</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{workforce.total_employees}</div>
                    <div className="text-xs text-slate-500 mt-1">Across all registered statuses</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Status</div>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">{workforce.active_employees}</div>
                    <div className="text-xs text-slate-500 mt-1">Fully onboarded staff</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Probation & Notice</div>
                    <div className="text-2xl font-bold text-amber-600 mt-1">
                      {workforce.probation_employees + workforce.notice_period_employees}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {workforce.probation_employees} probation • {workforce.notice_period_employees} notice
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">On Leave / Terminated</div>
                    <div className="text-2xl font-bold text-slate-700 mt-1">
                      {workforce.on_leave_employees} / {workforce.terminated_employees}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {workforce.on_leave_employees} on leave • {workforce.terminated_employees} terminated
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Department Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-bold">Department Breakdown</CardTitle>
                    <CardDescription>Employee allocation across organization departments</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {workforce.departments.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">No department data found</div>
                    ) : (
                      <SimpleDonutChart
                        centerLabel="Depts"
                        centerValue={workforce.departments.length}
                        items={workforce.departments.map((d, i) => {
                          const palette = ["#2563eb", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
                          return {
                            label: d.department_name,
                            value: d.count,
                            color: palette[i % palette.length] ?? "#2563eb",
                          };
                        })}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Training & Internships Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-bold">Talent Development & Programs</CardTitle>
                    <CardDescription>Summary of active internships and training programs</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        <span className="text-slate-500 block">Training Programs</span>
                        <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                          {training?.total_programs ?? 0}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {training?.completion_rate ?? "0.0"}% completion rate
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        <span className="text-slate-500 block">Active Interns</span>
                        <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                          {internships?.active_internships ?? 0}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {`$${internships?.total_stipend_committed ?? "0.00"} committed`}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE & LEAVE */}
          {activeTab === "attendance_leave" && (
            <div className="space-y-6">
              {attendance && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Period Attendance Rate</div>
                        <div className="text-2xl font-bold text-emerald-600 mt-1">{attendance.attendance_rate}%</div>
                        <div className="text-xs text-slate-500 mt-1">{attendance.total_records} total shift records</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Present Shifts</div>
                        <div className="text-2xl font-bold text-blue-600 mt-1">{attendance.present_count}</div>
                        <div className="text-xs text-slate-500 mt-1">{attendance.half_day_count} half days recorded</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Late Check-ins</div>
                        <div className="text-2xl font-bold text-amber-600 mt-1">{attendance.late_count}</div>
                        <div className="text-xs text-slate-500 mt-1">Within selected date range</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Unexcused Absences</div>
                        <div className="text-2xl font-bold text-rose-600 mt-1">{attendance.absent_count}</div>
                        <div className="text-xs text-slate-500 mt-1">Excludes planned leave</div>
                      </CardContent>
                    </Card>
                  </div>

                  {attendance.daily_trends.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-bold">Daily Attendance Trends</CardTitle>
                        <CardDescription>Present employees count per day in the selected range</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <SimpleBarChart
                          items={attendance.daily_trends.map((t) => ({
                            label: t.date.slice(5),
                            value: t.present_count,
                            colorClass: "bg-emerald-500",
                            formattedValue: `${t.present_count} (${t.attendance_rate}%)`,
                          }))}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {leave && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-bold">Leave Requests & Utilization</CardTitle>
                    <CardDescription>Overview of leave days approved and request statuses</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        <span className="text-slate-500">Approved Leave Days</span>
                        <span className="text-xl font-bold text-slate-900 block mt-0.5">{leave.total_approved_days}</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        <span className="text-slate-500">Approval Volume</span>
                        <span className="text-xl font-bold text-slate-900 block mt-0.5">
                          {leave.approved_count} / {leave.total_requests}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        <span className="text-slate-500">Pending Review</span>
                        <span className="text-xl font-bold text-amber-600 block mt-0.5">{leave.pending_count}</span>
                      </div>
                    </div>

                    {leave.leave_types.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                          Utilization by Leave Type
                        </h4>
                        <div className="overflow-x-auto rounded-lg border border-slate-100">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                              <tr>
                                <th className="p-2.5">Leave Type</th>
                                <th className="p-2.5">Requests</th>
                                <th className="p-2.5 text-right">Total Days Taken</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                              {leave.leave_types.map((lt) => (
                                <tr key={lt.leave_type_id}>
                                  <td className="p-2.5 font-medium">{lt.leave_type_name}</td>
                                  <td className="p-2.5">{lt.request_count}</td>
                                  <td className="p-2.5 text-right font-semibold">{lt.total_days}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 4: PROJECTS & OPERATIONS */}
          {activeTab === "projects_ops" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Projects</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{projects?.total_projects ?? 0}</div>
                    <div className="text-xs text-slate-500 mt-1">{projects?.active_projects ?? 0} in active execution</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Portfolio Budget</div>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">{`$${projects?.total_budget ?? "0.00"}`}</div>
                    <div className="text-xs text-slate-500 mt-1">Across all planned and active projects</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Operations Tasks</div>
                    <div className="text-2xl font-bold text-blue-600 mt-1">{operations?.total_tasks ?? 0}</div>
                    <div className="text-xs text-slate-500 mt-1">{operations?.open_tasks ?? 0} open, {operations?.completed_tasks ?? 0} completed</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Repository Documents</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{documents?.total_documents ?? 0}</div>
                    <div className="text-xs text-slate-500 mt-1">{documents?.total_versions ?? 0} version iterations</div>
                  </CardContent>
                </Card>
              </div>

              {projects?.client_distribution && projects.client_distribution.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-bold">Top Clients by Project Volume</CardTitle>
                    <CardDescription>Client account distribution and active projects</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                          <tr>
                            <th className="p-2.5">Client Organization</th>
                            <th className="p-2.5 text-right">Projects Count</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {projects.client_distribution.map((c, i) => (
                            <tr key={c.client_id || `client-${i}`}>
                              <td className="p-2.5 font-medium">{c.client_name}</td>
                              <td className="p-2.5 text-right font-semibold">{c.project_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 5: PROCUREMENT & ASSETS */}
          {activeTab === "procurement_assets" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Purchase Requests</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{procurement?.total_purchase_requests ?? 0}</div>
                    <div className="text-xs text-slate-500 mt-1">{procurement?.approved_purchase_requests ?? 0} approved</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Assets Registered</div>
                    <div className="text-2xl font-bold text-blue-600 mt-1">{assets?.total_assets ?? 0}</div>
                    <div className="text-xs text-slate-500 mt-1">{assets?.assigned_assets ?? 0} currently deployed</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Asset Valuation</div>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">{`$${assets?.total_purchase_cost ?? "0.00"}`}</div>
                    <div className="text-xs text-slate-500 mt-1">Original purchase valuation</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Maintenance Costs</div>
                    <div className="text-2xl font-bold text-rose-600 mt-1">{`$${maintenance?.total_maintenance_cost ?? "0.00"}`}</div>
                    <div className="text-xs text-slate-500 mt-1">{maintenance?.total_records_count ?? 0} repair jobs completed</div>
                  </CardContent>
                </Card>
              </div>

              {assets?.category_distribution && assets.category_distribution.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-bold">Assets by Category</CardTitle>
                    <CardDescription>Hardware and inventory distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SimpleBarChart
                      items={assets.category_distribution.map((cat) => ({
                        label: cat.category,
                        value: cat.count,
                        colorClass: "bg-blue-600",
                      }))}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 6: FINANCE & CASH FLOW */}
          {activeTab === "finance" && (
            <div className="space-y-6">
              {!canViewFinance ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center text-xs text-rose-700">
                  <ShieldAlert className="h-6 w-6 mx-auto mb-2 text-rose-600" />
                  You do not have permission to view organizational finance reports.
                </div>
              ) : finance ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Period Expenses</div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{`$${finance.total_expenses}`}</div>
                        <div className="text-xs text-slate-500 mt-1">{`Paid: $${finance.paid_expenses_total}`}</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Debits</div>
                        <div className="text-2xl font-bold text-emerald-600 mt-1">{`$${finance.total_debits}`}</div>
                        <div className="text-xs text-slate-500 mt-1">Posted transaction debits</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Credits</div>
                        <div className="text-2xl font-bold text-rose-600 mt-1">{`$${finance.total_credits}`}</div>
                        <div className="text-xs text-slate-500 mt-1">Posted transaction credits</div>
                      </CardContent>
                    </Card>
                  </div>

                  {finance.expenses_by_category.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-bold">Expenses by Category</CardTitle>
                        <CardDescription>Breakdown of expenditure across categories</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto rounded-lg border border-slate-100">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                              <tr>
                                <th className="p-2.5">Category</th>
                                <th className="p-2.5">Claims</th>
                                <th className="p-2.5 text-right">Total Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                              {finance.expenses_by_category.map((cat) => (
                                <tr key={cat.category_id}>
                                  <td className="p-2.5 font-medium">{cat.category_name}</td>
                                  <td className="p-2.5">{cat.expense_count}</td>
                                  <td className="p-2.5 text-right font-bold">{`$${cat.total_amount}`}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 7: AUDIT ACTIVITY */}
          {activeTab === "audit" && (
            <div className="space-y-6">
              {!canViewAudit ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center text-xs text-rose-700">
                  <ShieldAlert className="h-6 w-6 mx-auto mb-2 text-rose-600" />
                  You do not have permission to view organizational audit analytics.
                </div>
              ) : audit ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Audit Events</div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{audit.total_events}</div>
                        <div className="text-xs text-slate-500 mt-1">Recorded within date boundary</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Entity Types Affected</div>
                        <div className="text-2xl font-bold text-blue-600 mt-1">{audit.events_by_entity.length}</div>
                        <div className="text-xs text-slate-500 mt-1">Unique domains modified</div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Security Actions Tracked</div>
                        <div className="text-2xl font-bold text-purple-600 mt-1">{audit.events_by_action.length}</div>
                        <div className="text-xs text-slate-500 mt-1">Unique state mutation types</div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {audit.events_by_entity.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base font-bold">Activity by Entity</CardTitle>
                          <CardDescription>Top modified system models</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <SimpleBarChart
                            items={audit.events_by_entity.map((e) => ({
                              label: e.entity_type,
                              value: e.count,
                              colorClass: "bg-indigo-600",
                            }))}
                          />
                        </CardContent>
                      </Card>
                    )}

                    {audit.daily_trend.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base font-bold">Daily Event Volume</CardTitle>
                          <CardDescription>Distribution of actions across days</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <SimpleBarChart
                            items={audit.daily_trend.map((d) => ({
                              label: d.date.slice(5),
                              value: d.count,
                              colorClass: "bg-purple-600",
                            }))}
                          />
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
