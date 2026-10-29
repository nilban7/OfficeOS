"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Users,
  FolderTree,
  ShieldCheck,
  Plus,
  Settings,
  ExternalLink,
  Calendar,
  Clock,
  Coins,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Search,
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
import { ROUTES } from "@/constants/routes";
import { ApiException } from "@/types/api";
import type {
  OrganizationProfile,
  OrganizationSettings,
  BranchResponse,
  MemberResponse,
  RoleResponse,
  BranchCreate,
} from "@/types/organization";
import type { Department, DepartmentCreate } from "@/types/employee";

export default function OrganizationPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permission flags
  const canViewOrg = permissions.includes("organizations.view") || permissions.includes("org:read");
  const canUpdateOrg = permissions.includes("organizations.update") || permissions.includes("org:update");
  const canManageBranches = permissions.includes("branches.manage") || canUpdateOrg;
  const canManageDepts = permissions.includes("departments.manage") || canUpdateOrg;
  const canManageMembers = permissions.includes("members.manage") || canUpdateOrg;

  // Active Tab
  const [activeTab, setActiveTab] = React.useState<"overview" | "branches" | "departments" | "members">("overview");

  // State: Data
  const [profile, setProfile] = React.useState<OrganizationProfile | null>(null);
  const [settings, setSettings] = React.useState<OrganizationSettings | null>(null);
  const [branches, setBranches] = React.useState<BranchResponse[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [members, setMembers] = React.useState<MemberResponse[]>([]);
  const [roles, setRoles] = React.useState<RoleResponse[]>([]);

  // State: Loading & Feedback
  const [isLoading, setIsLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Search & Filters
  const [branchSearch, setBranchSearch] = React.useState("");
  const [deptSearch, setDeptSearch] = React.useState("");
  const [memberSearch, setMemberSearch] = React.useState("");

  // Modals state
  const [isEditOrgOpen, setIsEditOrgOpen] = React.useState(false);
  const [editOrgName, setEditOrgName] = React.useState("");
  const [isCreateBranchOpen, setIsCreateBranchOpen] = React.useState(false);
  const [newBranchName, setNewBranchName] = React.useState("");
  const [newBranchCode, setNewBranchCode] = React.useState("");
  const [newBranchAddress, setNewBranchAddress] = React.useState("");
  const [isCreateDeptOpen, setIsCreateDeptOpen] = React.useState(false);
  const [newDeptName, setNewDeptName] = React.useState("");
  const [newDeptCode, setNewDeptCode] = React.useState("");
  const [newDeptDesc, setNewDeptDesc] = React.useState("");
  const [isAddMemberOpen, setIsAddMemberOpen] = React.useState(false);
  const [newMemberEmail, setNewMemberEmail] = React.useState("");
  const [newMemberRoleId, setNewMemberRoleId] = React.useState("");

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);

  // Load Organization Hub data
  const fetchData = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading(true);
    setPageError(null);

    const orgId = currentOrganization.id;

    try {
      const [profileRes, settingsRes, branchesRes, deptsRes, membersRes, rolesRes] = await Promise.allSettled([
        apiClient.get<OrganizationProfile>(API_ENDPOINTS.organizations.current, { organizationId: orgId }),
        apiClient.get<OrganizationSettings>(API_ENDPOINTS.organizations.currentSettings, { organizationId: orgId }),
        apiClient.get<BranchResponse[]>(API_ENDPOINTS.organizations.currentBranches, {
          organizationId: orgId,
          params: { include_inactive: true },
        }),
        apiClient.get<Department[]>(API_ENDPOINTS.departments.list, {
          organizationId: orgId,
          params: { include_inactive: true },
        }),
        apiClient.get<MemberResponse[]>(API_ENDPOINTS.organizations.currentMembers, { organizationId: orgId }),
        apiClient.get<RoleResponse[]>(API_ENDPOINTS.organizations.currentRoles, { organizationId: orgId }),
      ]);

      if (profileRes.status === "fulfilled" && profileRes.value) {
        setProfile(profileRes.value);
        setEditOrgName(profileRes.value.name);
      } else if (currentOrganization) {
        // Fallback from context
        setProfile({
          id: currentOrganization.id,
          name: currentOrganization.name,
          slug: currentOrganization.slug,
          is_active: true,
          created_at: currentOrganization.createdAt || new Date().toISOString(),
          updated_at: currentOrganization.updatedAt || new Date().toISOString(),
        });
        setEditOrgName(currentOrganization.name);
      }

      if (settingsRes.status === "fulfilled" && settingsRes.value) {
        setSettings(settingsRes.value);
      }

      if (branchesRes.status === "fulfilled" && Array.isArray(branchesRes.value)) {
        setBranches(branchesRes.value);
      }

      if (deptsRes.status === "fulfilled" && Array.isArray(deptsRes.value)) {
        setDepartments(deptsRes.value);
      }

      if (membersRes.status === "fulfilled" && Array.isArray(membersRes.value)) {
        setMembers(membersRes.value);
      }

      if (rolesRes.status === "fulfilled" && Array.isArray(rolesRes.value)) {
        setRoles(rolesRes.value);
        if (rolesRes.value.length > 0 && !newMemberRoleId) {
          setNewMemberRoleId(rolesRes.value[0]?.id || "");
        }
      }
    } catch {
      setPageError("Failed to load organization data.");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, newMemberRoleId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Edit Organization Name
  const handleUpdateOrgName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !editOrgName.trim()) return;

    setIsSubmitting(true);
    setModalError(null);

    try {
      const updated = await apiClient.patch<OrganizationProfile>(
        API_ENDPOINTS.organizations.current,
        { name: editOrgName.trim() },
        { organizationId: currentOrganization.id }
      );
      setProfile(updated);
      setSuccessMessage("Organization name updated successfully.");
      setIsEditOrgOpen(false);
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to update organization name.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Branch
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !newBranchName.trim() || !newBranchCode.trim()) {
      setModalError("Branch name and code are required.");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const payload: BranchCreate = {
        name: newBranchName.trim(),
        code: newBranchCode.trim().toUpperCase(),
        address: newBranchAddress.trim() || null,
        is_active: true,
      };

      await apiClient.post(API_ENDPOINTS.organizations.currentBranches, payload, {
        organizationId: currentOrganization.id,
      });

      setSuccessMessage(`Branch '${newBranchName.trim()}' created successfully.`);
      setIsCreateBranchOpen(false);
      setNewBranchName("");
      setNewBranchCode("");
      setNewBranchAddress("");
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to create branch.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Department
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !newDeptName.trim() || !newDeptCode.trim()) {
      setModalError("Department name and code are required.");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const payload: DepartmentCreate = {
        name: newDeptName.trim(),
        code: newDeptCode.trim().toUpperCase(),
        description: newDeptDesc.trim() || null,
        is_active: true,
      };

      await apiClient.post(API_ENDPOINTS.departments.list, payload, {
        organizationId: currentOrganization.id,
      });

      setSuccessMessage(`Department '${newDeptName.trim()}' created successfully.`);
      setIsCreateDeptOpen(false);
      setNewDeptName("");
      setNewDeptCode("");
      setNewDeptDesc("");
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to create department.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !newMemberEmail.trim()) {
      setModalError("Registered user email is required.");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.organizations.currentMembers,
        {
          email: newMemberEmail.trim().toLowerCase(),
          role_ids: newMemberRoleId ? [newMemberRoleId] : [],
          status: "active",
        },
        { organizationId: currentOrganization.id }
      );

      setSuccessMessage(`Member '${newMemberEmail.trim()}' added successfully.`);
      setIsAddMemberOpen(false);
      setNewMemberEmail("");
      fetchData();
    } catch (err) {
      if (err instanceof ApiException) {
        setModalError(err.message);
      } else {
        setModalError("Failed to add member. Ensure the user has registered in OfficeOS.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered lists
  const filteredBranches = React.useMemo(() => {
    if (!branchSearch.trim()) return branches;
    const q = branchSearch.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q));
  }, [branches, branchSearch]);

  const filteredDepartments = React.useMemo(() => {
    if (!deptSearch.trim()) return departments;
    const q = deptSearch.toLowerCase();
    return departments.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q));
  }, [departments, deptSearch]);

  const filteredMembers = React.useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter((m) => {
      const email = m.profile?.email?.toLowerCase() || "";
      const name = `${m.profile?.first_name || ""} ${m.profile?.last_name || ""}`.toLowerCase();
      return email.includes(q) || name.includes(q);
    });
  }, [members, memberSearch]);

  // Permission Guard
  if (!canViewOrg) {
    return (
      <div className="p-8">
        <ErrorState
          title="Access Denied"
          message="You do not have permission to view organization structure."
        />
      </div>
    );
  }

  // Loading state
  if (isOrgLoading || (isLoading && !profile)) {
    return (
      <div className="p-8">
        <LoadingState message="Loading organization structure..." />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Notifications */}
      {successMessage && (
        <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs text-emerald-600 hover:text-emerald-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {pageError && (
        <div className="rounded-lg bg-rose-50 p-4 border border-rose-200 text-rose-800 text-sm flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            <span>{pageError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPageError(null)}
            className="text-xs text-rose-600 hover:text-rose-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
              Corporate Hierarchy
            </span>
            <Badge variant="success" className="text-[10px] capitalize">
              Active Tenant
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary-600" />
            <span>{profile?.name || currentOrganization?.name || "Organization Overview"}</span>
            {canUpdateOrg && (
              <button
                type="button"
                onClick={() => {
                  setEditOrgName(profile?.name || currentOrganization?.name || "");
                  setIsEditOrgOpen(true);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                title="Edit Organization Name"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            )}
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Multi-tenant corporate workspace, workplace branch locations, business departments, and member access controls.
          </p>
        </div>

        {/* Quick Links */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={ROUTES.SETTINGS_ORGANIZATION}>
            <Button variant="outline" size="sm" className="gap-1.5 shadow-sm">
              <Settings className="h-4 w-4 text-slate-500" />
              Settings
            </Button>
          </Link>
          <Link href={ROUTES.SETTINGS_ORGANIZATION_BRANCHES}>
            <Button variant="outline" size="sm" className="gap-1.5 shadow-sm">
              <MapPin className="h-4 w-4 text-slate-500" />
              Manage Branches
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Statistic Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Branches */}
        <Card className="shadow-sm border-slate-200 hover:border-slate-300 transition-colors">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Branches</span>
              <MapPin className="h-4 w-4 text-primary-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{branches.length}</div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <span className="text-emerald-600 font-medium">
                {branches.filter((b) => b.is_active).length} Active
              </span>
              <span>locations</span>
            </div>
          </CardContent>
        </Card>

        {/* Departments */}
        <Card className="shadow-sm border-slate-200 hover:border-slate-300 transition-colors">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Departments</span>
              <FolderTree className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{departments.length}</div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <span className="text-emerald-600 font-medium">
                {departments.filter((d) => d.is_active).length} Active
              </span>
              <span>units</span>
            </div>
          </CardContent>
        </Card>

        {/* Members */}
        <Card className="shadow-sm border-slate-200 hover:border-slate-300 transition-colors">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Members</span>
              <Users className="h-4 w-4 text-violet-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{members.length}</div>
            <div className="text-[11px] text-slate-400">
              <span>{roles.length} Access Roles</span>
            </div>
          </CardContent>
        </Card>

        {/* Currency & Timezone */}
        <Card className="shadow-sm border-slate-200 hover:border-slate-300 transition-colors">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Locale & Currency</span>
              <Coins className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-lg font-bold text-slate-900 truncate">
              {settings?.currency || "USD"} • {settings?.timezone || "UTC"}
            </div>
            <div className="text-[11px] text-slate-400">
              <span>Standard Org Configuration</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 overflow-x-auto space-x-1">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "overview"
              ? "border-primary-600 text-primary-600 bg-primary-50/50 rounded-t-md"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Overview & Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("branches")}
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "branches"
              ? "border-primary-600 text-primary-600 bg-primary-50/50 rounded-t-md"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <MapPin className="h-4 w-4" />
          Branches ({branches.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("departments")}
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "departments"
              ? "border-primary-600 text-primary-600 bg-primary-50/50 rounded-t-md"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FolderTree className="h-4 w-4" />
          Departments ({departments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("members")}
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "members"
              ? "border-primary-600 text-primary-600 bg-primary-50/50 rounded-t-md"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="h-4 w-4" />
          Members ({members.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Corporate Profile Details */}
            <Card className="shadow-sm border-slate-200">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary-600" />
                  <span className="font-semibold text-sm text-slate-900">Corporate Entity Details</span>
                </div>
                <Badge variant="outline" className="text-[11px]">
                  ID: {profile?.id ? `${profile.id.slice(0, 8)}...` : "N/A"}
                </Badge>
              </div>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Legal Name</span>
                    <span className="font-semibold text-slate-800 text-sm">
                      {profile?.name || currentOrganization?.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Corporate Slug</span>
                    <span className="font-mono text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                      {profile?.slug || currentOrganization?.slug}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Operating Timezone</span>
                    <span className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {settings?.timezone || "UTC"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Currency</span>
                    <span className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Coins className="h-3.5 w-3.5 text-slate-400" />
                      {settings?.currency || "USD"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Created Date</span>
                    <span className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Status</span>
                    <Badge variant="success">Active Workspace</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tenant Isolation & Security Status */}
            <Card className="shadow-sm border-slate-200">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-sm text-slate-900">Tenant Isolation & Security</span>
                </div>
                <Badge variant="success" className="text-[10px]">
                  Verified
                </Badge>
              </div>
              <CardContent className="p-5 space-y-4 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  All employees, attendance logs, leave balances, projects, and assets are strictly partitioned under organization ID <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] font-mono">{currentOrganization?.id}</code>.
                </p>

                <div className="rounded-lg bg-slate-50 p-3 space-y-2 border border-slate-200">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Row-Level Security (RLS) Active</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Role-Based Access Control (RBAC) Enforced</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Cross-Tenant Leakage Prevention Guardrails Active</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Configured for multi-org SaaS operation</span>
                  <Link href={ROUTES.SETTINGS_ORGANIZATION} className="text-primary-600 hover:text-primary-800 font-semibold inline-flex items-center gap-1">
                    Manage Settings <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: BRANCHES */}
      {activeTab === "branches" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search branches by name or code..."
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            {canManageBranches && (
              <Button size="sm" onClick={() => setIsCreateBranchOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Branch
              </Button>
            )}
          </div>

          {filteredBranches.length === 0 ? (
            <EmptyState
              title="No branches found"
              description={branchSearch ? "No branches match your search query." : "No branches configured yet."}
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Branch Name</th>
                    <th className="px-5 py-3">Code</th>
                    <th className="px-5 py-3">Physical Address</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBranches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900 flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-primary-600 flex-shrink-0" />
                        <span>{b.name}</span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-600">{b.code}</td>
                      <td className="px-5 py-3.5 text-slate-500">{b.address || "—"}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={b.is_active ? "success" : "secondary"}>
                          {b.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DEPARTMENTS */}
      {activeTab === "departments" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search departments by name or code..."
                value={deptSearch}
                onChange={(e) => setDeptSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            {canManageDepts && (
              <Button size="sm" onClick={() => setIsCreateDeptOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Department
              </Button>
            )}
          </div>

          {filteredDepartments.length === 0 ? (
            <EmptyState
              title="No departments found"
              description={deptSearch ? "No departments match your search query." : "No departments configured yet."}
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Department</th>
                    <th className="px-5 py-3">Code</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDepartments.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900 flex items-center gap-2">
                        <FolderTree className="h-3.5 w-3.5 text-indigo-600 flex-shrink-0" />
                        <span>{d.name}</span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-600">{d.code}</td>
                      <td className="px-5 py-3.5 text-slate-500">{d.description || "—"}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={d.is_active ? "success" : "secondary"}>
                          {d.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MEMBERS */}
      {activeTab === "members" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search members by email or name..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            {canManageMembers && (
              <Button size="sm" onClick={() => setIsAddMemberOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Member
              </Button>
            )}
          </div>

          {filteredMembers.length === 0 ? (
            <EmptyState
              title="No members found"
              description={memberSearch ? "No members match your search query." : "No members found in this organization."}
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Roles</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((m) => {
                    const fullName = `${m.profile?.first_name || ""} ${m.profile?.last_name || ""}`.trim() || "User";
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-slate-900 flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs">
                            {fullName.charAt(0).toUpperCase()}
                          </div>
                          <span>{fullName}</span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-600">{m.profile?.email || "—"}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            {m.roles && m.roles.length > 0 ? (
                              m.roles.map((r) => (
                                <Badge key={r.id} variant="default" className="text-[10px] capitalize">
                                  {r.name.replace("_", " ")}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Member
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={m.status === "active" ? "success" : "secondary"} className="capitalize">
                            {m.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Edit Organization Name */}
      <Modal
        isOpen={isEditOrgOpen}
        onClose={() => setIsEditOrgOpen(false)}
        title="Edit Organization Name"
        description="Update the primary display name for this organization."
      >
        <form onSubmit={handleUpdateOrgName} className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          <div>
            <Label htmlFor="edit-org-name">Organization Name</Label>
            <Input
              id="edit-org-name"
              value={editOrgName}
              onChange={(e) => setEditOrgName(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsEditOrgOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Create Branch */}
      <Modal
        isOpen={isCreateBranchOpen}
        onClose={() => setIsCreateBranchOpen(false)}
        title="Add New Branch"
        description="Add a physical location or corporate workplace branch."
      >
        <form onSubmit={handleCreateBranch} className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          <div>
            <Label htmlFor="new-branch-name">Branch Name</Label>
            <Input
              id="new-branch-name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="e.g. Headquarters"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="new-branch-code">Branch Code</Label>
            <Input
              id="new-branch-code"
              value={newBranchCode}
              onChange={(e) => setNewBranchCode(e.target.value)}
              placeholder="e.g. HQ"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="new-branch-address">Address (Optional)</Label>
            <Input
              id="new-branch-address"
              value={newBranchAddress}
              onChange={(e) => setNewBranchAddress(e.target.value)}
              placeholder="e.g. 100 Main Street, Suite 400"
              className="mt-1"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsCreateBranchOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Branch"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Create Department */}
      <Modal
        isOpen={isCreateDeptOpen}
        onClose={() => setIsCreateDeptOpen(false)}
        title="Add Department"
        description="Add a functional department or business unit."
      >
        <form onSubmit={handleCreateDepartment} className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          <div>
            <Label htmlFor="new-dept-name">Department Name</Label>
            <Input
              id="new-dept-name"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              placeholder="e.g. Engineering & Technology"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="new-dept-code">Department Code</Label>
            <Input
              id="new-dept-code"
              value={newDeptCode}
              onChange={(e) => setNewDeptCode(e.target.value)}
              placeholder="e.g. ENG"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="new-dept-desc">Description (Optional)</Label>
            <Input
              id="new-dept-desc"
              value={newDeptDesc}
              onChange={(e) => setNewDeptDesc(e.target.value)}
              placeholder="e.g. Software, infrastructure, and QA operations"
              className="mt-1"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsCreateDeptOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Department"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: Add Member */}
      <Modal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        title="Add Organization Member"
        description="Add an existing registered OfficeOS user to this organization."
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          {modalError && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}
          <div>
            <Label htmlFor="new-member-email">User Email</Label>
            <Input
              id="new-member-email"
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="new-member-role">Assign Role</Label>
            <select
              id="new-member-role"
              value={newMemberRoleId}
              onChange={(e) => setNewMemberRoleId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-sm focus:border-primary-500 focus:outline-none mt-1"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name.replace("_", " ").toUpperCase()} {r.description ? `— ${r.description}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsAddMemberOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Member"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
