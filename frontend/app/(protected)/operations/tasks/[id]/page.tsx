"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  User,
  X,
  Building2,
  FolderGit2,
  Box,
  CheckSquare,
  Square,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  OperationChecklistCreate,
  OperationTaskAssign,
  OperationTaskDetail,
  TaskPriority,
  TaskStatus,
} from "@/types/operation";

const STATUS_CONFIG: Record<TaskStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-slate-100 text-slate-700 border-slate-300" },
  assigned: { label: "Assigned", className: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-700 border-amber-200" },
  blocked: { label: "Blocked", className: "bg-rose-50 text-rose-700 border-rose-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  low: { label: "Low", className: "text-slate-600 bg-slate-50 border-slate-200" },
  medium: { label: "Medium", className: "text-blue-700 bg-blue-50 border-blue-200" },
  high: { label: "High", className: "text-amber-700 bg-amber-50 border-amber-200" },
  urgent: { label: "Urgent", className: "text-rose-700 bg-rose-50 border-rose-200" },
};

export default function OperationTaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params?.id || "";

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canManage = permissions.includes("operations.manage");
  const canUpdate = permissions.includes("operations.update");
  const canComplete = permissions.includes("operations.complete");
  const canAssign = permissions.includes("operations.assign");
  const canView = permissions.includes("operations.view");

  const [task, setTask] = React.useState<OperationTaskDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Actions
  const [actionLoading, setActionLoading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Assign Modal
  const [showAssignModal, setShowAssignModal] = React.useState(false);
  const [assignForm, setAssignForm] = React.useState<OperationTaskAssign>({
    assigned_to_id: "",
    notes: "",
  });
  const [assignLoading, setAssignLoading] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);

  // Add Checklist Modal
  const [showAddChecklistModal, setShowAddChecklistModal] = React.useState(false);
  const [checklistForm, setChecklistForm] = React.useState<OperationChecklistCreate>({
    title: "",
    sequence_order: 0,
    is_required: false,
    notes: "",
  });
  const [checklistLoading, setChecklistLoading] = React.useState(false);
  const [checklistError, setChecklistError] = React.useState<string | null>(null);

  const fetchTask = React.useCallback(async () => {
    if (!currentOrganization?.id || !taskId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<any>(API_ENDPOINTS.operations.taskDetail(taskId));
      const data = (res as any)?.data || res;
      setTask(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load operation task.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, taskId]);

  React.useEffect(() => {
    if (canView) fetchTask();
  }, [fetchTask, canView]);

  const handleStatusAction = async (action: "start" | "complete" | "cancel") => {
    if (!task) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const endpoint =
        action === "start"
          ? API_ENDPOINTS.operations.startTask(task.id)
          : action === "complete"
          ? API_ENDPOINTS.operations.completeTask(task.id)
          : API_ENDPOINTS.operations.cancelTask(task.id);
      await apiClient.post(endpoint, {});
      fetchTask();
    } catch (err: any) {
      setActionError(err?.message || `Failed to ${action} task.`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await apiClient.post(API_ENDPOINTS.operations.assignTask(task.id), assignForm);
      setShowAssignModal(false);
      setAssignForm({ assigned_to_id: "", notes: "" });
      fetchTask();
    } catch (err: any) {
      setAssignError(err?.message || "Failed to assign task.");
    } finally {
      setAssignLoading(false);
    }
  };

  const handleToggleChecklist = async (itemId: string, currentStatus: boolean) => {
    if (!task) return;
    try {
      await apiClient.patch(API_ENDPOINTS.operations.updateChecklist(task.id, itemId), {
        is_completed: !currentStatus,
      });
      fetchTask();
    } catch (err: any) {
      setActionError(err?.message || "Failed to toggle checklist item.");
    }
  };

  const handleAddChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    setChecklistLoading(true);
    setChecklistError(null);
    try {
      await apiClient.post(API_ENDPOINTS.operations.createChecklist(task.id), checklistForm);
      setShowAddChecklistModal(false);
      setChecklistForm({ title: "", sequence_order: 0, is_required: false, notes: "" });
      fetchTask();
    } catch (err: any) {
      setChecklistError(err?.message || "Failed to add checklist item.");
    } finally {
      setChecklistLoading(false);
    }
  };

  const handleDeleteChecklist = async (itemId: string) => {
    if (!task) return;
    try {
      await apiClient.delete(API_ENDPOINTS.operations.deleteChecklist(task.id, itemId));
      fetchTask();
    } catch {
      // silently ignore or set actionError
    }
  };

  if (isOrgLoading || isLoading) return <LoadingState message="Loading operation task..." />;
  if (error) return <ErrorState title="Error" message={error} onRetry={fetchTask} />;
  if (!task) return <ErrorState title="Not Found" message="Operation task not found." />;

  const statusCfg = STATUS_CONFIG[task.status];
  const priorityCfg = PRIORITY_CONFIG[task.priority];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/operations" className="mt-1 text-slate-400 hover:text-slate-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-slate-900 truncate">{task.title}</h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${priorityCfg.className}`}
            >
              {priorityCfg.label}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}
            >
              {statusCfg.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {task.task_number} {task.category ? `· ${task.category}` : ""}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 shrink-0">
          {canAssign && !["completed", "cancelled"].includes(task.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAssignModal(true)}
              disabled={actionLoading}
            >
              Assign
            </Button>
          )}
          {canUpdate && ["open", "assigned", "blocked"].includes(task.status) && (
            <Button
              size="sm"
              onClick={() => handleStatusAction("start")}
              disabled={actionLoading}
            >
              Start
            </Button>
          )}
          {canComplete && !["completed", "cancelled"].includes(task.status) && (
            <Button
              size="sm"
              onClick={() => handleStatusAction("complete")}
              disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Complete
            </Button>
          )}
          {(canUpdate || canManage) && !["completed", "cancelled"].includes(task.status) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusAction("cancel")}
              disabled={actionLoading}
              className="text-rose-600 border-rose-300 hover:bg-rose-50"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          <X className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Task Overview & Checklists */}
        <div className="lg:col-span-2 space-y-6">
          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-500" />
                Task Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {task.description && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-400">Description</h4>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{task.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
                {task.assigned_to && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-slate-400">Assignee</p>
                      <p className="font-medium text-slate-800">
                        {task.assigned_to.first_name} {task.assigned_to.last_name}
                      </p>
                    </div>
                  </div>
                )}
                {task.due_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-slate-400">Due Date</p>
                      <p className="font-medium text-slate-800">{task.due_date.slice(0, 10)}</p>
                    </div>
                  </div>
                )}
                {task.completed_at && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-slate-400">Completed At</p>
                      <p className="font-medium text-slate-800">{task.completed_at.slice(0, 10)}</p>
                    </div>
                  </div>
                )}
                {task.department && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-slate-400">Department</p>
                      <p className="font-medium text-slate-800">{task.department.name}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Checklist Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Operational Checklist
              </CardTitle>
              {canUpdate && !["completed", "cancelled"].includes(task.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddChecklistModal(true)}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Step
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!task.checklists?.length ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
                  <p className="text-xs text-slate-500">No checklist items defined for this task.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {task.checklists.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-start justify-between rounded-lg border p-3 transition-colors ${
                        item.is_completed ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleToggleChecklist(item.id, item.is_completed)}
                          className="mt-0.5 text-slate-400 hover:text-blue-600 focus:outline-none"
                        >
                          {item.is_completed ? (
                            <CheckSquare className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-medium ${
                              item.is_completed ? "line-through text-slate-400" : "text-slate-800"
                            }`}
                          >
                            {item.title}
                            {item.is_required && (
                              <span className="ml-1.5 text-xs text-rose-500 font-normal">*required</span>
                            )}
                          </p>
                          {item.notes && <p className="text-xs text-slate-500 mt-0.5">{item.notes}</p>}
                          {item.is_completed && item.completed_by && (
                            <p className="text-xs text-slate-400 mt-1">
                              Completed by {item.completed_by.first_name} {item.completed_by.last_name}
                            </p>
                          )}
                        </div>
                      </div>
                      {canUpdate && !["completed", "cancelled"].includes(task.status) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteChecklist(item.id)}
                          className="text-slate-300 hover:text-rose-500 focus:outline-none"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Linked Entities & Assignees */}
        <div className="space-y-6">
          {/* Linked Entities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked Entities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-600">
              {task.project && (
                <div className="flex items-center gap-2">
                  <FolderGit2 className="h-4 w-4 text-slate-400" />
                  <div>
                    <p className="text-slate-400">Project</p>
                    <p className="font-medium text-slate-800">{task.project.name}</p>
                  </div>
                </div>
              )}
              {task.client && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <div>
                    <p className="text-slate-400">Client</p>
                    <p className="font-medium text-slate-800">{task.client.name}</p>
                  </div>
                </div>
              )}
              {task.asset && (
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4 text-slate-400" />
                  <div>
                    <p className="text-slate-400">Asset</p>
                    <p className="font-medium text-slate-800">{task.asset.name} ({task.asset.asset_tag})</p>
                  </div>
                </div>
              )}
              {!task.project && !task.client && !task.asset && (
                <p className="text-slate-400">No linked entities attached.</p>
              )}
            </CardContent>
          </Card>

          {/* Assigned Personnel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assignees History</CardTitle>
            </CardHeader>
            <CardContent>
              {!task.assignees?.length ? (
                <p className="text-xs text-slate-400">No assignees recorded.</p>
              ) : (
                <div className="space-y-2">
                  {task.assignees.map((asg) => (
                    <div key={asg.id} className="flex items-center justify-between text-xs p-2 rounded bg-slate-50">
                      <div>
                        <p className="font-medium text-slate-800">
                          {asg.employee ? `${asg.employee.first_name} ${asg.employee.last_name}` : asg.employee_id}
                        </p>
                        <p className="text-slate-400 capitalize">{asg.role}</p>
                      </div>
                      <span className="text-slate-400">{asg.assigned_at.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Assign Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => { setShowAssignModal(false); setAssignError(null); }}
        title="Assign Operation Task"
        size="sm"
      >
        <form onSubmit={handleAssign} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="assigned_to_id">Employee ID *</Label>
            <Input
              id="assigned_to_id"
              required
              value={assignForm.assigned_to_id}
              onChange={(e) => setAssignForm({ ...assignForm, assigned_to_id: e.target.value })}
              placeholder="Enter employee UUID"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign_notes">Assignment Notes</Label>
            <Input
              id="assign_notes"
              value={assignForm.notes || ""}
              onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
              placeholder="Optional notes"
            />
          </div>
          {assignError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              <X className="h-4 w-4 shrink-0" />
              {assignError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={assignLoading}>
              {assignLoading ? "Assigning..." : "Assign Task"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Checklist Modal */}
      <Modal
        isOpen={showAddChecklistModal}
        onClose={() => { setShowAddChecklistModal(false); setChecklistError(null); }}
        title="Add Checklist Step"
        size="sm"
      >
        <form onSubmit={handleAddChecklist} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="step_title">Title *</Label>
            <Input
              id="step_title"
              required
              value={checklistForm.title}
              onChange={(e) => setChecklistForm({ ...checklistForm, title: e.target.value })}
              placeholder="Inspect backup power supply"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="is_required"
              type="checkbox"
              checked={checklistForm.is_required}
              onChange={(e) => setChecklistForm({ ...checklistForm, is_required: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="is_required" className="text-xs cursor-pointer">
              Required step (must be completed before closing task)
            </Label>
          </div>
          {checklistError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              <X className="h-4 w-4 shrink-0" />
              {checklistError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAddChecklistModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={checklistLoading}>
              {checklistLoading ? "Adding..." : "Add Step"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
