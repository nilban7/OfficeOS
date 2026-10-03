"use client";

import * as React from "react";
import {
  Database,
  Activity,
  Layers,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Server,
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
import type { PlatformHealthResponse } from "@/types/saas";

export default function SaaSAdminHealthPage() {
  const { membership, permissions, isLoading: isOrgLoading } = useOrganization();
  const isSysAdmin = membership?.role === "system_admin" || permissions.includes("saas.view");

  const [health, setHealth] = React.useState<PlatformHealthResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchHealth = React.useCallback(async () => {
    if (!isSysAdmin) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<PlatformHealthResponse>(API_ENDPOINTS.admin.health);
      const data = (res as any)?.data || res;
      setHealth(data);
    } catch (err: any) {
      setError(err?.message || "Failed to retrieve platform health telemetry");
    } finally {
      setIsLoading(false);
    }
  }, [isSysAdmin]);

  React.useEffect(() => {
    if (!isOrgLoading && isSysAdmin) {
      fetchHealth();
    } else if (!isOrgLoading && !isSysAdmin) {
      setIsLoading(false);
    }
  }, [isOrgLoading, isSysAdmin, fetchHealth]);

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

  if (isLoading && !health) {
    return <LoadingState message="Connecting to platform telemetry probe..." />;
  }

  if (error && !health) {
    return (
      <div className="py-12">
        <ErrorState
          title="Health Telemetry Failure"
          message={error}
          onRetry={fetchHealth}
        />
      </div>
    );
  }

  const isDbHealthy = health?.database_connected === true;
  const latency = health?.database_latency_ms ?? 0;
  const latencyColor =
    latency < 100
      ? "text-emerald-600 dark:text-emerald-400"
      : latency < 300
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Platform & Fleet Health"
        description="Real-time operational telemetry, database latency probing, and migration schema verification."
        badgeText={health?.status === "healthy" ? "Operational" : "Degraded"}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchHealth}
          disabled={isLoading}
          className="flex items-center gap-1.5"
        >
          <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span>Probe Health</span>
        </Button>
      </AdminHeader>

      {/* Main Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Service Status</CardTitle>
            <Server className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-2xl font-bold capitalize text-slate-900 dark:text-white">
                {health?.status ?? "Healthy"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">FastAPI backend operational</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Database Engine</CardTitle>
            <Database className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {isDbHealthy ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {isDbHealthy ? "Connected" : "Disconnected"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">PostgreSQL (Supabase RDS)</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Database Latency</CardTitle>
            <Activity className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${latencyColor}`}>
              {latency.toFixed(2)} ms
            </div>
            <p className="mt-1 text-xs text-slate-500">Live SELECT 1 round-trip</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Active Fleet</CardTitle>
            <Layers className="h-4 w-4 text-primary-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {health?.active_organizations ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">Active tenant organizations</p>
          </CardContent>
        </Card>
      </div>

      {/* Release & Schema Information */}
      <Card className="border-slate-200/80 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
            Software Version & Database Migrations
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Sanitized deployment metadata for platform integrity verification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-500">Application Version</dt>
              <dd className="mt-1 font-mono text-sm text-slate-900 dark:text-slate-100">
                {health?.app_version ?? "1.0.0"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Alembic Migration Head</dt>
              <dd className="mt-1 font-mono text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{health?.migration_head ?? "unknown"}</span>
                <Badge variant="success" className="text-[10px]">Current</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Environment</dt>
              <dd className="mt-1 text-sm capitalize text-slate-900 dark:text-slate-100">
                {health?.environment ?? "production"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Security Isolation</dt>
              <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>PostgreSQL Row-Level Security Enforced</span>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
