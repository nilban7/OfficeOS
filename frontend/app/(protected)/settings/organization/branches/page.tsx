"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Plus,
  Edit2,
  PowerOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Calendar,
  Sliders,
  Check,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
  BranchResponse,
  BranchCreate,
  BranchUpdate,
} from "@/types/organization";

export default function OrganizationBranchesPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canView = permissions.includes("branches.view");
  const canManage = permissions.includes("branches.manage");

  // State: Branches
  const [branches, setBranches] = React.useState<BranchResponse[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = React.useState(false);
  const [showInactive, setShowInactive] = React.useState(true);
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // State: Create Modal
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createCode, setCreateCode] = React.useState("");
  const [createAddress, setCreateAddress] = React.useState("");
  const [createIsActive, setCreateIsActive] = React.useState(true);
  const [isCreating, setIsCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // State: Edit Modal
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingBranch, setEditingBranch] = React.useState<BranchResponse | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editCode, setEditCode] = React.useState("");
  const [editAddress, setEditAddress] = React.useState("");
  const [editIsActive, setEditIsActive] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  // State: Deactivate Modal
  const [isDeactivateOpen, setIsDeactivateOpen] = React.useState(false);
  const [deactivatingBranch, setDeactivatingBranch] = React.useState<BranchResponse | null>(null);
  const [isDeactivating, setIsDeactivating] = React.useState(false);
  const [deactivateError, setDeactivateError] = React.useState<string | null>(null);

  // Fetch branches from API
  const loadBranches = React.useCallback(async () => {
    if (!currentOrganization?.id || !canView) return;

    setIsLoadingBranches(true);
    setGlobalError(null);

    try {
      const data = await apiClient.get<BranchResponse[]>(
        API_ENDPOINTS.organizations.currentBranches,
        {
          organizationId: currentOrganization.id,
          params: { include_inactive: showInactive },
        }
      );
      setBranches(data || []);
    } catch (err) {
      const msg =
        err instanceof ApiException
          ? err.message
          : "Failed to load organization branches. Please try again.";
      setGlobalError(msg);
    } finally {
      setIsLoadingBranches(false);
    }
  }, [currentOrganization?.id, canView, showInactive]);

  React.useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  // Handle Create Branch
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !canManage) return;

    const trimmedName = createName.trim();
    const trimmedCode = createCode.trim().toUpperCase();
    const trimmedAddress = createAddress.trim();

    if (trimmedName.length < 2 || trimmedName.length > 160) {
      setCreateError("Branch name must be between 2 and 160 characters.");
      return;
    }

    if (trimmedCode.length < 1 || trimmedCode.length > 32) {
      setCreateError("Branch code must be between 1 and 32 characters.");
      return;
    }

    if (trimmedAddress.length > 500) {
      setCreateError("Address cannot exceed 500 characters.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const payload: BranchCreate = {
        name: trimmedName,
        code: trimmedCode,
        address: trimmedAddress || null,
        is_active: createIsActive,
      };

      await apiClient.post<BranchResponse>(
        API_ENDPOINTS.organizations.currentBranches,
        payload,
        { organizationId: currentOrganization.id }
      );

      setIsCreateOpen(false);
      setCreateName("");
      setCreateCode("");
      setCreateAddress("");
      setCreateIsActive(true);
      setSuccessMessage(`Branch "${trimmedName}" created successfully.`);
      await loadBranches();
    } catch (err) {
      if (err instanceof ApiException) {
        if (err.status === 409) {
          setCreateError(`Branch code "${trimmedCode}" is already in use for this organization.`);
        } else if (err.status === 403) {
          setCreateError("Permission denied: You do not have 'branches.manage' permission.");
        } else if (err.status === 422) {
          setCreateError(`Validation error: ${err.message}`);
        } else {
          setCreateError(err.message || "Failed to create branch.");
        }
      } else {
        setCreateError("An unexpected error occurred while creating branch.");
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (branch: BranchResponse) => {
    setEditingBranch(branch);
    setEditName(branch.name);
    setEditCode(branch.code);
    setEditAddress(branch.address || "");
    setEditIsActive(branch.is_active);
    setEditError(null);
    setIsEditOpen(true);
  };

  // Handle Edit Branch Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !editingBranch || !canManage) return;

    const trimmedName = editName.trim();
    const trimmedCode = editCode.trim().toUpperCase();
    const trimmedAddress = editAddress.trim();

    if (trimmedName.length < 2 || trimmedName.length > 160) {
      setEditError("Branch name must be between 2 and 160 characters.");
      return;
    }

    if (trimmedCode.length < 1 || trimmedCode.length > 32) {
      setEditError("Branch code must be between 1 and 32 characters.");
      return;
    }

    if (trimmedAddress.length > 500) {
      setEditError("Address cannot exceed 500 characters.");
      return;
    }

    setIsEditing(true);
    setEditError(null);

    try {
      const payload: BranchUpdate = {
        name: trimmedName,
        code: trimmedCode,
        address: trimmedAddress || null,
        is_active: editIsActive,
      };

      await apiClient.patch<BranchResponse>(
        API_ENDPOINTS.organizations.currentBranch(editingBranch.id),
        payload,
        { organizationId: currentOrganization.id }
      );

      setIsEditOpen(false);
      setEditingBranch(null);
      setSuccessMessage(`Branch "${trimmedName}" updated successfully.`);
      await loadBranches();
    } catch (err) {
      if (err instanceof ApiException) {
        if (err.status === 409) {
          setEditError(`Branch code "${trimmedCode}" is already in use for another branch.`);
        } else if (err.status === 403) {
          setEditError("Permission denied: You do not have 'branches.manage' permission.");
        } else if (err.status === 422) {
          setEditError(`Validation error: ${err.message}`);
        } else {
          setEditError(err.message || "Failed to update branch.");
        }
      } else {
        setEditError("An unexpected error occurred while updating branch.");
      }
    } finally {
      setIsEditing(false);
    }
  };

  // Open Deactivate Modal
  const openDeactivateModal = (branch: BranchResponse) => {
    setDeactivatingBranch(branch);
    setDeactivateError(null);
    setIsDeactivateOpen(true);
  };

  // Handle Deactivate Submit
  const handleDeactivateSubmit = async () => {
    if (!currentOrganization?.id || !deactivatingBranch || !canManage) return;

    setIsDeactivating(true);
    setDeactivateError(null);

    try {
      await apiClient.delete<BranchResponse>(
        API_ENDPOINTS.organizations.currentBranch(deactivatingBranch.id),
        { organizationId: currentOrganization.id }
      );

      setIsDeactivateOpen(false);
      setSuccessMessage(`Branch "${deactivatingBranch.name}" has been deactivated.`);
      setDeactivatingBranch(null);
      await loadBranches();
    } catch (err) {
      if (err instanceof ApiException) {
        if (err.status === 403) {
          setDeactivateError("Permission denied: You lack 'branches.manage' permission.");
        } else {
          setDeactivateError(err.message || "Failed to deactivate branch.");
        }
      } else {
        setDeactivateError("An unexpected error occurred while deactivating branch.");
      }
    } finally {
      setIsDeactivating(false);
    }
  };

  // Loading State
  if (isOrgLoading || (isLoadingBranches && branches.length === 0)) {
    return <LoadingState fullPage message="Loading organization branches..." />;
  }

  // No Selected Organization State
  if (!currentOrganization) {
    return (
      <EmptyState
        title="No Organization Selected"
        description="Please select an active organization from the top switcher to manage its branches."
        icon={Building2}
      />
    );
  }

  // Missing branches.view Permission State
  if (!canView) {
    return (
      <ErrorState
        title="Access Denied"
        message="You do not have permission to view organization branches (requires 'branches.view'). Please contact your administrator."
        errorCode="403_FORBIDDEN"
      />
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            <span>Settings</span>
            <span>/</span>
            <span>Organization</span>
            <span>/</span>
            <span className="text-primary-600">Branches</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Branch Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage physical and operational offices, locations, and branch codes for{" "}
            <span className="font-semibold text-slate-700">{currentOrganization.name}</span>.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadBranches}
            isLoading={isLoadingBranches}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>

          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setCreateName("");
                setCreateCode("");
                setCreateAddress("");
                setCreateIsActive(true);
                setCreateError(null);
                setIsCreateOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Branch
            </Button>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3 text-sm font-medium">
        <Link
          href={ROUTES.SETTINGS_ORGANIZATION}
          className="rounded-lg px-3 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center space-x-2"
        >
          <Sliders className="h-4 w-4 text-slate-400" />
          <span>Profile & Settings</span>
        </Link>
        <Link
          href={ROUTES.SETTINGS_ORGANIZATION_BRANCHES}
          className="rounded-lg bg-primary-50 px-3 py-1.5 text-primary-700 font-semibold shadow-sm flex items-center space-x-2"
        >
          <Building2 className="h-4 w-4 text-primary-600" />
          <span>Branches</span>
        </Link>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          className="flex items-center justify-between rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200 animate-in fade-in-50"
          role="status"
        >
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Global Error Notification */}
      {globalError && (
        <div
          className="flex items-center space-x-2.5 rounded-lg bg-red-50 p-4 text-sm text-red-800 border border-red-200"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{globalError}</span>
        </div>
      )}

      {/* Main Content Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Organization Branches</CardTitle>
              <CardDescription>
                List of registered locations and office branches.
              </CardDescription>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-3.5 w-3.5"
                />
                <span>Include Inactive Branches</span>
              </label>

              {!canManage && (
                <Badge variant="secondary">Read-Only Mode</Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {branches.length === 0 ? (
            <EmptyState
              title="No Branches Configured"
              description="No office branches have been added for this organization yet."
              icon={Building2}
              actionLabel={canManage ? "Create First Branch" : undefined}
              onAction={() => {
                setCreateName("");
                setCreateCode("");
                setCreateAddress("");
                setCreateIsActive(true);
                setCreateError(null);
                setIsCreateOpen(true);
              }}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm text-slate-700 divide-y divide-slate-200">
                <thead className="bg-slate-50/75 text-xs uppercase font-semibold text-slate-500 tracking-wider">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Branch Name
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Code
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Address
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Created
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {branches.map((branch) => (
                    <tr
                      key={branch.id}
                      className={!branch.is_active ? "bg-slate-50/50 opacity-75" : "hover:bg-slate-50/75"}
                    >
                      <td className="px-4 py-3.5 font-medium text-slate-900">
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`p-1.5 rounded-md ${
                              branch.is_active
                                ? "bg-primary-50 text-primary-600"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            <Building2 className="h-4 w-4" />
                          </div>
                          <span>{branch.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                          {branch.code}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 max-w-xs truncate">
                        {branch.address ? (
                          <span className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">{branch.address}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None specified</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {branch.is_active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="warning">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        <span className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>
                            {new Date(branch.created_at).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center space-x-1.5 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canManage}
                            onClick={() => openEditModal(branch)}
                            className="h-8 px-2 text-xs"
                            title={canManage ? "Edit Branch" : "Requires branches.manage permission"}
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>

                          {branch.is_active && canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeactivateModal(branch)}
                              className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              title="Deactivate Branch"
                            >
                              <PowerOff className="h-3.5 w-3.5 mr-1" />
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security & Multi-Tenant Isolation Footer Card */}
      <Card className="bg-slate-50/50 border-slate-200">
        <CardContent className="p-6">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-white border border-slate-200 text-primary-600 shadow-sm mt-0.5">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-900">
                Tenant-Scoped Branch Governance
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Branches are strictly isolated to the active organization (<code className="font-mono text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200">X-Organization-Id</code>). Branch code uniqueness is enforced per-organization. Deactivating a branch retains historical transaction records while preventing future operational assignments.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CREATE BRANCH MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => !isCreating && setIsCreateOpen(false)}
        title="Add New Branch"
        description="Create a new physical or operational office branch."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div
              className="flex items-center space-x-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 border border-red-200"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{createError}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="create-branch-name" required>
              Branch Name
            </Label>
            <Input
              id="create-branch-name"
              placeholder="e.g. Headquarters - New York"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              disabled={isCreating}
              helperText="Between 2 and 160 characters."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-branch-code" required>
              Branch Code
            </Label>
            <Input
              id="create-branch-code"
              placeholder="e.g. HQ-NY"
              value={createCode}
              onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
              disabled={isCreating}
              helperText="Unique branch identifier (1 to 32 characters, uppercase)."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-branch-address">Address</Label>
            <textarea
              id="create-branch-address"
              rows={3}
              placeholder="e.g. 100 Broadway, New York, NY 10005"
              value={createAddress}
              onChange={(e) => setCreateAddress(e.target.value)}
              disabled={isCreating}
              className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 transition-colors"
            />
            <p className="text-xs text-slate-500">Physical address (max 500 characters).</p>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              id="create-is-active"
              type="checkbox"
              checked={createIsActive}
              onChange={(e) => setCreateIsActive(e.target.checked)}
              disabled={isCreating}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
            />
            <Label htmlFor="create-is-active" className="cursor-pointer text-xs font-normal">
              Activate branch immediately upon creation
            </Label>
          </div>

          <div className="flex items-center justify-end space-x-2.5 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isCreating}>
              <Check className="mr-1.5 h-4 w-4" />
              Create Branch
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT BRANCH MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => !isEditing && setIsEditOpen(false)}
        title="Edit Branch"
        description="Update branch details and operational status."
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div
              className="flex items-center space-x-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 border border-red-200"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{editError}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-branch-name" required>
              Branch Name
            </Label>
            <Input
              id="edit-branch-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={isEditing}
              helperText="Between 2 and 160 characters."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-branch-code" required>
              Branch Code
            </Label>
            <Input
              id="edit-branch-code"
              value={editCode}
              onChange={(e) => setEditCode(e.target.value.toUpperCase())}
              disabled={isEditing}
              helperText="Unique branch identifier (1 to 32 characters, uppercase)."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-branch-address">Address</Label>
            <textarea
              id="edit-branch-address"
              rows={3}
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              disabled={isEditing}
              className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 transition-colors"
            />
            <p className="text-xs text-slate-500">Physical address (max 500 characters).</p>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              id="edit-is-active"
              type="checkbox"
              checked={editIsActive}
              onChange={(e) => setEditIsActive(e.target.checked)}
              disabled={isEditing}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
            />
            <Label htmlFor="edit-is-active" className="cursor-pointer text-xs font-normal">
              Active status
            </Label>
          </div>

          <div className="flex items-center justify-end space-x-2.5 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(false)}
              disabled={isEditing}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isEditing}>
              <Check className="mr-1.5 h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* DEACTIVATE BRANCH CONFIRMATION MODAL */}
      <Modal
        isOpen={isDeactivateOpen}
        onClose={() => !isDeactivating && setIsDeactivateOpen(false)}
        title="Deactivate Branch"
        description="Confirm soft deactivation of this office location."
      >
        <div className="space-y-4">
          {deactivateError && (
            <div
              className="flex items-center space-x-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 border border-red-200"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{deactivateError}</span>
            </div>
          )}

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 space-y-2">
            <p className="font-semibold text-sm text-amber-950 flex items-center">
              <PowerOff className="h-4 w-4 mr-1.5 text-amber-600" />
              Deactivate {deactivatingBranch?.name} ({deactivatingBranch?.code})
            </p>
            <p className="leading-relaxed">
              Deactivating this branch disables active assignment and operations while preserving historical data and audit records. This does <strong>not</strong> physically delete any records from the database.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2.5 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeactivateOpen(false)}
              disabled={isDeactivating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              isLoading={isDeactivating}
              onClick={handleDeactivateSubmit}
            >
              <PowerOff className="mr-1.5 h-4 w-4" />
              Deactivate Branch
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
