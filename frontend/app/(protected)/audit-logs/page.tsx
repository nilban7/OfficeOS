"use client";

import * as React from "react";
import {
  ShieldCheck,
  Search,
  Filter,
  Eye,
  Calendar,
  User,
  Clock,
  Globe,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { AuditLog } from "@/types/audit";

function getActionBadgeVariant(action: string): "default" | "secondary" | "success" | "warning" | "destructive" | "info" {
  const act = action.toLowerCase();
  if (act.includes("delete") || act.includes("remove") || act.includes("reject") || act.includes("cancel") || act.includes("terminate")) {
    return "destructive";
  }
  if (act.includes("create") || act.includes("add") || act.includes("enroll") || act.includes("approve") || act.includes("start")) {
    return "success";
  }
  if (act.includes("update") || act.includes("edit") || act.includes("assign") || act.includes("status")) {
    return "warning";
  }
  if (act.includes("view") || act.includes("download") || act.includes("get")) {
    return "info";
  }
  return "secondary";
}

function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export default function AuditLogsPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canView = permissions.includes("audit_logs.view") || permissions.includes("audit:read");

  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pagination & Filtering
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("");
  const [entityFilter, setEntityFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  // Detail Modal
  const [selectedLog, setSelectedLog] = React.useState<AuditLog | null>(null);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchAuditLogs = React.useCallback(async () => {
    if (!currentOrganization?.id || !canView) return;
    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string> = {
        page: String(currentPage),
        page_size: "20",
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (actionFilter.trim()) params.action = actionFilter.trim();
      if (entityFilter.trim()) params.entity_type = entityFilter.trim();
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) params.date_to = new Date(dateTo).toISOString();

      const query = new URLSearchParams(params).toString();
      const res = await apiClient.get<any>(`${API_ENDPOINTS.auditLogs.list}?${query}`);
      const data = (res as any)?.data || res;
      setLogs(data?.items || []);
      setTotalPages(data?.meta?.total_pages || 1);
      setTotalItems(data?.meta?.total || 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load audit logs.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, canView, currentPage, debouncedSearch, actionFilter, entityFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    if (canView) {
      fetchAuditLogs();
    }
  }, [fetchAuditLogs, canView]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setActionFilter("");
    setEntityFilter("");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  // If Organization is loading
  if (isOrgLoading) {
    return <LoadingState message="Checking security authorization..." />;
  }

  // Access Denied / 403 Gate
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/40 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="mt-1 max-w-md text-sm text-slate-600">
          You do not have permission to view organization audit logs. This area is strictly reserved for authorized administrators.
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
            <ShieldCheck className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit Logs</h1>
            <Badge variant="outline" className="text-xs font-semibold">
              Immutable
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Cryptographically and tenant-isolated security trail of organizational events and state changes.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAuditLogs()}
          disabled={isLoading}
          className="flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search action, entity, actor..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 pl-8 text-xs"
              />
            </div>

            {/* Action filter */}
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Filter by action (e.g. create)..."
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 pl-8 text-xs"
              />
            </div>

            {/* Entity filter */}
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Filter entity (e.g. document)..."
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 pl-8 text-xs"
              />
            </div>

            {/* Date Range Start */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="date"
                  aria-label="From date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 pl-8 text-xs"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-9 px-2 text-xs text-slate-500 hover:text-slate-900"
                title="Reset filters"
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Area */}
      {isLoading ? (
        <LoadingState message="Loading immutable audit logs..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchAuditLogs} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No audit logs found"
          description="No activity records match your current filter parameters."
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {logs.map((log) => {
                  const actorName = log.actor
                    ? `${log.actor.first_name || ""} ${log.actor.last_name || ""}`.trim() || log.actor.email
                    : log.actor_email || "System";

                  return (
                    <tr key={log.id} className="transition-colors hover:bg-slate-50/50">
                      {/* Timestamp */}
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>{formatDateTime(log.created_at)}</span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{actorName}</p>
                            {log.actor?.email && log.actor?.email !== actorName && (
                              <p className="text-[10px] text-slate-400">{log.actor.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        <Badge
                          variant={getActionBadgeVariant(log.action)}
                          className="font-mono text-[11px]"
                        >
                          {log.action}
                        </Badge>
                      </td>

                      {/* Entity */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900 capitalize">
                            {log.entity_type}
                          </span>
                          {log.entity_id && (
                            <span className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]">
                              {log.entity_id}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* IP Address */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Globe className="h-3.5 w-3.5 text-slate-400" />
                          <span>{log.ip_address || "Internal / System"}</span>
                        </div>
                      </td>

                      {/* Inspect Action */}
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                          className="h-8 gap-1 text-xs text-primary-700 hover:text-primary-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Inspect</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500">
              <span>
                Showing page {currentPage} of {totalPages} ({totalItems} records)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="h-8 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="h-8 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inspect Detail Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Log Record"
        description="Immutable record details verified under Row Level Security."
      >
        {selectedLog && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Event ID</span>
                <span className="font-mono text-slate-900 break-all">{selectedLog.id}</span>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Recorded At</span>
                <span className="text-slate-900">{formatDateTime(selectedLog.created_at)}</span>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Actor</span>
                <span className="text-slate-900">
                  {selectedLog.actor?.email || selectedLog.actor_email || "System"}
                </span>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">IP Address</span>
                <span className="text-slate-900">{selectedLog.ip_address || "None"}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-600 block text-xs font-semibold mb-1">
                Metadata & State Changes:
              </span>
              <pre className="max-h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
                {JSON.stringify(selectedLog.details || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
