"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  Layers,
  Box,
  RotateCcw,
  ArrowRight,
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
import type { PlatformUsageResponse } from "@/types/saas";

export default function SaaSAdminUsagePage() {
  const { membership, permissions, isLoading: isOrgLoading } = useOrganization();
  const isSysAdmin = membership?.role === "system_admin" || permissions.includes("saas.view");

  const [usage, setUsage] = React.useState<PlatformUsageResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchUsage = React.useCallback(async () => {
    if (!isSysAdmin) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<PlatformUsageResponse>(API_ENDPOINTS.admin.usage);
      const data = (res as any)?.data || res;
      setUsage(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load platform usage metrics");
    } finally {
      setIsLoading(false);
    }
  }, [isSysAdmin]);

  React.useEffect(() => {
    if (!isOrgLoading && isSysAdmin) {
      fetchUsage();
    } else if (!isOrgLoading && !isSysAdmin) {
      setIsLoading(false);
    }
  }, [isOrgLoading, isSysAdmin, fetchUsage]);

  if (isOrgLoading) {
    return <LoadingState message="Verifying administrative credentials..." />;
  }

  if (!isSysAdmin) {
    return (
      <div className="py-12">
        <ErrorState
          title="Access Forbidden"
          message="Platform Administration is strictly restricted to system_admin personnel."
        />
      </div>
    );
  }

  if (isLoading && !usage) {
    return <LoadingState message="Aggregating platform usage metrics..." />;
  }

  if (error && !usage) {
    return (
      <div className="py-12">
        <ErrorState
          title="Failed to Load Usage Data"
          message={error}
          onRetry={fetchUsage}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Platform Usage & Aggregates"
        description="Database-aggregated multi-tenant usage metrics. Resource consumption across all active tenants."
        badgeText="Multi-Tenant Telemetry"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchUsage}
          disabled={isLoading}
          className="flex items-center gap-1.5"
        >
          <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </AdminHeader>

      {/* Aggregated KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Fleet Size</CardTitle>
            <Building2 className="h-4 w-4 text-primary-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {usage?.total_organizations ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {usage?.active_organizations ?? 0} active • {usage?.suspended_organizations ?? 0} suspended
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Workforce</CardTitle>
            <Users className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {usage?.total_employees ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Across {usage?.total_members ?? 0} membership accounts
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Active Projects</CardTitle>
            <Layers className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {usage?.total_projects ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Associated with {usage?.total_clients ?? 0} client entities
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Inventory & Docs</CardTitle>
            <Box className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {(usage?.total_assets ?? 0) + (usage?.total_documents ?? 0)}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {usage?.total_assets ?? 0} assets • {usage?.total_documents ?? 0} documents
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Organization Breakdown Table */}
      <Card className="border-slate-200/80 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
            Resource Distribution by Organization
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Per-tenant breakdown of core resource consumption.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usage?.organization_breakdown && usage.organization_breakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Tenant Organization</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Members</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Employees</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Projects</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {usage.organization_breakdown.map((item) => (
                    <tr key={item.organization_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {item.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={item.status === "suspended" ? "destructive" : "success"}
                          className="text-[11px] capitalize"
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{item.member_count}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.employee_count}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.project_count}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/organizations/${item.organization_id}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            <span>Inspect</span>
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-500">
              No breakdown data available.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
