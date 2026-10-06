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
  Pencil,
  ArrowRight,
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
  AutomationUpdate,
  AutomationExecution,
} from "@/types/automation";

const PRESET_EVENT_ROUTES = [
  {
    id: "leave.approved",
    label: "Leave Request Approved (Acceptance)",
    defaultRoute: "/leave",
    defaultTitle: "Leave Approved",
    defaultMsg: "Your leave request has been reviewed and approved.",
    defaultCategory: "leave",
  },
  {
    id: "leave.requested",
    label: "Leave Request Submitted",
    defaultRoute: "/leave",
    defaultTitle: "New Leave Application",
    defaultMsg: "A new leave request requires review.",
    defaultCategory: "leave",
  },
  {
    id: "leave.rejected",
    label: "Leave Request Rejected",
    defaultRoute: "/leave",
    defaultTitle: "Leave Request Notice",
    defaultMsg: "Your leave request was not approved.",
    defaultCategory: "leave",
  },
  {
    id: "attendance.check_in",
    label: "Employee Attendance Check-In",
    defaultRoute: "/attendance",
    defaultTitle: "Attendance Checked-In",
    defaultMsg: "Daily attendance verified successfully.",
    defaultCategory: "attendance",
  },
  {
    id: "expense.approved",
    label: "Expense Claim Approved",
    defaultRoute: "/finance",
    defaultTitle: "Expense Approved",
    defaultMsg: "Your submitted expense claim has been approved.",
    defaultCategory: "finance",
  },
  {
    id: "task.created",
    label: "Operational Task Created",
    defaultRoute: "/operations",
    defaultTitle: "Operational Task Assigned",
    defaultMsg: "A new operational task was assigned to you.",
    defaultCategory: "task",
  },
  {
    id: "custom",
    label: "Custom Trigger Event Route...",
    defaultRoute: "/dashboard",
    defaultTitle: "Workflow Notification",
    defaultMsg: "Automated trigger execution completed.",
    defaultCategory: "general",
  },
];

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
  const [newEventRoute, setNewEventRoute] = React.useState("leave.approved");
  const [newCustomEvent, setNewCustomEvent] = React.useState("");
  const [newScheduleInterval, setNewScheduleInterval] = React.useState("daily");
  const [newActionType, setNewActionType] = React.useState<"notification" | "audit_log" | "task_create">("notification");
  const [newActionTitle, setNewActionTitle] = React.useState("");
  const [newActionMessage, setNewActionMessage] = React.useState("");
  const [newActionRoute, setNewActionRoute] = React.useState("/leave");
  const [newRecipientTarget, setNewRecipientTarget] = React.useState<"requester" | "actor" | "creator">("requester");

  // Edit Modal State
  const [editAutomation, setEditAutomation] = React.useState<Automation | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editDesc, setEditDesc] = React.useState("");
  const [editTriggerType, setEditTriggerType] = React.useState<"event" | "schedule" | "manual">("event");
  const [editEventRoute, setEditEventRoute] = React.useState("leave.approved");
  const [editCustomEvent, setEditCustomEvent] = React.useState("");
  const [editScheduleInterval, setEditScheduleInterval] = React.useState("daily");
  const [editActionType, setEditActionType] = React.useState<"notification" | "audit_log" | "task_create">("notification");
  const [editActionTitle, setEditActionTitle] = React.useState("");
  const [editActionMessage, setEditActionMessage] = React.useState("");
  const [editActionRoute, setEditActionRoute] = React.useState("/leave");
  const [editRecipientTarget, setEditRecipientTarget] = React.useState<"requester" | "actor" | "creator">("requester");

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

  function handleEventRouteChange(routeId: string, isEdit: boolean = false) {
    const preset = PRESET_EVENT_ROUTES.find((p) => p.id === routeId);
    if (isEdit) {
      setEditEventRoute(routeId);
      if (preset && routeId !== "custom") {
        setEditActionRoute(preset.defaultRoute);
        if (!editActionTitle) setEditActionTitle(preset.defaultTitle);
        if (!editActionMessage) setEditActionMessage(preset.defaultMsg);
      }
    } else {
      setNewEventRoute(routeId);
      if (preset && routeId !== "custom") {
        setNewActionRoute(preset.defaultRoute);
        if (!newActionTitle) setNewActionTitle(preset.defaultTitle);
        if (!newActionMessage) setNewActionMessage(preset.defaultMsg);
      }
    }
  }

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

  function handleOpenEdit(auto: Automation) {
    setEditAutomation(auto);
    setEditName(auto.name);
    setEditDesc(auto.description || "");
    setEditTriggerType(auto.trigger_type);

    const cfg = auto.trigger_config || {};
    const ev = (cfg.event_name as string) || (cfg.event_route as string) || "";
    const matchedPreset = PRESET_EVENT_ROUTES.find((p) => p.id === ev);
    if (matchedPreset) {
      setEditEventRoute(matchedPreset.id);
      setEditCustomEvent("");
    } else if (ev) {
      setEditEventRoute("custom");
      setEditCustomEvent(ev);
    } else if (auto.name.toLowerCase().includes("leave")) {
      setEditEventRoute("leave.approved");
      setEditCustomEvent("");
    } else {
      setEditEventRoute("custom");
      setEditCustomEvent(ev || "custom.trigger");
    }

    setEditScheduleInterval((cfg.interval as string) || "daily");
    setEditActionType(auto.action_type);

    const act = auto.action_config || {};
    setEditActionTitle((act.title as string) || "");
    setEditActionMessage((act.message as string) || "");
    setEditActionRoute((act.route as string) || (act.action_url as string) || "/leave");
    setEditRecipientTarget((act.target_recipient as "requester" | "actor" | "creator") || "requester");
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

    const finalEventName =
      newTriggerType === "event"
        ? (newEventRoute === "custom" ? newCustomEvent.trim() || "custom.trigger" : newEventRoute)
        : undefined;

    const payload: AutomationCreate = {
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      trigger_type: newTriggerType,
      trigger_config:
        newTriggerType === "event"
          ? { event_name: finalEventName, event_route: finalEventName }
          : newTriggerType === "schedule"
          ? { interval: newScheduleInterval }
          : {},
      action_type: newActionType,
      action_config: {
        title: newActionTitle.trim() || `Auto: ${newName.trim()}`,
        message: newActionMessage.trim() || "Automated trigger execution.",
        route: newActionRoute.trim() || "/leave",
        action_url: newActionRoute.trim() || "/leave",
        target_recipient: newRecipientTarget,
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
        setNewActionRoute("/leave");
        setStatusMessage({ type: "success", text: "Automation workflow created successfully." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create automation";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canUpdate || !editAutomation || isEditSubmitting) return;

    if (!editName.trim()) {
      setStatusMessage({ type: "error", text: "Rule name is required." });
      return;
    }

    setIsEditSubmitting(true);
    setStatusMessage(null);

    const finalEventName =
      editTriggerType === "event"
        ? (editEventRoute === "custom" ? editCustomEvent.trim() || "custom.trigger" : editEventRoute)
        : undefined;

    const payload: AutomationUpdate = {
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      trigger_type: editTriggerType,
      trigger_config:
        editTriggerType === "event"
          ? { event_name: finalEventName, event_route: finalEventName }
          : editTriggerType === "schedule"
          ? { interval: editScheduleInterval }
          : {},
      action_type: editActionType,
      action_config: {
        title: editActionTitle.trim() || `Auto: ${editName.trim()}`,
        message: editActionMessage.trim() || "Automated trigger execution.",
        route: editActionRoute.trim() || "/leave",
        action_url: editActionRoute.trim() || "/leave",
        target_recipient: editRecipientTarget,
      },
    };

    try {
      const res = await apiClient.put<Automation>(
        API_ENDPOINTS.automations.update(editAutomation.id),
        payload
      );
      if (res) {
        setAutomations((prev) =>
          prev.map((a) => (a.id === editAutomation.id ? res : a))
        );
        setEditAutomation(null);
        setStatusMessage({ type: "success", text: "Automation workflow updated successfully." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update automation";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setIsEditSubmitting(false);
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
                const triggerEvent =
                  (a.trigger_config?.event_name as string) ||
                  (a.trigger_config?.event_route as string) ||
                  (a.name.toLowerCase().includes("leave") ? "leave.approved" : "custom.trigger");
                const actionRoute =
                  (a.action_config?.route as string) ||
                  (a.action_config?.action_url as string) ||
                  (a.action_type === "notification" && a.name.toLowerCase().includes("leave") ? "/leave" : null);

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
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                        <span className="flex items-center gap-1.5">
                          <Activity className="h-3 w-3 text-slate-400" />
                          <span>Trigger: <strong className="text-slate-600 uppercase">{a.trigger_type}</strong></span>
                          {a.trigger_type === "event" && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-primary-700 bg-primary-50/60 border-primary-200">
                              {triggerEvent}
                            </Badge>
                          )}
                          {a.trigger_type === "schedule" && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-slate-600 bg-slate-50">
                              {(a.trigger_config?.interval as string) || "daily"}
                            </Badge>
                          )}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          {a.action_type === "notification" ? (
                            <Bell className="h-3 w-3 text-blue-500" />
                          ) : a.action_type === "audit_log" ? (
                            <FileCheck className="h-3 w-3 text-purple-500" />
                          ) : (
                            <CheckSquare className="h-3 w-3 text-emerald-500" />
                          )}
                          <span>Action: <strong className="text-slate-600">{a.action_type}</strong></span>
                          {actionRoute && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-blue-700 bg-blue-50/60 border-blue-200 flex items-center gap-1">
                              <span>Route: {actionRoute}</span>
                              <ArrowRight className="h-2.5 w-2.5 opacity-60" />
                            </Badge>
                          )}
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
                          variant="outline"
                          onClick={() => handleOpenEdit(a)}
                          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                          title="Edit workflow configuration and routes"
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-500" />
                          <span>Edit</span>
                        </Button>
                      )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
            {/* Header (Fixed) */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/90">
              <div className="flex items-center space-x-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                  <Workflow className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create Automation Workflow</h3>
                  <p className="text-[11px] text-slate-500">Configure trigger events and automated actions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form id="create-automation-form" onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Trigger Mechanism</label>
                  <select
                    value={newTriggerType}
                    onChange={(e) => setNewTriggerType(e.target.value as "event" | "schedule" | "manual")}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm"
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
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm"
                  >
                    <option value="notification">In-App Notification</option>
                    <option value="audit_log">Audit Trail Entry</option>
                    <option value="task_create">Create Operational Task</option>
                  </select>
                </div>
              </div>

              {/* ROUTE & EVENT CONFIGURATION */}
              {newTriggerType === "event" && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Trigger Event Route *</span>
                      <span className="text-[10px] text-slate-500 font-normal">Identifies which system event fires this</span>
                    </label>
                    <select
                      value={newEventRoute}
                      onChange={(e) => handleEventRouteChange(e.target.value, false)}
                      className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 font-medium shadow-sm"
                    >
                      {PRESET_EVENT_ROUTES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {newEventRoute === "custom" && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Custom Event Identifier / Route *</label>
                      <Input
                        value={newCustomEvent}
                        onChange={(e) => setNewCustomEvent(e.target.value)}
                        placeholder="e.g. payroll.disbursed or custom.trigger"
                        className="text-xs"
                        required={newEventRoute === "custom"}
                      />
                    </div>
                  )}
                </div>
              )}

              {newTriggerType === "schedule" && (
                <div className="space-y-1 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-semibold text-slate-700">Recurring Schedule Interval</label>
                  <select
                    value={newScheduleInterval}
                    onChange={(e) => setNewScheduleInterval(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily (Default)</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              )}

              {/* ACTION DESTINATION ROUTE & RECIPIENT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Target Route (Link URL) *</span>
                  </label>
                  <Input
                    value={newActionRoute}
                    onChange={(e) => setNewActionRoute(e.target.value)}
                    placeholder="e.g. /leave, /attendance, /finance, /operations"
                    className="text-xs font-mono"
                    required
                  />
                  <p className="text-[10px] text-slate-400">
                    Destination opened on click (e.g. /leave).
                  </p>
                </div>

                {newActionType === "notification" && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Target Recipient</label>
                    <select
                      value={newRecipientTarget}
                      onChange={(e) => setNewRecipientTarget(e.target.value as "requester" | "actor" | "creator")}
                      className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm"
                    >
                      <option value="requester">Employee / Requester (Subject of event)</option>
                      <option value="actor">Acting Manager (Person triggering action)</option>
                      <option value="creator">Rule Creator (Admin)</option>
                    </select>
                    <p className="text-[10px] text-slate-400">
                      Who receives the notification alert.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-1">
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
            </form>

            {/* Footer (Fixed, Never Cropped) */}
            <div className="shrink-0 flex items-center justify-end space-x-3 px-6 py-3.5 border-t border-slate-100 bg-slate-50/90">
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
                form="create-automation-form"
                size="sm"
                disabled={isSubmitting}
                className="bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1.5"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span>Create Workflow</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editAutomation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
            {/* Header (Fixed) */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/90">
              <div className="flex items-center space-x-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                  <Pencil className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Edit Automation Workflow</h3>
                  <p className="text-[11px] text-slate-500">Modify triggers, routes, and actions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditAutomation(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form id="edit-automation-form" onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Workflow Name *</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <Input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Trigger Mechanism</label>
                  <select
                    value={editTriggerType}
                    onChange={(e) => setEditTriggerType(e.target.value as "event" | "schedule" | "manual")}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm"
                  >
                    <option value="event">Event-Triggered</option>
                    <option value="schedule">Scheduled Recurring</option>
                    <option value="manual">Manual Execution</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Action Type</label>
                  <select
                    value={editActionType}
                    onChange={(e) => setNewActionType(e.target.value as "notification" | "audit_log" | "task_create")}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm"
                  >
                    <option value="notification">In-App Notification</option>
                    <option value="audit_log">Audit Trail Entry</option>
                    <option value="task_create">Create Operational Task</option>
                  </select>
                </div>
              </div>

              {/* ROUTE & EVENT CONFIGURATION */}
              {editTriggerType === "event" && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Trigger Event Route *</span>
                      <span className="text-[10px] text-slate-500 font-normal">Identifies which system event fires this</span>
                    </label>
                    <select
                      value={editEventRoute}
                      onChange={(e) => handleEventRouteChange(e.target.value, true)}
                      className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 font-medium shadow-sm"
                    >
                      {PRESET_EVENT_ROUTES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editEventRoute === "custom" && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Custom Event Identifier / Route *</label>
                      <Input
                        value={editCustomEvent}
                        onChange={(e) => setEditCustomEvent(e.target.value)}
                        placeholder="e.g. leave.approved or custom.trigger"
                        className="text-xs"
                        required={editEventRoute === "custom"}
                      />
                    </div>
                  )}
                </div>
              )}

              {editTriggerType === "schedule" && (
                <div className="space-y-1 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-semibold text-slate-700">Recurring Schedule Interval</label>
                  <select
                    value={editScheduleInterval}
                    onChange={(e) => setEditScheduleInterval(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              )}

              {/* ACTION DESTINATION ROUTE & RECIPIENT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Target Route (Link URL) *</span>
                  </label>
                  <Input
                    value={editActionRoute}
                    onChange={(e) => setEditActionRoute(e.target.value)}
                    placeholder="e.g. /leave, /attendance, /finance, /operations"
                    className="text-xs font-mono"
                    required
                  />
                  <p className="text-[10px] text-slate-400">
                    Destination opened on click (e.g. /leave).
                  </p>
                </div>

                {editActionType === "notification" && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Target Recipient</label>
                    <select
                      value={editRecipientTarget}
                      onChange={(e) => setEditRecipientTarget(e.target.value as "requester" | "actor" | "creator")}
                      className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm"
                    >
                      <option value="requester">Employee / Requester (Subject of event)</option>
                      <option value="actor">Acting Manager (Person triggering action)</option>
                      <option value="creator">Rule Creator (Admin)</option>
                    </select>
                    <p className="text-[10px] text-slate-400">
                      Who receives the notification alert.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Action Title / Header</label>
                <Input
                  value={editActionTitle}
                  onChange={(e) => setEditActionTitle(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Action Message / Details</label>
                <Input
                  value={editActionMessage}
                  onChange={(e) => setEditActionMessage(e.target.value)}
                  className="text-xs"
                />
              </div>
            </form>

            {/* Footer (Fixed, Never Cropped) */}
            <div className="shrink-0 flex items-center justify-end space-x-3 px-6 py-3.5 border-t border-slate-100 bg-slate-50/90">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditAutomation(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="edit-automation-form"
                size="sm"
                disabled={isEditSubmitting}
                className="bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1.5"
              >
                {isEditSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>Save Changes</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EXECUTION HISTORY MODAL */}
      {historyAutomation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
            {/* Header (Fixed) */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/90">
              <div className="flex items-center space-x-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <History className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Execution History</h3>
                  <p className="text-xs text-slate-500">{historyAutomation.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryAutomation(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Table Body */}
            <div className="flex-1 overflow-y-auto p-6">
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
                        <th className="p-2.5">Result</th>
                        <th className="p-2.5">Duration</th>
                        <th className="p-2.5">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {executions.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5">
                            <Badge
                              variant={e.status === "success" ? "success" : e.status === "skipped" ? "secondary" : "destructive"}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {e.status}
                            </Badge>
                          </td>
                          <td className="p-2.5 font-mono text-[11px] text-slate-700">{e.trigger_source}</td>
                          <td className="p-2.5 text-slate-600 max-w-xs break-words">
                            {e.result_summary || e.error_message || "—"}
                          </td>
                          <td className="p-2.5 text-slate-500">{e.duration_ms}ms</td>
                          <td className="p-2.5 text-slate-400">{new Date(e.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer (Fixed) */}
            <div className="shrink-0 p-3.5 border-t border-slate-100 bg-slate-50/90 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryAutomation(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
