"use client";

import * as React from "react";
import {
  Search,
  Eye,
  RotateCcw,
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

interface PlatformAuditLogItem {
  id: string;
  organization_id: string;
  organization_name?: string;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_name?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, any> | null;
  ip_address?: string | null;
  created_at: string;
}

interface PlatformAuditLogResponse {
  items: PlatformAuditLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

function getActionBadgeVariant(action: string): "default" | "secondary" | "success" | "warning" | "destructive" | "info" {
  const act = action.toLowerCase();
  if (act.includes("delete") || act.includes("suspend") || act.includes("terminate") || act.includes("reject")) {
    return "destructive";
  }
  if (act.includes("create") || act.includes("activate") || act.includes("restore") || act.includes("approve")) {
    return "success";
  }
  if (act.includes("update") || act.includes("edit") || act.includes("patch")) {
    return "warning";
  }
  return "secondary";
}

export default function SaaSAdminAuditLogsPage() {
  const { membership, permissions, isLoading: isOrgLoading } = useOrganization();
  const isSysAdmin = membership?.role === "system_admin" || permissions.includes("saas.view");

  const [logs, setLogs] = React.useState<PlatformAuditLogItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("");
  const [entityFilter, setEntityFilter] = React.useState("");
  const [orgFilter, setOrgFilter] = React.useState("");

  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Detail Modal
  const [selectedLog, setSelectedLog] = React.useState<PlatformAuditLogItem | null>(null);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchLogs = React.useCallback(async () => {
    if (!isSysAdmin) return;
    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string> = {
        page: String(page),
        page_size: String(pageSize),
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (actionFilter.trim()) params.action = actionFilter.trim();
      if (entityFilter.trim()) params.entity_type = entityFilter.trim();
      if (orgFilter.trim()) params.organization_id = orgFilter.trim();

      const query = new URLSearchParams(params).toString();
      const res = await apiClient.get<PlatformAuditLogResponse>(
        `${API_ENDPOINTS.admin.auditLogs}?${query}`
      );
      const data = (res as any)?.data || res;
      setLogs(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err: any) {
      setError(err?.message || "Failed to load platform audit logs");
    } finally {
      setIsLoading(false);
    }
  }, [isSysAdmin, page, pageSize, debouncedSearch, actionFilter, entityFilter, orgFilter]);

  React.useEffect(() => {
    if (!isOrgLoading && isSysAdmin) {
      fetchLogs();
    } else if (!isOrgLoading && !isSysAdmin) {
      setIsLoading(false);
    }
  }, [isOrgLoading, isSysAdmin, fetchLogs]);

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
        title="Cross-Tenant Platform Audit"
        description="Immutable platform-wide audit log trail. Inspect cross-tenant security events, lifecycle updates, and administrative actions."
        badgeText={`Records: ${total}`}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={isLoading}
          className="flex items-center gap-1.5"
        >
          <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </AdminHeader>

      {/* Filter and Search Bar */}
      <Card className="border-slate-200/80 dark:border-slate-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search action or entity..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>
            <div>
              <Input
                placeholder="Filter by Action (e.g. suspend)..."
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs"
              />
            </div>
            <div>
              <Input
                placeholder="Filter by Entity Type..."
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs"
              />
            </div>
            <div>
              <Input
                placeholder="Filter by Org UUID..."
                value={orgFilter}
                onChange={(e) => {
                  setOrgFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card className="border-slate-200/80 dark:border-slate-800 overflow-hidden">
        {isLoading && logs.length === 0 ? (
          <div className="py-16">
            <LoadingState message="Querying cross-tenant audit event log..." />
          </div>
        ) : error && logs.length === 0 ? (
          <div className="py-12">
            <ErrorState title="Failed to load platform audit trail" message={error} onRetry={fetchLogs} />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16">
            <EmptyState
              title="No Audit Records Found"
              description="No platform audit entries match your specified filter criteria."
              actionLabel="Clear Filters"
              onAction={() => {
                setSearchQuery("");
                setActionFilter("");
                setEntityFilter("");
                setOrgFilter("");
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Timestamp</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Tenant Org</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actor</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Entity Type</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-800 dark:text-slate-200">
                      {log.organization_name || log.organization_id.substring(0, 8) + "..."}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {log.actor_name || log.actor_email || (log.actor_id ? log.actor_id.substring(0, 8) + "..." : "System")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getActionBadgeVariant(log.action)} className="text-[11px] font-mono">
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                      {log.entity_type}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        <span>Inspect</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-xs">
            <span className="text-slate-500">
              Showing page {page} of {totalPages} ({total} events)
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

      {/* Details Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title={`Audit Event: ${selectedLog.action} (${selectedLog.entity_type})`}
        >
          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="font-semibold text-slate-500 block">Event ID</span>
                <span className="font-mono text-slate-900 dark:text-slate-100">{selectedLog.id}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 block">Organization ID</span>
                <span className="font-mono text-slate-900 dark:text-slate-100">{selectedLog.organization_id}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 block">Actor</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {selectedLog.actor_name || selectedLog.actor_email || selectedLog.actor_id || "System"}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-500 block">Timestamp</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {new Date(selectedLog.created_at).toLocaleString()}
                </span>
              </div>
              {selectedLog.ip_address && (
                <div>
                  <span className="font-semibold text-slate-500 block">Client IP</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">{selectedLog.ip_address}</span>
                </div>
              )}
            </div>

            <div>
              <span className="font-semibold text-slate-500 block mb-1.5">Sanitized Payload</span>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-[11px] font-mono leading-relaxed max-h-64">
                {JSON.stringify(selectedLog.details ?? {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
