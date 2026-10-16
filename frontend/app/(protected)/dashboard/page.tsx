"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  CalendarDays,
  Layers,
  CheckCircle2,
  Plus,
  ShieldCheck,
  Server,
  BarChart3,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { env } from "@/lib/config/env";
import { ROUTES } from "@/constants/routes";
import type { ExecutiveOverviewReport } from "@/types/reports";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentOrganization, membership } = useOrganization();
  const [overview, setOverview] = React.useState<ExecutiveOverviewReport | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = React.useState<boolean>(false);

  React.useEffect(() => {
    let isMounted = true;
    const orgId = currentOrganization?.id;
    if (!orgId) return;

    // Check localStorage cache for instant zero-latency hydration
    try {
      const cached = localStorage.getItem(`officeos_cached_overview_${orgId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") {
          setOverview(parsed);
        }
      }
    } catch {
      // Ignore localStorage errors
    }

    async function fetchDashboardMetrics() {
      if (!orgId) return;
      setIsLoadingMetrics(true);
      try {
        const res = await apiClient.get<ExecutiveOverviewReport>(API_ENDPOINTS.reports.overview, {
          organizationId: orgId,
        });
        if (isMounted && res) {
          setOverview(res);
          try {
            localStorage.setItem(`officeos_cached_overview_${orgId}`, JSON.stringify(res));
          } catch {
            // Ignore quota errors
          }
        }
      } catch {
        // Fallback to null; cards will display graceful dashes or standard indicators
      } finally {
        if (isMounted) {
          setIsLoadingMetrics(false);
        }
      }
    }

    fetchDashboardMetrics();
    return () => {
      isMounted = false;
    };
  }, [currentOrganization?.id]);

  const greetingName =
    user?.firstName || user?.fullName || user?.email?.split("@")[0] || "Team Member";

  const totalEmployees = overview ? (
    overview.active_employees_count
  ) : isLoadingMetrics ? (
    <Skeleton className="h-8 w-14" />
  ) : (
    "—"
  );
  const attendanceDisplay = overview ? (
    `${overview.attendance_today_count} / ${overview.active_employees_count}`
  ) : isLoadingMetrics ? (
    <Skeleton className="h-8 w-20" />
  ) : (
    "—"
  );
  const attendanceRate = overview ? (
    `${overview.attendance_rate_today}% attendance rate`
  ) : isLoadingMetrics ? (
    <Skeleton className="h-4 w-28 mt-0.5" />
  ) : (
    "Today's rate"
  );
  const pendingLeaves = overview ? (
    overview.pending_leaves_count
  ) : isLoadingMetrics ? (
    <Skeleton className="h-8 w-14" />
  ) : (
    "—"
  );
  const activeProjects = overview ? (
    overview.active_projects_count
  ) : isLoadingMetrics ? (
    <Skeleton className="h-8 w-14" />
  ) : (
    "—"
  );

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/60 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Welcome back, {greetingName}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Real-time organizational overview for{" "}
            <span className="font-semibold text-slate-700">
              {currentOrganization?.name || "Your Organization"}
            </span>
            .
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Link href={ROUTES.REPORTS}>
            <Button size="sm" variant="outline" className="flex items-center gap-1.5 shadow-subtle">
              <BarChart3 className="h-4 w-4 text-slate-600" />
              <span>View Reports</span>
            </Button>
          </Link>
          <Link href={ROUTES.OPERATIONS}>
            <Button size="sm" className="flex items-center gap-1.5 shadow-subtle">
              <Plus className="h-4 w-4" />
              <span>New Task</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <Card hover className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Employees</span>
            <div className="h-8 w-8 rounded-lg bg-blue-50/80 text-blue-600 flex items-center justify-center border border-blue-100">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {totalEmployees}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center">
              Active staff in organization
            </p>
          </div>
        </Card>

        <Card hover className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Today</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50/80 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {attendanceDisplay}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-1">
              {attendanceRate}
            </div>
          </div>
        </Card>

        <Card hover className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Leaves</span>
            <div className="h-8 w-8 rounded-lg bg-amber-50/80 text-amber-600 flex items-center justify-center border border-amber-100">
              <CalendarDays className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {pendingLeaves}
            </div>
            <p className="text-[11px] text-amber-600 font-medium mt-1">
              {Number(pendingLeaves) > 0 ? "Requires review" : "Up to date"}
            </p>
          </div>
        </Card>

        <Card hover className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Projects</span>
            <div className="h-8 w-8 rounded-lg bg-indigo-50/80 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {activeProjects}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Active client & internal engagements
            </p>
          </div>
        </Card>
      </div>

      {/* Grid: System Status & Foundation Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Foundation Architecture Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Architecture & Integration Status</CardTitle>
                <CardDescription>
                  Status of frontend connectivity and platform boundaries.
                </CardDescription>
              </div>
              <Badge variant="success">Foundation Ready</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-md bg-white border border-slate-200 text-slate-700">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">FastAPI Business API</p>
                    <p className="text-xs text-slate-500">Base URL: {env.apiUrl}</p>
                  </div>
                </div>
                <Badge variant="info">v1 Convention</Badge>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Centralized typed API client with automatic Supabase Bearer token injection and standardized envelope handling.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-md bg-white border border-slate-200 text-slate-700">
                    <ShieldCheck className="h-4 w-4 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Multi-Tenant Isolation</p>
                    <p className="text-xs text-slate-500">
                      Active Org: {currentOrganization?.id || "None selected"}
                    </p>
                  </div>
                </div>
                <Badge variant="default">Tenant Isolated</Badge>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tenant authorization is authoritative on the backend. Frontend permissions are UX-only helpers.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Right Col: Active Session & Role */}
        <Card>
          <CardHeader>
            <CardTitle>Current Session</CardTitle>
            <CardDescription>Authenticated user context</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                <span className="text-slate-500">User Email</span>
                <span className="font-medium text-slate-800 truncate max-w-[160px]">
                  {user?.email || "demo@officeos.local"}
                </span>
              </div>
              <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                <span className="text-slate-500">Active Role</span>
                <span className="font-medium capitalize text-slate-800">
                  {membership?.role?.replace("_", " ") || "Admin"}
                </span>
              </div>
              <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                <span className="text-slate-500">Organization</span>
                <span className="font-medium text-slate-800">
                  {currentOrganization?.name || "Demo Org"}
                </span>
              </div>
              <div className="flex justify-between text-xs py-1">
                <span className="text-slate-500">Auth Status</span>
                <span className="inline-flex items-center text-emerald-600 font-medium">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Connected
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => window.location.reload()}>
                Refresh Session State
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
