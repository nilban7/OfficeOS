"use client";

import * as React from "react";
import {
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { AdminHeader } from "@/components/admin/admin-header";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { PlatformConfiguration, PlatformConfigurationUpdate } from "@/types/saas";

export default function SaaSAdminSettingsPage() {
  const { membership, permissions, isLoading: isOrgLoading } = useOrganization();
  const isSysAdmin = membership?.role === "system_admin" || permissions.includes("saas.view");
  const canManage = membership?.role === "system_admin" || permissions.includes("saas.manage");

  const [config, setConfig] = React.useState<PlatformConfiguration | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Form Fields
  const [platformName, setPlatformName] = React.useState("");
  const [supportEmail, setSupportEmail] = React.useState("");
  const [maintenanceMode, setMaintenanceMode] = React.useState(false);
  const [domainsInput, setDomainsInput] = React.useState("");
  const [maxOrgs, setMaxOrgs] = React.useState(1000);

  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const fetchConfig = React.useCallback(async () => {
    if (!isSysAdmin) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<PlatformConfiguration>(API_ENDPOINTS.admin.config);
      const data = (res as any)?.data || res;
      setConfig(data);
      setPlatformName(data.platform_name || "OfficeOS");
      setSupportEmail(data.support_email || "");
      setMaintenanceMode(data.maintenance_mode || false);
      setDomainsInput((data.allowed_signup_domains || []).join(", "));
      setMaxOrgs(data.max_organizations || 1000);
    } catch (err: any) {
      setError(err?.message || "Failed to load platform configuration");
    } finally {
      setIsLoading(false);
    }
  }, [isSysAdmin]);

  React.useEffect(() => {
    if (!isOrgLoading && isSysAdmin) {
      fetchConfig();
    } else if (!isOrgLoading && !isSysAdmin) {
      setIsLoading(false);
    }
  }, [isOrgLoading, isSysAdmin, fetchConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const domains = domainsInput
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      const payload: PlatformConfigurationUpdate = {
        platform_name: platformName.trim() || undefined,
        support_email: supportEmail.trim() || undefined,
        maintenance_mode: maintenanceMode,
        allowed_signup_domains: domains,
        max_organizations: Number(maxOrgs),
      };

      const res = await apiClient.patch<PlatformConfiguration>(API_ENDPOINTS.admin.config, payload);
      const updated = (res as any)?.data || res;
      setConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to update platform settings");
    } finally {
      setIsSaving(false);
    }
  };

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

  if (isLoading && !config) {
    return <LoadingState message="Loading platform configuration..." />;
  }

  if (error && !config) {
    return (
      <div className="py-12">
        <ErrorState
          title="Configuration Loading Failed"
          message={error}
          onRetry={fetchConfig}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Platform Configuration"
        description="Global SaaS platform settings, onboarding rules, support routing, and maintenance mode controls."
        badgeText="SaaS Settings"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchConfig}
          disabled={isLoading}
          className="flex items-center gap-1.5"
        >
          <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span>Reload</span>
        </Button>
      </AdminHeader>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>Platform configuration updated successfully and recorded in audit log.</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
              General SaaS Settings
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Identity, branding, and contact points exposed across the platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Platform Name
                </label>
                <Input
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  disabled={!canManage || isSaving}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Support Email
                </label>
                <Input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@example.com"
                  disabled={!canManage || isSaving}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Maximum Fleet Capacity (Organizations)
              </label>
              <Input
                type="number"
                min={1}
                max={100000}
                value={maxOrgs}
                onChange={(e) => setMaxOrgs(Number(e.target.value))}
                disabled={!canManage || isSaving}
                className="max-w-xs"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Upper limit on total provisioned tenant organizations.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Access and Security Controls */}
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
              Signup Restrictions & Maintenance Mode
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Fleet-wide operational and registration controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Allowed Signup Email Domains (Comma-separated)
              </label>
              <Input
                placeholder="e.g. acme.com, partner.org (leave empty to allow all)"
                value={domainsInput}
                onChange={(e) => setDomainsInput(e.target.value)}
                disabled={!canManage || isSaving}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                If configured, new self-service tenant registrations will be restricted to these domains.
              </p>
            </div>

            {/* Maintenance Mode Toggle */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Maintenance Mode</span>
                  {maintenanceMode && (
                    <Badge variant="destructive" className="text-[10px]">Active</Badge>
                  )}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xl">
                  When enabled, non-system_admin users are alerted that scheduled maintenance is underway.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={(e) => setMaintenanceMode(e.target.checked)}
                  disabled={!canManage || isSaving}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>
          </CardContent>
        </Card>

        {canManage && (
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? "Saving Changes..." : "Save Platform Settings"}</span>
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
