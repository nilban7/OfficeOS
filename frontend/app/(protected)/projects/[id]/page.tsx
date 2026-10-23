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
  Handshake,
  Link as LinkIcon,
  Unlink,
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
import type { Client, ClientListResponse } from "@/types/client";
import type { ClientEngagementSummary } from "@/types/engagement";
import type {
  ProjectDetail,
  ProjectMember,
  ProjectMemberCreateInput,
  ProjectMemberUpdateInput,
  ProjectStatus,
} from "@/types/project";

const STAGE_LABELS: Record<string, { label: string; step: number }> = {
  proposal: { label: "1. Proposal & Scoping", step: 1 },
  agreement: { label: "2. Agreement & e-Sign", step: 2 },
  kickoff: { label: "3. Kickoff Ready", step: 3 },
  delivery: { label: "4. Active Development", step: 4 },
  weekly_reporting: { label: "5. Weekly Progress", step: 5 },
  uat: { label: "6. Mock Run (UAT)", step: 6 },
  issues_triage: { label: "7. Client Queries & Triage", step: 7 },
  acceptance_handover: { label: "8. Final Delivery & Handover", step: 8 },
  maintenance_support: { label: "9. Warranty & SLA Support", step: 9 },
};


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

  // Engagement States & Modals
  const [linkedEngagement, setLinkedEngagement] = React.useState<ClientEngagementSummary | null>(null);
  const [unlinkedEngagements, setUnlinkedEngagements] = React.useState<ClientEngagementSummary[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [isLinkEngagementModalOpen, setIsLinkEngagementModalOpen] = React.useState(false);
  const [isCreateEngagementModalOpen, setIsCreateEngagementModalOpen] = React.useState(false);
  const [isUnlinkEngagementModalOpen, setIsUnlinkEngagementModalOpen] = React.useState(false);
  const [selectedEngagementToLink, setSelectedEngagementToLink] = React.useState("");
  const [showAllClientsEngagements, setShowAllClientsEngagements] = React.useState(false);

  // Create Engagement Form
  const [newEngTitle, setNewEngTitle] = React.useState("");
  const [newEngClientId, setNewEngClientId] = React.useState("");
  const [newEngDescription, setNewEngDescription] = React.useState("");
  const [newEngContractValue, setNewEngContractValue] = React.useState("");
  const [newEngCurrency, setNewEngCurrency] = React.useState("INR");
  const [newEngLeadId, setNewEngLeadId] = React.useState("");
  const [newEngTargetDate, setNewEngTargetDate] = React.useState("");

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

  // Fetch Linked Client Engagement
  const fetchLinkedEngagement = React.useCallback(async () => {
    if (!currentOrganization?.id || !projectId) return;
    try {
      const res = await apiClient.get<ClientEngagementSummary[] | { items: ClientEngagementSummary[] }>(
        API_ENDPOINTS.engagements.list,
        {
          params: { project_id: projectId },
          organizationId: currentOrganization.id,
        }
      );
      const list = Array.isArray(res) ? res : (res as { items?: ClientEngagementSummary[] })?.items || [];
      if (list.length > 0 && list[0]) {
        setLinkedEngagement(list[0]);
      } else {
        setLinkedEngagement(null);
      }
    } catch {
      setLinkedEngagement(null);
    }
  }, [currentOrganization?.id, projectId]);

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

  // Fetch Unlinked Engagements and Clients for Modals
  const fetchUnlinkedEngagements = React.useCallback(async () => {
    if (!currentOrganization?.id) return;
    try {
      const [engRes, clientsRes] = await Promise.all([
        apiClient.get<ClientEngagementSummary[] | { items: ClientEngagementSummary[] }>(
          API_ENDPOINTS.engagements.list,
          { organizationId: currentOrganization.id }
        ),
        apiClient.get<ClientListResponse | Client[]>(API_ENDPOINTS.clients.list, {
          params: { page_size: 100 },
          organizationId: currentOrganization.id,
        }),
      ]);
      const allEngs = Array.isArray(engRes) ? engRes : (engRes as { items?: ClientEngagementSummary[] })?.items || [];
      const unlinked = allEngs.filter((e) => !e.project_id);
      setUnlinkedEngagements(unlinked);

      const clientList = Array.isArray(clientsRes) ? clientsRes : (clientsRes as ClientListResponse)?.items || [];
      setClients(clientList);
    } catch {
      // Ignore modal aux fetch errors
    }
  }, [currentOrganization?.id]);

  React.useEffect(() => {
    fetchProjectDetails();
    fetchLinkedEngagement();
  }, [fetchProjectDetails, fetchLinkedEngagement]);

  React.useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Handle Link Existing Engagement
  const handleLinkEngagementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEngagementToLink || !projectId || !currentOrganization?.id) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await apiClient.patch(
        API_ENDPOINTS.engagements.update(selectedEngagementToLink),
        { project_id: projectId, current_stage: "delivery" },
        { organizationId: currentOrganization.id }
      );
      setSuccessMessage("Client Engagement successfully linked to this project!");
      setIsLinkEngagementModalOpen(false);
      setSelectedEngagementToLink("");
      await fetchProjectDetails();
      await fetchLinkedEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to link engagement";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Create Engagement Modal Pre-filled
  const handleOpenCreateEngagement = async () => {
    if (!project) return;
    setNewEngTitle(`${project.name} Engagement`);
    setNewEngClientId(project.client_id || "");
    setNewEngDescription(project.description || "");
    setNewEngContractValue(project.budget ? String(project.budget) : "");
    setNewEngCurrency("INR");
    setNewEngLeadId(project.project_manager_employee_id || "");
    setNewEngTargetDate(project.end_date || "");
    setFormError(null);
    await fetchUnlinkedEngagements();
    setIsCreateEngagementModalOpen(true);
  };

  // Handle Create Engagement Submit
  const handleCreateEngagementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEngTitle.trim() || !newEngClientId || !projectId || !currentOrganization?.id) {
      setFormError("Title and Client are required.");
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.create,
        {
          title: newEngTitle.trim(),
          client_id: newEngClientId,
          description: newEngDescription || null,
          contract_value: newEngContractValue ? Number(newEngContractValue) : null,
          currency: newEngCurrency,
          engagement_lead_id: newEngLeadId || null,
          target_completion_date: newEngTargetDate || null,
          project_id: projectId,
        },
        { organizationId: currentOrganization.id }
      );
      setSuccessMessage("Commercial Client Engagement created and linked successfully!");
      setIsCreateEngagementModalOpen(false);
      await fetchProjectDetails();
      await fetchLinkedEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create client engagement";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Unlink Engagement
  const handleUnlinkEngagementSubmit = async () => {
    if (!linkedEngagement?.id || !currentOrganization?.id) return;
    setIsSubmitting(true);
    try {
      await apiClient.patch(
        API_ENDPOINTS.engagements.update(linkedEngagement.id),
        { project_id: null },
        { organizationId: currentOrganization.id }
      );
      setSuccessMessage("Client Engagement unlinked from this project.");
      setIsUnlinkEngagementModalOpen(false);
      setLinkedEngagement(null);
      await fetchProjectDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to unlink engagement";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };


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

      {/* Commercial Client Engagement Section */}
      {linkedEngagement ? (
        <Card className="border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-muted/40 px-5 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary shrink-0" />
              <h3 className="font-semibold text-sm text-foreground">Commercial Client Engagement</h3>
              <span className="font-mono text-xs font-semibold rounded bg-primary/10 text-primary border border-primary/20 px-2 py-0.5">
                {linkedEngagement.engagement_code}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsUnlinkEngagementModalOpen(true)}
                className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1.5"
              >
                <Unlink className="h-3.5 w-3.5" />
                Unlink
              </Button>
              <Link href={`/engagements/${linkedEngagement.id}`}>
                <Button size="sm" className="h-8 text-xs gap-1.5">
                  <span>Open Engagement Lifecycle</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
              <div className="md:col-span-2 space-y-1">
                <Link
                  href={`/engagements/${linkedEngagement.id}`}
                  className="font-semibold text-base text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                >
                  {linkedEngagement.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Client:{" "}
                  <span className="font-medium text-foreground">
                    {linkedEngagement.client_name || project.client_name || "Internal Organization"}
                  </span>
                  {linkedEngagement.contract_value && (
                    <span className="ml-2 font-mono font-medium text-foreground">
                      • Value: {linkedEngagement.currency} {Number(linkedEngagement.contract_value).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>

              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">
                  Lifecycle Stage
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs font-medium border-primary/30 text-primary">
                    {STAGE_LABELS[linkedEngagement.current_stage]?.label || linkedEngagement.current_stage}
                  </Badge>
                  <Badge
                    variant={
                      linkedEngagement.delivery_health === "on_track"
                        ? "success"
                        : linkedEngagement.delivery_health === "at_risk"
                        ? "warning"
                        : "destructive"
                    }
                    className="text-[10px]"
                  >
                    {linkedEngagement.delivery_health === "on_track" ? "On Track" : linkedEngagement.delivery_health}
                  </Badge>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                  <span className="text-[11px] uppercase tracking-wider font-semibold">Progress</span>
                  <span className="font-semibold text-foreground">{linkedEngagement.progress_percentage}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border">
                  <div
                    className="bg-primary h-full transition-all duration-300 rounded-full"
                    style={{ width: `${linkedEngagement.progress_percentage}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-2 border-border bg-muted/10 p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Handshake className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">No Commercial Client Engagement Linked</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect this operational project to client commercial proposals, executed contracts, weekly progress reports, UAT mock runs, and warranty SLA tracking.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchUnlinkedEngagements();
                  setIsLinkEngagementModalOpen(true);
                }}
                className="text-xs gap-1.5 flex-1 sm:flex-initial bg-card hover:bg-muted"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                Link Existing Engagement
              </Button>
              <Button
                size="sm"
                onClick={handleOpenCreateEngagement}
                className="text-xs gap-1.5 flex-1 sm:flex-initial"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Engagement
              </Button>
            </div>
          </div>
        </Card>
      )}

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

      {/* Link Existing Engagement Modal */}
      <Modal
        isOpen={isLinkEngagementModalOpen}
        onClose={() => setIsLinkEngagementModalOpen(false)}
        title="Link Client Engagement to Project"
      >
        <form onSubmit={handleLinkEngagementSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select an existing commercial engagement to bind to this project ({project.project_code} • {project.name}).
          </p>

          {formError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {project.client_id && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pb-1">
              <input
                type="checkbox"
                id="show_all_clients"
                checked={showAllClientsEngagements}
                onChange={(e) => setShowAllClientsEngagements(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="show_all_clients" className="cursor-pointer">
                Show engagements from all clients (not just {project.client_name})
              </label>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="select_engagement">Client Engagement</Label>
            <select
              id="select_engagement"
              value={selectedEngagementToLink}
              onChange={(e) => setSelectedEngagementToLink(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            >
              <option value="">-- Select an Engagement --</option>
              {unlinkedEngagements
                .filter((eng) =>
                  showAllClientsEngagements || !project.client_id ? true : eng.client_id === project.client_id
                )
                .map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.engagement_code}: {eng.title} ({eng.client_name || "Internal"}) • {STAGE_LABELS[eng.current_stage]?.label || eng.current_stage}
                  </option>
                ))}
            </select>
            {unlinkedEngagements.length === 0 && (
              <p className="text-xs text-muted-foreground italic mt-1">
                No unlinked engagements found. You can click &quot;Create Engagement&quot; to start a new one.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsLinkEngagementModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !selectedEngagementToLink}>
              {isSubmitting ? "Linking..." : "Link to Project"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create & Link Engagement Modal */}
      <Modal
        isOpen={isCreateEngagementModalOpen}
        onClose={() => setIsCreateEngagementModalOpen(false)}
        title="Create & Link Client Engagement"
      >
        <form onSubmit={handleCreateEngagementSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a new commercial lifecycle engagement for {project.project_code} ({project.name}).
          </p>

          {formError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="new_eng_title">
              Engagement Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new_eng_title"
              value={newEngTitle}
              onChange={(e) => setNewEngTitle(e.target.value)}
              placeholder="e.g. Mobile Banking App Engagement"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new_eng_client">
                Client Organization <span className="text-destructive">*</span>
              </Label>
              <select
                id="new_eng_client"
                value={newEngClientId}
                onChange={(e) => setNewEngClientId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              >
                <option value="">-- Select Client --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.client_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new_eng_lead">Engagement Lead</Label>
              <select
                id="new_eng_lead"
                value={newEngLeadId}
                onChange={(e) => setNewEngLeadId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Select Lead / PM --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="new_eng_val">Contract Value</Label>
              <Input
                id="new_eng_val"
                type="number"
                min="0"
                step="0.01"
                value={newEngContractValue}
                onChange={(e) => setNewEngContractValue(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_eng_curr">Currency</Label>
              <select
                id="new_eng_curr"
                value={newEngCurrency}
                onChange={(e) => setNewEngCurrency(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new_eng_target_date">Target Completion Date</Label>
            <Input
              id="new_eng_target_date"
              type="date"
              value={newEngTargetDate}
              onChange={(e) => setNewEngTargetDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new_eng_desc">Description / Scope of Work</Label>
            <textarea
              id="new_eng_desc"
              rows={3}
              value={newEngDescription}
              onChange={(e) => setNewEngDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Commercial scope and objectives..."
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsCreateEngagementModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !newEngTitle.trim() || !newEngClientId}>
              {isSubmitting ? "Creating..." : "Create & Link Engagement"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Unlink Engagement Confirmation Modal */}
      <Modal
        isOpen={isUnlinkEngagementModalOpen}
        onClose={() => setIsUnlinkEngagementModalOpen(false)}
        title="Unlink Client Engagement"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to unlink commercial engagement{" "}
            <strong className="text-foreground">{linkedEngagement?.engagement_code} ({linkedEngagement?.title})</strong>{" "}
            from this project?
          </p>
          <p className="text-xs text-muted-foreground">
            The project and engagement will both remain intact, but their operational and commercial lifecycles will be decoupled.
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsUnlinkEngagementModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleUnlinkEngagementSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Unlinking..." : "Unlink Engagement"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
