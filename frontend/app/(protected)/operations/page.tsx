"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  Plus,
  Search,
  Eye,
  X,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  ListTodo,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { OperationTask, OperationTaskCreate, TaskPriority, TaskStatus } from "@/types/operation";

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

export default function OperationsPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canCreate = permissions.includes("operations.create");
  const canView = permissions.includes("operations.view");

  const [tasks, setTasks] = React.useState<OperationTask[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [totalPages, setTotalPages] = React.useState(1);
  const [currentPage, setCurrentPage] = React.useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [priorityFilter, setPriorityFilter] = React.useState("all");

  // Create Modal
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<OperationTaskCreate>({
    task_number: "",
    title: "",
    description: "",
    category: "",
    priority: "medium",
    due_date: "",
    notes: "",
  });

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchTasks = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(currentPage), page_size: "20" };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== "all") params.status = statusFilter;
      if (priorityFilter !== "all") params.priority = priorityFilter;

      const query = new URLSearchParams(params).toString();
      const res = await apiClient.get<any>(`${API_ENDPOINTS.operations.tasks}?${query}`);
      const data = (res as any)?.data || res;
      setTasks(data?.items || []);
      setTotalPages(data?.total_pages || 1);
    } catch (err: any) {
      setError(err?.message || "Failed to load operations tasks.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, currentPage, debouncedSearch, statusFilter, priorityFilter]);

  React.useEffect(() => {
    if (canView) fetchTasks();
  }, [fetchTasks, canView]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      await apiClient.post(API_ENDPOINTS.operations.createTask, form);
      setShowCreateModal(false);
      setForm({
        task_number: "",
        title: "",
        description: "",
        category: "",
        priority: "medium",
        due_date: "",
        notes: "",
      });
      fetchTasks();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create operation task.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Metrics
  const totalCount = tasks.length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const blockedCount = tasks.filter((t) => t.status === "blocked").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  if (isOrgLoading) return <LoadingState message="Loading organization..." />;
  if (!canView) {
    return (
      <ErrorState
        title="Access Denied"
        message="You don't have permission to view operations."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Operations Management</h1>
            <p className="text-sm text-slate-500">Track and manage operational tasks, checklists, and procedures</p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <ListTodo className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Tasks</p>
              <p className="text-xl font-bold text-slate-900">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">In Progress</p>
              <p className="text-xl font-bold text-amber-600">{inProgressCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Blocked</p>
              <p className="text-xl font-bold text-rose-600">{blockedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Completed</p>
              <p className="text-xl font-bold text-emerald-600">{completedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by title, task number, category..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Priorities</option>
          {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
            <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState message="Loading operations tasks..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={fetchTasks} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No operation tasks found"
          description={debouncedSearch || statusFilter !== "all" ? "Try adjusting your filters." : "Create your first operational task to get started."}
          actionLabel={canCreate ? "New Task" : undefined}
          onAction={canCreate ? () => setShowCreateModal(true) : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => {
              const statusCfg = STATUS_CONFIG[task.status];
              const priorityCfg = PRIORITY_CONFIG[task.priority];
              return (
                <Card key={task.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/operations/tasks/${task.id}`}
                          className="block font-semibold text-slate-900 hover:text-blue-600 truncate"
                        >
                          {task.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-500">{task.task_number}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${priorityCfg.className}`}
                        >
                          {priorityCfg.label}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusCfg.className}`}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                    </div>
                    {task.description && (
                      <p className="mt-2 text-xs text-slate-600 line-clamp-2">{task.description}</p>
                    )}
                    <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                      {task.assigned_to && (
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span className="truncate">
                            {task.assigned_to.first_name} {task.assigned_to.last_name}
                          </span>
                        </div>
                      )}
                      {task.due_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>Due: {task.due_date.slice(0, 10)}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-xs text-slate-500">
                        Checklist: {task.completed_checklists_count}/{task.checklists_count}
                      </span>
                      <Link
                        href={`/operations/tasks/${task.id}`}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setCreateError(null); }}
        title="New Operation Task"
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="task_number">Task Number *</Label>
              <Input
                id="task_number"
                required
                value={form.task_number}
                onChange={(e) => setForm({ ...form, task_number: e.target.value.toUpperCase() })}
                placeholder="OPT-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Routine Maintenance Inspection"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              rows={3}
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Detailed description of operational procedure..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={form.category || ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Facility / IT / Logistics"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due_date">Due Date</Label>
            <Input
              id="due_date"
              type="date"
              value={form.due_date || ""}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
          {createError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              <X className="h-4 w-4 shrink-0" />
              {createError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowCreateModal(false); setCreateError(null); }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createLoading}>
              {createLoading ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
