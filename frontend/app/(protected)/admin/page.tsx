"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  Briefcase,
  HeartPulse,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { AdminHeader } from "@/components/admin/admin-header";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { PlatformOverviewResponse } from "@/types/saas";

export default function SaaSAdminOverviewPage() {
  const { membership, permissions, isLoading: isOrgLoading } = useOrganization();

  const isSysAdmin = membership?.role === "system_admin" || permissions.includes("saas.view");

  const [overview, setOverview] = React.useState<PlatformOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchOverview = React.useCallback(async () => {
    if (!isSysAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PlatformOverviewResponse>(API_ENDPOINTS.admin.overview);
      const data = (res as any)?.data || res;
      setOverview(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load SaaS administration overview");
    } finally {
      setIsLoading(false);
    }
  }, [isSysAdmin]);

  React.useEffect(() => {
    if (!isOrgLoading && isSysAdmin) {
      fetchOverview();
    } else if (!isOrgLoading && !isSysAdmin) {
      setIsLoading(false);
    }
  }, [isOrgLoading, isSysAdmin, fetchOverview]);

  if (isOrgLoading) {
    return <LoadingState message="Verifying administrative credentials..." />;
  }

  if (!isSysAdmin) {
    return (
      <div className="py-12">
        <ErrorState
          title="Access Forbidden"
          message="Platform Administration is strictly restricted to system_admin personnel. Your account does not possess the requisite platform privileges."
        />
      </div>
    );
  }

  if (isLoading && !overview) {
    return <LoadingState message="Loading SaaS platform telemetry..." />;
  }

  if (error && !overview) {
    return (
      <div className="py-8">
        <ErrorState
          title="Failed to Load SaaS Overview"
          message={error}
          onRetry={fetchOverview}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminHeader
        title="Platform Administration"
        description="Unified SaaS fleet management, multi-tenant monitoring, and platform control plane."
        badgeText="SaaS Control Plane"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchOverview}
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </AdminHeader>

      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Organizations
            </CardTitle>
            <Building2 className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {overview?.total_organizations ?? 0}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
              <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-medium">
                {overview?.active_organizations ?? 0} active
              </span>
              <span>•</span>
              <span className="inline-flex items-center text-amber-600 dark:text-amber-400 font-medium">
                {overview?.suspended_organizations ?? 0} suspended
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Platform Users
            </CardTitle>
            <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {overview?.total_users ?? 0}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Registered platform profile memberships
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Employees
            </CardTitle>
            <Briefcase className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {overview?.total_employees ?? 0}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Active workforce across all tenants
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Platform Health
            </CardTitle>
            <HeartPulse className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-2xl font-bold text-slate-900 dark:text-white capitalize">
                {overview?.system_status ?? "Healthy"}
              </span>
            </div>
            <Link
              href="/admin/health"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              <span>View telemetry</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link href="/admin/organizations" className="group">
          <Card className="h-full border-slate-200/80 dark:border-slate-800 hover:border-primary-500/50 dark:hover:border-primary-500/50 transition-all p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 group-hover:scale-105 transition-transform">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  Organizations Directory
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Search, filter, suspend, and restore tenant organizations.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Card>
        </Link>

        <Link href="/admin/usage" className="group">
          <Card className="h-full border-slate-200/80 dark:border-slate-800 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
                <Briefcase className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  Platform Usage
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Aggregated resource allocation across projects and documents.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Card>
        </Link>

        <Link href="/admin/audit-logs" className="group">
          <Card className="h-full border-slate-200/80 dark:border-slate-800 hover:border-violet-500/50 dark:hover:border-violet-500/50 transition-all p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 group-hover:scale-105 transition-transform">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                  Platform Audit Logs
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Cross-tenant security forensics and immutable event streams.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Card>
        </Link>
      </div>

      {/* Recent Organizations Section */}
      <Card className="border-slate-200/80 dark:border-slate-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
              Recently Provisioned Organizations
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              Latest tenants onboarded to the OfficeOS SaaS platform.
            </CardDescription>
          </div>
          <Link href="/admin/organizations">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-xs">
              <span>View all organizations</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {overview?.recent_organizations && overview.recent_organizations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Organization</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Slug</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Branches</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Members</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {overview.recent_organizations.map((org) => {
                    const isSuspended = org.status === "suspended";
                    return (
                      <tr key={org.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                          <Link href={`/admin/organizations/${org.id}`} className="hover:underline flex items-center gap-2">
                            <span>{org.name}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{org.slug}</td>
                        <td className="px-4 py-3">
                          <Badge variant={isSuspended ? "destructive" : "success"} className="text-[11px] capitalize">
                            {org.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{org.branch_count}</td>
                        <td className="px-4 py-3">{org.member_count}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(org.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/admin/organizations/${org.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 text-xs font-medium">
                              Inspect
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-500">
              No recent organizations found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
