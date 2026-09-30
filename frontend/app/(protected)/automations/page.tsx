"use client";

import * as React from "react";
import {
  Workflow,
  Plus,
  Play,
  History,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Loader2,
  Zap,
  Activity,
  Bell,
  FileCheck,
  CheckSquare,
  Clock,
  X,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  Automation,
  AutomationCreate,
  AutomationExecution,
} from "@/types/automation";

export default function AutomationsPage() {
  const { currentOrganization, permissions } = useOrganization();

  const canView = permissions.includes("automations.view") || permissions.includes("automations.manage");
  const canCreate = permissions.includes("automations.create") || permissions.includes("automations.manage");
  const canUpdate = permissions.includes("automations.update") || permissions.includes("automations.manage");
  const canExecute = permissions.includes("automations.execute") || permissions.includes("automations.manage");
  const canDelete = permissions.includes("automations.delete") || permissions.includes("automations.manage");

  const [automations, setAutomations] = React.useState<Automation[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [statusMessage, setStatusMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [newTriggerType, setNewTriggerType] = React.useState<"event" | "schedule" | "manual">("event");
  const [newActionType, setNewActionType] = React.useState<"notification" | "audit_log" | "task_create">("notification");
  const [newActionTitle, setNewActionTitle] = React.useState("");
  const [newActionMessage, setNewActionMessage] = React.useState("");

  // Execution History Modal State
  const [historyAutomation, setHistoryAutomation] = React.useState<Automation | null>(null);
  const [executions, setExecutions] = React.useState<AutomationExecution[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);

  // Execution In-Progress State
  const [executingId, setExecutingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!currentOrganization || !canView) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadAutomations() {
      setIsLoading(true);
      try {
        const res = await apiClient.get<Automation[]>(API_ENDPOINTS.automations.list);
        if (!isMounted) return;
        if (res) {
          setAutomations(res);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load automations";
        setStatusMessage({ type: "error", text: msg });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadAutomations();

    return () => {
      isMounted = false;
    };
  }, [currentOrganization, canView]);

  async function handleToggle(id: string, currentStatus: boolean) {
    if (!canUpdate) return;
    try {
      const res = await apiClient.post<Automation>(API_ENDPOINTS.automations.toggle(id), {
        is_active: !currentStatus,
      });
      if (res) {
        setAutomations((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_active: !currentStatus } : a))
        );
        setStatusMessage({
          type: "success",
          text: `Automation ${!currentStatus ? "enabled" : "disabled"} successfully.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle automation";
      setStatusMessage({ type: "error", text: msg });
    }
  }

  async function handleExecute(id: string) {
    if (!canExecute || executingId) return;
    setExecutingId(id);
    setStatusMessage(null);
    try {
      const res = await apiClient.post<AutomationExecution>(API_ENDPOINTS.automations.execute(id), {
        input_payload: { manual_trigger: true },
      });
      if (res) {
        const exec = res;
        setStatusMessage({
          type: exec.status === "success" ? "success" : "error",
          text: `Execution ${exec.status}: ${exec.result_summary || exec.error_message || "Finished"} (${exec.duration_ms}ms)`,
        });
        // Refresh last run
        setAutomations((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  last_run_at: exec.created_at,
                  last_run_status: exec.status,
                  run_count: a.run_count + 1,
                }
              : a
          )
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute automation";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setExecutingId(null);
    }
  }

  async function handleOpenHistory(auto: Automation) {
    setHistoryAutomation(auto);
    setIsLoadingHistory(true);
    try {
      const res = await apiClient.get<AutomationExecution[]>(API_ENDPOINTS.automations.executions(auto.id));
      if (res) {
        setExecutions(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load execution history";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function handleDelete(id: string) {
    if (!canDelete) return;
    if (!confirm("Are you sure you want to delete this automation rule?")) return;
    try {
      await apiClient.delete(API_ENDPOINTS.automations.delete(id));
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      setStatusMessage({ type: "success", text: "Automation deleted successfully." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete automation";
      setStatusMessage({ type: "error", text: msg });
    }
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate || isSubmitting) return;

    if (!newName.trim()) {
      setStatusMessage({ type: "error", text: "Rule name is required." });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const payload: AutomationCreate = {
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      trigger_type: newTriggerType,
      trigger_config:
        newTriggerType === "event"
          ? { event_name: "custom.trigger" }
          : newTriggerType === "schedule"
          ? { interval: "daily" }
          : {},
      action_type: newActionType,
      action_config: {
        title: newActionTitle.trim() || `Auto: ${newName.trim()}`,
        message: newActionMessage.trim() || "Automated trigger execution.",
      },
      is_active: true,
    };

    try {
      const res = await apiClient.post<Automation>(API_ENDPOINTS.automations.create, payload);
      if (res) {
        setAutomations((prev) => [res, ...prev]);
        setIsCreateOpen(false);
        setNewName("");
        setNewDesc("");
        setNewActionTitle("");
        setNewActionMessage("");
        setStatusMessage({ type: "success", text: "Automation workflow created successfully." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create automation";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-4xl py-12 px-4 sm:px-6">
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="pt-6 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 text-rose-600 mx-auto" />
            <h2 className="text-lg font-bold text-rose-900">Access Restricted</h2>
            <p className="text-sm text-rose-700 max-w-md mx-auto">
              You do not have permission to view or manage organizational automation workflows.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeCount = automations.filter((a) => a.is_active).length;
  const totalRuns = automations.reduce((acc, a) => acc + (a.run_count || 0), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Automation Workflows</h1>
            <p className="text-xs text-slate-500">
              Safe tenant-scoped event triggers, operational tasks, and automated notifications
            </p>
          </div>
        </div>

        {canCreate && (
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>Create Automation</span>
          </Button>
        )}
      </div>

      {statusMessage && (
        <div
          className={`rounded-lg p-3 text-xs flex items-center gap-2 border ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Workflows</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{automations.length}</div>
            <div className="text-xs text-slate-500 mt-1">{activeCount} currently active</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Triggers</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</div>
            <div className="text-xs text-slate-500 mt-1">Ready to fire</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Executions</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{totalRuns}</div>
            <div className="text-xs text-slate-500 mt-1">Workflow runs completed</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Security Boundary</div>
            <div className="text-sm font-bold text-slate-800 mt-1.5 flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-amber-500" />
              <span>Safe Primitives Only</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">Sandboxed execution</div>
          </CardContent>
        </Card>
      </div>

      {/* Automations List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Configured Automations</CardTitle>
          <CardDescription>Rules and actions executed within your organization context</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-xs text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading automations...
            </div>
          ) : automations.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No automation workflows created yet. Click &quot;Create Automation&quot; to set up your first rule.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {automations.map((a) => {
                const isRunning = executingId === a.id;
                return (
                  <div key={a.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-slate-900">{a.name}</span>
                        <Badge
                          variant={a.is_active ? "success" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {a.is_active ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      {a.description && <p className="text-xs text-slate-500">{a.description}</p>}
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3 text-slate-400" />
                          Trigger: <strong className="text-slate-600 uppercase">{a.trigger_type}</strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          {a.action_type === "notification" ? (
                            <Bell className="h-3 w-3 text-blue-500" />
                          ) : a.action_type === "audit_log" ? (
                            <FileCheck className="h-3 w-3 text-purple-500" />
                          ) : (
                            <CheckSquare className="h-3 w-3 text-emerald-500" />
                          )}
                          Action: <strong className="text-slate-600">{a.action_type}</strong>
                        </span>
                        <span>•</span>
                        <span>Total runs: {a.run_count}</span>
                        {a.last_run_at && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              Last: {new Date(a.last_run_at).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {canExecute && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExecute(a.id)}
                          disabled={isRunning}
                          className="flex items-center gap-1.5 text-xs"
                          title="Trigger manual run"
                        >
                          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 text-emerald-600" />}
                          <span>Run</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenHistory(a)}
                        className="flex items-center gap-1.5 text-xs text-slate-600"
                        title="View execution logs"
                      >
                        <History className="h-3.5 w-3.5 text-slate-500" />
                        <span>Logs</span>
                      </Button>

                      {canUpdate && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggle(a.id, a.is_active)}
                          className="text-xs text-slate-600 hover:text-slate-900"
                        >
                          {a.is_active ? "Disable" : "Enable"}
                        </Button>
                      )}

                      {canDelete && (
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition-colors"
                          title="Delete automation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CREATE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center space-x-2">
                <Workflow className="h-5 w-5 text-primary-600" />
                <h3 className="text-sm font-bold text-slate-900">Create Automation Workflow</h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Workflow Name *</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Notify on Leave Approval"
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <Input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. Dispatches an alert when leave is approved"
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Trigger Mechanism</label>
                  <select
                    value={newTriggerType}
                    onChange={(e) => setNewTriggerType(e.target.value as "event" | "schedule" | "manual")}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800"
                  >
                    <option value="event">Event-Triggered</option>
                    <option value="schedule">Scheduled Recurring</option>
                    <option value="manual">Manual Execution</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Action Type</label>
                  <select
                    value={newActionType}
                    onChange={(e) => setNewActionType(e.target.value as "notification" | "audit_log" | "task_create")}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800"
                  >
                    <option value="notification">In-App Notification</option>
                    <option value="audit_log">Audit Trail Entry</option>
                    <option value="task_create">Create Operational Task</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <label className="text-xs font-semibold text-slate-700">Action Title / Header</label>
                <Input
                  value={newActionTitle}
                  onChange={(e) => setNewActionTitle(e.target.value)}
                  placeholder="e.g. Leave Approval Notice"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Action Message / Details</label>
                <Input
                  value={newActionMessage}
                  onChange={(e) => setNewActionMessage(e.target.value)}
                  placeholder="e.g. Your leave request has been reviewed and approved."
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1.5"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span>Create Workflow</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXECUTION HISTORY MODAL */}
      {historyAutomation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full overflow-hidden max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center space-x-2">
                <History className="h-5 w-5 text-slate-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Execution History</h3>
                  <p className="text-xs text-slate-500">{historyAutomation.name}</p>
                </div>
              </div>
              <button
                onClick={() => setHistoryAutomation(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-12 text-xs text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading execution logs...
                </div>
              ) : executions.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">No execution records found for this workflow</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                      <tr>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Trigger</th>
                        <th className="p-2.5">Duration</th>
                        <th className="p-2.5">Summary</th>
                        <th className="p-2.5 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {executions.map((e) => (
                        <tr key={e.id}>
                          <td className="p-2.5">
                            <Badge
                              variant={e.status === "success" ? "success" : "destructive"}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {e.status}
                            </Badge>
                          </td>
                          <td className="p-2.5 uppercase font-medium">{e.trigger_source}</td>
                          <td className="p-2.5">{e.duration_ms}ms</td>
                          <td className="p-2.5 max-w-xs truncate text-slate-600">
                            {e.result_summary || e.error_message || "Executed"}
                          </td>
                          <td className="p-2.5 text-right text-slate-400">
                            {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setHistoryAutomation(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
