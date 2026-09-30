"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Building2,
  Users,
  Briefcase,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Slash,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { AdminHeader } from "@/components/admin/admin-header";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { OrganizationDetailResponse } from "@/types/saas";

export default function SaaSAdminOrganizationDetailPage() {
  const params = useParams();
  const orgId = params?.id as string;

  const { membership, permissions, isLoading: isOrgLoading } = useOrganization();
  const isSysAdmin = membership?.role === "system_admin" || permissions.includes("saas.view");
  const canManage = membership?.role === "system_admin" || permissions.includes("saas.manage");

  const [org, setOrg] = React.useState<OrganizationDetailResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Lifecycle Modal States
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [actionType, setActionType] = React.useState<"suspend" | "restore" | null>(null);
  const [suspensionReason, setSuspensionReason] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const fetchDetail = React.useCallback(async () => {
    if (!isSysAdmin || !orgId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<OrganizationDetailResponse>(
        API_ENDPOINTS.admin.organizationDetail(orgId)
      );
      const data = (res as any)?.data || res;
      setOrg(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load organization details");
    } finally {
      setIsLoading(false);
    }
  }, [isSysAdmin, orgId]);

  React.useEffect(() => {
    if (!isOrgLoading && isSysAdmin) {
      fetchDetail();
    } else if (!isOrgLoading && !isSysAdmin) {
      setIsLoading(false);
    }
  }, [isOrgLoading, isSysAdmin, fetchDetail]);

  const handleLifecycleAction = async () => {
    if (!org || !actionType) return;
    setActionLoading(true);
    setActionError(null);

    try {
      if (actionType === "suspend") {
        await apiClient.post(API_ENDPOINTS.admin.suspendOrganization(org.id), {
          reason: suspensionReason.trim() || undefined,
        });
      } else {
        await apiClient.post(API_ENDPOINTS.admin.restoreOrganization(org.id), {});
      }

      setIsModalOpen(false);
      setActionType(null);
      setSuspensionReason("");
      fetchDetail();
    } catch (err: any) {
      setActionError(err?.message || `Failed to ${actionType} organization`);
    } finally {
      setActionLoading(false);
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

  if (isLoading && !org) {
    return <LoadingState message="Loading tenant profile telemetry..." />;
  }

  if (error && !org) {
    return (
      <div className="py-12">
        <ErrorState
          title="Failed to Load Organization"
          message={error}
          onRetry={fetchDetail}
        />
      </div>
    );
  }

  if (!org) return null;

  const isSuspended = org.status === "suspended";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Link
          href="/admin/organizations"
          className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 font-medium transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Organizations</span>
        </Link>
      </div>

      <AdminHeader
        title={org.name}
        description={`Tenant ID: ${org.id} • Slug: ${org.slug}`}
        badgeText={`Status: ${org.status}`}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDetail}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          {canManage && (
            <>
              {isSuspended ? (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                  onClick={() => {
                    setActionType("restore");
                    setIsModalOpen(true);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Restore Tenant</span>
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => {
                    setActionType("suspend");
                    setSuspensionReason("");
                    setIsModalOpen(true);
                  }}
                >
                  <Slash className="h-4 w-4" />
                  <span>Suspend Tenant</span>
                </Button>
              )}
            </>
          )}
        </div>
      </AdminHeader>

      {/* Suspension Banner if Suspended */}
      {isSuspended && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              This organization is currently suspended
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Normal organization members cannot execute authenticated operations.
              {org.suspension_reason && ` Reason: "${org.suspension_reason}".`}
              {org.suspended_at && ` (Suspended on ${new Date(org.suspended_at).toLocaleString()})`}
            </p>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Branches</CardTitle>
            <Building2 className="h-4 w-4 text-primary-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {org.branch_count}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Members</CardTitle>
            <Users className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {org.member_count}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Employees</CardTitle>
            <Briefcase className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {org.employee_count}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-slate-500">Projects</CardTitle>
            <Layers className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {org.project_count}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Metadata Card */}
      <Card className="border-slate-200/80 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
            Tenant Profile & Configuration
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Core properties resolved from database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-500">Organization ID</dt>
              <dd className="mt-1 font-mono text-xs text-slate-900 dark:text-slate-100">{org.id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Organization Slug</dt>
              <dd className="mt-1 font-mono text-xs text-slate-900 dark:text-slate-100">{org.slug}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Timezone</dt>
              <dd className="mt-1 text-slate-900 dark:text-slate-100">{org.timezone}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Currency</dt>
              <dd className="mt-1 text-slate-900 dark:text-slate-100">{org.currency}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Created At</dt>
              <dd className="mt-1 text-slate-900 dark:text-slate-100">
                {new Date(org.created_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Last Updated</dt>
              <dd className="mt-1 text-slate-900 dark:text-slate-100">
                {new Date(org.updated_at).toLocaleString()}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Lifecycle Action Modal */}
      {isModalOpen && actionType && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (!actionLoading) {
              setIsModalOpen(false);
              setActionType(null);
            }
          }}
          title={actionType === "suspend" ? `Suspend ${org.name}` : `Restore ${org.name}`}
        >
          <div className="space-y-4 py-2">
            {actionError && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs">
                {actionError}
              </div>
            )}

            {actionType === "suspend" ? (
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  Are you sure you want to suspend <strong className="text-slate-900 dark:text-white">{org.name}</strong>?
                  All tenant users will be blocked from accessing organization APIs until restored.
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Reason
                  </label>
                  <Input
                    placeholder="Enter reason for audit record..."
                    value={suspensionReason}
                    onChange={(e) => setSuspensionReason(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Restore full service access for <strong className="text-slate-900 dark:text-white">{org.name}</strong> and all its members?
              </p>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                disabled={actionLoading}
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant={actionType === "suspend" ? "destructive" : "primary"}
                size="sm"
                disabled={actionLoading}
                onClick={handleLifecycleAction}
              >
                {actionLoading ? "Processing..." : actionType === "suspend" ? "Confirm Suspend" : "Confirm Restore"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
