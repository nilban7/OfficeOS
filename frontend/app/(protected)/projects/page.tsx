"use client";

import * as React from "react";
import Link from "next/link";
import {
  Layers,
  Plus,
  Search,
  Building2,
  Calendar,
  User,
  Users,
  Edit2,
  Archive,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type { Client, ClientListResponse } from "@/types/client";
import type { Employee, EmployeeListResponse } from "@/types/employee";
import type {
  Project,
  ProjectCreateInput,
  ProjectListResponse,
  ProjectStatus,
  ProjectUpdateInput,
} from "@/types/project";

export default function ProjectsPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canViewProjects = permissions.includes("projects.view") || permissions.includes("project:read");
  const canCreateProjects = permissions.includes("projects.create");
  const canUpdateProjects = permissions.includes("projects.update");
  const canDeleteProjects = permissions.includes("projects.delete");

  // Project Data & Filters
  const [projectsData, setProjectsData] = React.useState<ProjectListResponse>({
    items: [],
    meta: { total: 0, page: 1, page_size: 20, total_pages: 1 },
  });
  const [clients, setClients] = React.useState<Client[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);

  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize] = React.useState(20);

  // Global Alerts
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState<Project | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const [projectToCancel, setProjectToCancel] = React.useState<Project | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Add Project Form State
  const [addForm, setAddForm] = React.useState<ProjectCreateInput>({
    project_code: "",
    name: "",
    description: "",
    client_id: null,
    status: "planned",
    start_date: null,
    end_date: null,
    budget: null,
    project_manager_employee_id: null,
  });

  // Edit Project Form State
  const [editForm, setEditForm] = React.useState<ProjectUpdateInput>({});

  // Fetch Projects
  const fetchProjects = React.useCallback(async () => {
    if (!currentOrganization?.id || !canViewProjects) return;

    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: pageSize,
      };

      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      const res = await apiClient.get<ProjectListResponse>(API_ENDPOINTS.projects.list, {
        params,
        organizationId: currentOrganization.id,
      });

      if (res && res.items) {
        setProjectsData(res);
      }
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load projects. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, canViewProjects, currentPage, pageSize, searchTerm, statusFilter]);

  // Fetch Auxiliary Resources (Clients & Employees for dropdowns)
  const fetchAuxiliaryData = React.useCallback(async () => {
    if (!currentOrganization?.id || !canViewProjects) return;

    try {
      // Load Clients
      const clientsRes = await apiClient.get<ClientListResponse>(API_ENDPOINTS.clients.list, {
        params: { page_size: 100 },
        organizationId: currentOrganization.id,
      });
      if (clientsRes && clientsRes.items) {
        setClients(clientsRes.items);
      }

      // Load Employees
      const employeesRes = await apiClient.get<EmployeeListResponse>(API_ENDPOINTS.employees.list, {
        params: { page_size: 100 },
        organizationId: currentOrganization.id,
      });
      if (employeesRes && employeesRes.items) {
        setEmployees(employeesRes.items);
      }
    } catch {
      // Ignore aux fetch errors gracefully
    }
  }, [currentOrganization?.id, canViewProjects]);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  React.useEffect(() => {
    fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  // Add Project Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !canCreateProjects) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: ProjectCreateInput = {
        project_code: addForm.project_code.trim().toUpperCase(),
        name: addForm.name.trim(),
        description: addForm.description?.trim() || null,
        client_id: addForm.client_id || null,
        status: (addForm.status as ProjectStatus) || "planned",
        start_date: addForm.start_date || null,
        end_date: addForm.end_date || null,
        budget: addForm.budget !== null && addForm.budget !== undefined && addForm.budget !== ("" as unknown) ? Number(addForm.budget) : null,
        project_manager_employee_id: addForm.project_manager_employee_id || null,
      };

      await apiClient.post<Project>(API_ENDPOINTS.projects.create, payload, {
        organizationId: currentOrganization.id,
      });

      setIsAddModalOpen(false);
      setSuccessMessage(`Project ${payload.name} created successfully.`);
      setAddForm({
        project_code: "",
        name: "",
        description: "",
        client_id: null,
        status: "planned",
        start_date: null,
        end_date: null,
        budget: null,
        project_manager_employee_id: null,
      });
      fetchProjects();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create project. Please verify inputs.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (project: Project) => {
    setEditingProject(project);
    setEditForm({
      project_code: project.project_code,
      name: project.name,
      description: project.description || "",
      client_id: project.client_id || null,
      status: project.status,
      start_date: project.start_date || null,
      end_date: project.end_date || null,
      budget: project.budget !== null && project.budget !== undefined ? Number(project.budget) : null,
      project_manager_employee_id: project.project_manager_employee_id || null,
    });
    setFormError(null);
    setIsEditModalOpen(true);
  };

  // Edit Project Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !editingProject || !canUpdateProjects) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: ProjectUpdateInput = {
        project_code: editForm.project_code?.trim().toUpperCase(),
        name: editForm.name?.trim(),
        description: editForm.description?.trim() || null,
        client_id: editForm.client_id || null,
        status: editForm.status,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
        budget: editForm.budget !== null && editForm.budget !== undefined && editForm.budget !== ("" as unknown) ? Number(editForm.budget) : null,
        project_manager_employee_id: editForm.project_manager_employee_id || null,
      };

      await apiClient.patch<Project>(API_ENDPOINTS.projects.update(editingProject.id), payload, {
        organizationId: currentOrganization.id,
      });

      setIsEditModalOpen(false);
      setSuccessMessage(`Project ${editingProject.name} updated successfully.`);
      fetchProjects();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update project. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel / Archive Project Submit
  const handleCancelSubmit = async () => {
    if (!currentOrganization?.id || !projectToCancel || !canDeleteProjects) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.delete(API_ENDPOINTS.projects.delete(projectToCancel.id), {
        organizationId: currentOrganization.id,
      });

      setIsCancelModalOpen(false);
      setSuccessMessage(`Project ${projectToCancel.name} has been cancelled.`);
      setProjectToCancel(null);
      fetchProjects();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to cancel project.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helpers
  const getStatusBadge = (status: ProjectStatus) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "planned":
        return <Badge variant="secondary">Planned</Badge>;
      case "on_hold":
        return <Badge variant="warning">On Hold</Badge>;
      case "completed":
        return <Badge variant="outline">Completed</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Counters
  const totalCount = projectsData.meta.total;
  const activeCount = projectsData.items.filter((p) => p.status === "active").length;
  const plannedCount = projectsData.items.filter((p) => p.status === "planned").length;
  const completedOrHoldCount = projectsData.items.filter((p) => p.status === "completed" || p.status === "on_hold").length;

  if (isOrgLoading) {
    return <LoadingState message="Loading organization context..." />;
  }

  if (!canViewProjects) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">Manage organization projects and team allocations.</p>
        </div>
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-warning/10 p-3 text-warning">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">Access Restricted</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              You do not have permission to view organization projects. Please contact your administrator if you need access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Track client engagements, project milestones, budgets, and team allocations.
          </p>
        </div>
        {canCreateProjects && (
          <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Project
          </Button>
        )}
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            ×
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Total Projects</p>
              <div className="rounded-md bg-indigo-500/10 p-2 text-indigo-500">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-2xl font-bold text-foreground">{totalCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Active</p>
              <div className="rounded-md bg-emerald-500/10 p-2 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-2xl font-bold text-foreground">{activeCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Planned</p>
              <div className="rounded-md bg-sky-500/10 p-2 text-sky-500">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-2xl font-bold text-foreground">{plannedCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Completed / On Hold</p>
              <div className="rounded-md bg-slate-500/10 p-2 text-slate-500">
                <Archive className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-2xl font-bold text-foreground">{completedOrHoldCount}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by code, project name, or description..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="pl-9 bg-background border-border"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["all", "planned", "active", "on_hold", "completed", "cancelled"].map((st) => (
            <button
              key={st}
              onClick={() => handleStatusFilterChange(st)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === st
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {st === "all" ? "All" : st.replace("_", " ").toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content / Table */}
      {isLoading ? (
        <LoadingState message="Loading projects..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchProjects} />
      ) : projectsData.items.length === 0 ? (
        <EmptyState
          title="No projects found"
          description={
            searchTerm || statusFilter !== "all"
              ? "No projects match your search criteria or status filter."
              : "Get started by adding your first project to OfficeOS."
          }
          actionLabel={canCreateProjects && !searchTerm && statusFilter === "all" ? "Add Project" : undefined}
          onAction={canCreateProjects && !searchTerm && statusFilter === "all" ? () => setIsAddModalOpen(true) : undefined}
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Project</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Project Manager</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Timeline</th>
                    <th className="px-4 py-3 font-medium">Team</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projectsData.items.map((project) => (
                    <tr key={project.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div>
                          <Link
                            href={`/projects/${project.id}`}
                            className="font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2"
                          >
                            {project.name}
                          </Link>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-xs text-muted-foreground">{project.project_code}</span>
                            {project.budget && (
                              <span className="text-xs text-muted-foreground">
                                • ${Number(project.budget).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {project.client_name ? (
                          <div className="flex items-center gap-1.5 text-foreground font-medium">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{project.client_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Internal / Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {project.project_manager_name ? (
                          <div className="flex items-center gap-1.5 text-foreground font-medium">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{project.project_manager_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">{getStatusBadge(project.status)}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {project.start_date || project.end_date ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>
                              {project.start_date || "—"} to {project.end_date || "—"}
                            </span>
                          </div>
                        ) : (
                          <span>Dates not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          <span>{project.members_count || 0} members</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/projects/${project.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View Project">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {canUpdateProjects && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Edit Project"
                              onClick={() => handleOpenEdit(project)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          {canDeleteProjects && project.status !== "cancelled" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              title="Cancel Project"
                              onClick={() => {
                                setProjectToCancel(project);
                                setIsCancelModalOpen(true);
                              }}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {projectsData.meta.total_pages > 1 && (
            <div className="flex items-center justify-between py-2">
              <p className="text-xs text-muted-foreground">
                Showing page {projectsData.meta.page} of {projectsData.meta.total_pages} ({projectsData.meta.total} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="gap-1 h-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= projectsData.meta.total_pages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="gap-1 h-8"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Project Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Project"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project_code">Project Code *</Label>
              <Input
                id="project_code"
                placeholder="e.g. PRJ-001"
                required
                value={addForm.project_code}
                onChange={(e) => setAddForm({ ...addForm, project_code: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project_name">Project Name *</Label>
              <Input
                id="project_name"
                placeholder="e.g. Core Platform Upgrade"
                required
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client_id">Client (Optional)</Label>
              <select
                id="client_id"
                value={addForm.client_id || ""}
                onChange={(e) => setAddForm({ ...addForm, client_id: e.target.value || null })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- No Client (Internal) --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.client_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Initial Status</Label>
              <select
                id="status"
                value={addForm.status}
                onChange={(e) => setAddForm({ ...addForm, status: e.target.value as ProjectStatus })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pm_id">Project Manager (Optional)</Label>
              <select
                id="pm_id"
                value={addForm.project_manager_employee_id || ""}
                onChange={(e) => setAddForm({ ...addForm, project_manager_employee_id: e.target.value || null })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Select Project Manager --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget">Budget ($)</Label>
              <Input
                id="budget"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 50000"
                value={addForm.budget ?? ""}
                onChange={(e) => setAddForm({ ...addForm, budget: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={addForm.start_date || ""}
                onChange={(e) => setAddForm({ ...addForm, start_date: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_date">Target End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={addForm.end_date || ""}
                onChange={(e) => setAddForm({ ...addForm, end_date: e.target.value || null })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              rows={3}
              placeholder="Project goals, scope, and key deliverables..."
              value={addForm.description || ""}
              onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Project: ${editingProject?.name || ""}`}
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit_project_code">Project Code *</Label>
              <Input
                id="edit_project_code"
                required
                value={editForm.project_code || ""}
                onChange={(e) => setEditForm({ ...editForm, project_code: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_project_name">Project Name *</Label>
              <Input
                id="edit_project_name"
                required
                value={editForm.name || ""}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit_client_id">Client</Label>
              <select
                id="edit_client_id"
                value={editForm.client_id || ""}
                onChange={(e) => setEditForm({ ...editForm, client_id: e.target.value || null })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- No Client (Internal) --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.client_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_status">Status</Label>
              <select
                id="edit_status"
                value={editForm.status || "planned"}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ProjectStatus })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit_pm_id">Project Manager</Label>
              <select
                id="edit_pm_id"
                value={editForm.project_manager_employee_id || ""}
                onChange={(e) => setEditForm({ ...editForm, project_manager_employee_id: e.target.value || null })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Select Project Manager --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_budget">Budget ($)</Label>
              <Input
                id="edit_budget"
                type="number"
                step="0.01"
                min="0"
                value={editForm.budget ?? ""}
                onChange={(e) => setEditForm({ ...editForm, budget: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit_start_date">Start Date</Label>
              <Input
                id="edit_start_date"
                type="date"
                value={editForm.start_date || ""}
                onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_end_date">End Date</Label>
              <Input
                id="edit_end_date"
                type="date"
                value={editForm.end_date || ""}
                onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value || null })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_description">Description</Label>
            <textarea
              id="edit_description"
              rows={3}
              value={editForm.description || ""}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Project"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to cancel{" "}
            <strong className="text-foreground">{projectToCancel?.name}</strong> ({projectToCancel?.project_code})?
            This will mark the project status as cancelled.
          </p>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsCancelModalOpen(false)}>
              Keep Project
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancelSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Cancelling..." : "Cancel Project"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
