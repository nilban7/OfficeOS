"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Slash,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { AdminHeader } from "@/components/admin/admin-header";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { OrganizationDirectoryItem, OrganizationDirectoryResponse } from "@/types/saas";

export default function SaaSAdminOrganizationsPage() {
  const { membership, permissions, isLoading: isOrgLoading } = useOrganization();

  const isSysAdmin = membership?.role === "system_admin" || permissions.includes("saas.view");
  const canManage = membership?.role === "system_admin" || permissions.includes("saas.manage");

  const [organizations, setOrganizations] = React.useState<OrganizationDirectoryItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(15);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Modal Lifecycle States
  const [actionTarget, setActionTarget] = React.useState<OrganizationDirectoryItem | null>(null);
  const [actionType, setActionType] = React.useState<"suspend" | "activate" | "restore" | null>(null);
  const [suspensionReason, setSuspensionReason] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Debounce search
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchOrganizations = React.useCallback(async () => {
    if (!isSysAdmin) return;
    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string> = {
        page: String(page),
        page_size: String(pageSize),
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter !== "all") params.status = statusFilter;

      const query = new URLSearchParams(params).toString();
      const res = await apiClient.get<OrganizationDirectoryResponse>(
        `${API_ENDPOINTS.admin.organizations}?${query}`
      );
      const data = (res as any)?.data || res;
      setOrganizations(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err: any) {
      setError(err?.message || "Failed to load organization directory");
    } finally {
      setIsLoading(false);
    }
  }, [isSysAdmin, page, pageSize, debouncedSearch, statusFilter]);

  React.useEffect(() => {
    if (!isOrgLoading && isSysAdmin) {
      fetchOrganizations();
    } else if (!isOrgLoading && !isSysAdmin) {
      setIsLoading(false);
    }
  }, [isOrgLoading, isSysAdmin, fetchOrganizations]);

  // Handle Lifecycle Action
  const handleLifecycleSubmit = async () => {
    if (!actionTarget || !actionType) return;
    setActionLoading(true);
    setActionError(null);

    try {
      if (actionType === "suspend") {
        await apiClient.post(API_ENDPOINTS.admin.suspendOrganization(actionTarget.id), {
          reason: suspensionReason.trim() || undefined,
        });
      } else if (actionType === "activate") {
        await apiClient.post(API_ENDPOINTS.admin.activateOrganization(actionTarget.id), {});
      } else if (actionType === "restore") {
        await apiClient.post(API_ENDPOINTS.admin.restoreOrganization(actionTarget.id), {});
      }

      // Close modal and refresh
      setActionTarget(null);
      setActionType(null);
      setSuspensionReason("");
      fetchOrganizations();
    } catch (err: any) {
      setActionError(err?.message || `Failed to execute ${actionType} action.`);
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

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Organization Directory"
        description="Comprehensive multi-tenant directory. Manage tenant lifecycle, suspensions, and operational status."
        badgeText={`Total: ${total}`}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchOrganizations}
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </AdminHeader>

      {/* Filter and Search Bar */}
      <Card className="border-slate-200/80 dark:border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by organization name or slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white dark:bg-slate-900"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Filter className="h-3.5 w-3.5" />
                <span>Status:</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
                {["all", "active", "suspended"].map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setStatusFilter(status);
                      setPage(1);
                    }}
                    className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                      statusFilter === status
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organizations Directory Table */}
      <Card className="border-slate-200/80 dark:border-slate-800 overflow-hidden">
        {isLoading && organizations.length === 0 ? (
          <div className="py-16">
            <LoadingState message="Loading tenant organizations..." />
          </div>
        ) : error && organizations.length === 0 ? (
          <div className="py-12">
            <ErrorState title="Failed to load organizations" message={error} onRetry={fetchOrganizations} />
          </div>
        ) : organizations.length === 0 ? (
          <div className="py-16">
            <EmptyState
              title="No Organizations Found"
              description="No organizations match your current search and filter criteria."
              actionLabel="Clear Filters"
              onAction={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Organization</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Branches</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Members</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Employees</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold">Created</th>
                  <th scope="col" className="px-4 py-3.5 font-semibold text-right">Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {organizations.map((org) => {
                  const isSuspended = org.status === "suspended";
                  return (
                    <tr
                      key={org.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/admin/organizations/${org.id}`}
                          className="font-medium text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 flex flex-col"
                        >
                          <span className="text-sm">{org.name}</span>
                          <span className="text-xs font-mono text-slate-400 font-normal">{org.slug}</span>
                        </Link>
                        {isSuspended && org.suspension_reason && (
                          <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{org.suspension_reason}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant={isSuspended ? "destructive" : "success"}
                          className="text-[11px] capitalize"
                        >
                          {org.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs">{org.branch_count}</td>
                      <td className="px-4 py-3.5 font-mono text-xs">{org.member_count}</td>
                      <td className="px-4 py-3.5 font-mono text-xs">{org.employee_count}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {new Date(org.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        <Link href={`/admin/organizations/${org.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs">
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            <span>Inspect</span>
                          </Button>
                        </Link>

                        {canManage && (
                          <>
                            {isSuspended ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                onClick={() => {
                                  setActionTarget(org);
                                  setActionType("restore");
                                  setActionError(null);
                                }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                <span>Restore</span>
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                onClick={() => {
                                  setActionTarget(org);
                                  setActionType("suspend");
                                  setSuspensionReason("");
                                  setActionError(null);
                                }}
                              >
                                <Slash className="h-3.5 w-3.5 mr-1" />
                                <span>Suspend</span>
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-xs">
            <span className="text-slate-500">
              Showing page {page} of {totalPages} ({total} organizations)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Lifecycle Action Confirmation Modal */}
      {actionTarget && actionType && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (!actionLoading) {
              setActionTarget(null);
              setActionType(null);
              setSuspensionReason("");
              setActionError(null);
            }
          }}
          title={
            actionType === "suspend"
              ? `Suspend Organization: ${actionTarget.name}`
              : actionType === "restore"
              ? `Restore Organization: ${actionTarget.name}`
              : `Activate Organization: ${actionTarget.name}`
          }
        >
          <div className="space-y-4 py-2">
            {actionError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {actionType === "suspend" ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Suspending <span className="font-semibold text-slate-900 dark:text-white">{actionTarget.name}</span> will
                  immediately prevent normal organization users from performing authenticated tenant requests.
                  All organization data remains strictly preserved and intact.
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Suspension Reason (Logged in Platform Audit)
                  </label>
                  <Input
                    placeholder="e.g. Delinquent account, billing inquiry, compliance review..."
                    value={suspensionReason}
                    onChange={(e) => setSuspensionReason(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Restoring <span className="font-semibold text-slate-900 dark:text-white">{actionTarget.name}</span> will
                re-enable full authenticated access for all active organization members.
              </p>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                disabled={actionLoading}
                onClick={() => {
                  setActionTarget(null);
                  setActionType(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={actionType === "suspend" ? "destructive" : "primary"}
                size="sm"
                disabled={actionLoading}
                onClick={handleLifecycleSubmit}
              >
                {actionLoading
                  ? "Processing..."
                  : actionType === "suspend"
                  ? "Confirm Suspension"
                  : "Confirm Restore"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
