"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  User,
  Users,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Percent,
  ExternalLink,
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
import type { Employee, EmployeeListResponse } from "@/types/employee";
import type {
  ProjectDetail,
  ProjectMember,
  ProjectMemberCreateInput,
  ProjectMemberUpdateInput,
  ProjectStatus,
} from "@/types/project";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canViewProjects = permissions.includes("projects.view") || permissions.includes("project:read");
  const canManageMembers = permissions.includes("project_members.manage");

  // State
  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Alerts
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = React.useState(false);
  const [isEditMemberModalOpen, setIsEditMemberModalOpen] = React.useState(false);
  const [editingMember, setEditingMember] = React.useState<ProjectMember | null>(null);
  const [isRemoveMemberModalOpen, setIsRemoveMemberModalOpen] = React.useState(false);
  const [memberToRemove, setMemberToRemove] = React.useState<ProjectMember | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Add Member Form
  const [addMemberForm, setAddMemberForm] = React.useState<ProjectMemberCreateInput>({
    employee_id: "",
    role: "",
    allocation_percentage: 100,
    start_date: null,
    end_date: null,
  });

  // Edit Member Form
  const [editMemberForm, setEditMemberForm] = React.useState<ProjectMemberUpdateInput>({});

  // Fetch Project Details
  const fetchProjectDetails = React.useCallback(async () => {
    if (!currentOrganization?.id || !projectId || !canViewProjects) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<ProjectDetail>(API_ENDPOINTS.projects.detail(projectId), {
        organizationId: currentOrganization.id,
      });
      if (res) {
        setProject(res);
      }
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load project details.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, projectId, canViewProjects]);

  // Fetch Employees for Team Assignment
  const fetchEmployees = React.useCallback(async () => {
    if (!currentOrganization?.id || !canViewProjects) return;

    try {
      const res = await apiClient.get<EmployeeListResponse>(API_ENDPOINTS.employees.list, {
        params: { page_size: 100 },
        organizationId: currentOrganization.id,
      });
      if (res && res.items) {
        setEmployees(res.items);
      }
    } catch {
      // Ignore aux fetch errors
    }
  }, [currentOrganization?.id, canViewProjects]);

  React.useEffect(() => {
    fetchProjectDetails();
  }, [fetchProjectDetails]);

  React.useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Add Member Submit
  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !projectId || !canManageMembers) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: ProjectMemberCreateInput = {
        employee_id: addMemberForm.employee_id,
        role: addMemberForm.role?.trim() || null,
        allocation_percentage: addMemberForm.allocation_percentage ? Number(addMemberForm.allocation_percentage) : 100,
        start_date: addMemberForm.start_date || null,
        end_date: addMemberForm.end_date || null,
      };

      await apiClient.post(API_ENDPOINTS.projects.members(projectId), payload, {
        organizationId: currentOrganization.id,
      });

      setIsAddMemberModalOpen(false);
      setSuccessMessage("Project member added successfully.");
      setAddMemberForm({
        employee_id: "",
        role: "",
        allocation_percentage: 100,
        start_date: null,
        end_date: null,
      });
      fetchProjectDetails();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to add project member. Please check inputs.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Member Modal
  const handleOpenEditMember = (member: ProjectMember) => {
    setEditingMember(member);
    setEditMemberForm({
      role: member.role || "",
      allocation_percentage: member.allocation_percentage ? Number(member.allocation_percentage) : 100,
      start_date: member.start_date || null,
      end_date: member.end_date || null,
    });
    setFormError(null);
    setIsEditMemberModalOpen(true);
  };

  // Edit Member Submit
  const handleEditMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !projectId || !editingMember || !canManageMembers) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: ProjectMemberUpdateInput = {
        role: editMemberForm.role?.trim() || null,
        allocation_percentage: editMemberForm.allocation_percentage ? Number(editMemberForm.allocation_percentage) : null,
        start_date: editMemberForm.start_date || null,
        end_date: editMemberForm.end_date || null,
      };

      await apiClient.patch(API_ENDPOINTS.projects.memberDetail(projectId, editingMember.id), payload, {
        organizationId: currentOrganization.id,
      });

      setIsEditMemberModalOpen(false);
      setSuccessMessage("Project member updated successfully.");
      fetchProjectDetails();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update project member.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove Member Submit
  const handleRemoveMemberSubmit = async () => {
    if (!currentOrganization?.id || !projectId || !memberToRemove || !canManageMembers) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.delete(API_ENDPOINTS.projects.memberDetail(projectId, memberToRemove.id), {
        organizationId: currentOrganization.id,
      });

      setIsRemoveMemberModalOpen(false);
      setSuccessMessage(`Removed ${memberToRemove.employee_name || "member"} from project.`);
      setMemberToRemove(null);
      fetchProjectDetails();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to remove member.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading project workspace..." />;
  }

  if (!canViewProjects) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <ShieldAlert className="h-8 w-8 text-warning" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">Access Restricted</h3>
          <p className="mt-2 text-sm text-muted-foreground">You do not have permission to view this project.</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !project) {
    return (
      <ErrorState
        message={error || "Project not found"}
        onRetry={fetchProjectDetails}
      />
    );
  }

  // Filter available employees not already in the project team
  const assignedEmployeeIds = new Set(project.members.map((m) => m.employee_id));
  const availableEmployees = employees.filter((emp) => !assignedEmployeeIds.has(emp.id));

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects Directory
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
            <span className="font-mono text-sm font-semibold rounded bg-muted px-2.5 py-0.5 text-muted-foreground border border-border">
              {project.project_code}
            </span>
            {getStatusBadge(project.status)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.description || "No project description provided."}
          </p>
        </div>
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

      {/* Metadata Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>Client Organization</span>
            </div>
            <div className="mt-2 font-medium text-foreground">
              {project.client_name ? (
                project.client_id ? (
                  <Link
                    href={`/clients/${project.client_id}`}
                    className="group flex flex-col hover:text-primary-600 transition-colors"
                  >
                    <p className="flex items-center gap-1 group-hover:underline">
                      {project.client_name}
                      <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{project.client_code}</p>
                  </Link>
                ) : (
                  <div>
                    <p>{project.client_name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{project.client_code}</p>
                  </div>
                )
              ) : (
                <span className="text-sm text-muted-foreground italic">Internal Project</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Project Manager</span>
            </div>
            <div className="mt-2 font-medium text-foreground">
              {project.project_manager_name ? (
                <div>
                  <p>{project.project_manager_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{project.project_manager_code}</p>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground italic">Unassigned</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span>Total Budget</span>
            </div>
            <div className="mt-2">
              {project.budget !== null && project.budget !== undefined ? (
                <p className="text-lg font-bold text-foreground">${Number(project.budget).toLocaleString()}</p>
              ) : (
                <span className="text-sm text-muted-foreground italic">Not set</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Project Timeline</span>
            </div>
            <div className="mt-2 text-xs font-medium text-foreground">
              {project.start_date || project.end_date ? (
                <p>
                  {project.start_date || "—"} to {project.end_date || "—"}
                </p>
              ) : (
                <span className="text-sm text-muted-foreground italic">Dates not set</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Allocation Section */}
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Project Team & Allocations
            </h2>
            <p className="text-xs text-muted-foreground">
              Assigned team members, roles, and staffing capacity.
            </p>
          </div>
          {canManageMembers && (
            <Button onClick={() => setIsAddMemberModalOpen(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Team Member
            </Button>
          )}
        </div>

        {project.members.length === 0 ? (
          <EmptyState
            title="No team members assigned"
            description="Assign employees to this project to track roles, allocations, and contribution."
            actionLabel={canManageMembers ? "Add Team Member" : undefined}
            onAction={canManageMembers ? () => setIsAddMemberModalOpen(true) : undefined}
          />
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Role on Project</th>
                    <th className="px-4 py-3 font-medium">Allocation</th>
                    <th className="px-4 py-3 font-medium">Period</th>
                    {canManageMembers && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {project.members.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground">{member.employee_name || "Employee"}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{member.employee_code}</span>
                          {member.employee_designation && <span>• {member.employee_designation}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        <span className="text-foreground font-medium">{member.role || "Member"}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 font-medium">
                          <Badge variant="secondary" className="gap-1">
                            <Percent className="h-3 w-3" />
                            {member.allocation_percentage ? Number(member.allocation_percentage) : 100}%
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {member.start_date || member.end_date ? (
                          <span>
                            {member.start_date || "—"} to {member.end_date || "—"}
                          </span>
                        ) : (
                          <span>Full project span</span>
                        )}
                      </td>
                      {canManageMembers && (
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Edit Member"
                              onClick={() => handleOpenEditMember(member)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              title="Remove Member"
                              onClick={() => {
                                setMemberToRemove(member);
                                setIsRemoveMemberModalOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      <Modal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        title="Add Team Member"
      >
        <form onSubmit={handleAddMemberSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="member_employee_id">Select Employee *</Label>
            <select
              id="member_employee_id"
              required
              value={addMemberForm.employee_id}
              onChange={(e) => setAddMemberForm({ ...addMemberForm, employee_id: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">-- Choose Employee --</option>
              {availableEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({emp.employee_code}) - {emp.designation}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="member_role">Role on Project</Label>
              <Input
                id="member_role"
                placeholder="e.g. Lead Engineer, UX Designer"
                value={addMemberForm.role || ""}
                onChange={(e) => setAddMemberForm({ ...addMemberForm, role: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member_allocation">Allocation % (0 - 100)</Label>
              <Input
                id="member_allocation"
                type="number"
                min="0"
                max="100"
                value={addMemberForm.allocation_percentage ?? 100}
                onChange={(e) => setAddMemberForm({ ...addMemberForm, allocation_percentage: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="member_start_date">Start Date</Label>
              <Input
                id="member_start_date"
                type="date"
                value={addMemberForm.start_date || ""}
                onChange={(e) => setAddMemberForm({ ...addMemberForm, start_date: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member_end_date">End Date</Label>
              <Input
                id="member_end_date"
                type="date"
                value={addMemberForm.end_date || ""}
                onChange={(e) => setAddMemberForm({ ...addMemberForm, end_date: e.target.value || null })}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddMemberModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !addMemberForm.employee_id}>
              {isSubmitting ? "Adding..." : "Add Member"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Member Modal */}
      <Modal
        isOpen={isEditMemberModalOpen}
        onClose={() => setIsEditMemberModalOpen(false)}
        title={`Edit Member: ${editingMember?.employee_name || "Team Member"}`}
      >
        <form onSubmit={handleEditMemberSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit_member_role">Role on Project</Label>
              <Input
                id="edit_member_role"
                value={editMemberForm.role || ""}
                onChange={(e) => setEditMemberForm({ ...editMemberForm, role: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_member_allocation">Allocation % (0 - 100)</Label>
              <Input
                id="edit_member_allocation"
                type="number"
                min="0"
                max="100"
                value={editMemberForm.allocation_percentage ?? 100}
                onChange={(e) => setEditMemberForm({ ...editMemberForm, allocation_percentage: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit_member_start">Start Date</Label>
              <Input
                id="edit_member_start"
                type="date"
                value={editMemberForm.start_date || ""}
                onChange={(e) => setEditMemberForm({ ...editMemberForm, start_date: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_member_end">End Date</Label>
              <Input
                id="edit_member_end"
                type="date"
                value={editMemberForm.end_date || ""}
                onChange={(e) => setEditMemberForm({ ...editMemberForm, end_date: e.target.value || null })}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsEditMemberModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Remove Member Modal */}
      <Modal
        isOpen={isRemoveMemberModalOpen}
        onClose={() => setIsRemoveMemberModalOpen(false)}
        title="Remove Member from Project"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove{" "}
            <strong className="text-foreground">{memberToRemove?.employee_name}</strong> from this project?
          </p>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsRemoveMemberModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemoveMemberSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Removing..." : "Remove Member"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
