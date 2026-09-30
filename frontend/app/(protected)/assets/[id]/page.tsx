"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  ShieldAlert,
  Edit2,
  Trash2,
  UserCheck,
  RotateCcw,
  DollarSign,
  Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type {
  AssetAssignPayload,
  AssetAssignment,
  AssetCondition,
  AssetDetail,
  AssetReturnPayload,
  AssetStatus,
  AssetUpdatePayload,
} from "@/types/asset";
import type { Employee, EmployeeListResponse } from "@/types/employee";

const STATUS_CONFIG: Record<AssetStatus, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  assigned: { label: "Assigned", className: "bg-blue-50 text-blue-700 border-blue-200" },
  under_maintenance: { label: "In Maintenance", className: "bg-amber-50 text-amber-700 border-amber-200" },
  lost: { label: "Lost", className: "bg-red-50 text-red-700 border-red-200" },
  retired: { label: "Retired", className: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  disposed: { label: "Disposed", className: "bg-neutral-200 text-neutral-800 border-neutral-400" },
};

const CONDITION_CONFIG: Record<AssetCondition, { label: string; className: string }> = {
  new: { label: "New", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  good: { label: "Good", className: "bg-blue-50 text-blue-700 border-blue-200" },
  fair: { label: "Fair", className: "bg-amber-50 text-amber-700 border-amber-200" },
  poor: { label: "Poor", className: "bg-orange-50 text-orange-700 border-orange-200" },
  damaged: { label: "Damaged", className: "bg-red-50 text-red-700 border-red-200" },
};

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assetId = params?.id;

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canUpdateAssets = permissions.includes("assets.update");
  const canDeleteAssets = permissions.includes("assets.delete");
  const canAssignAssets = permissions.includes("assets.assign");
  const canReturnAssets = permissions.includes("assets.return");

  // State
  const [asset, setAsset] = React.useState<AssetDetail | null>(null);
  const [assignments, setAssignments] = React.useState<AssetAssignment[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Alerts
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Forms
  const [editForm, setEditForm] = React.useState<AssetUpdatePayload>({});
  const [assignForm, setAssignForm] = React.useState<AssetAssignPayload>({
    employee_id: "",
    assigned_date: new Date().toISOString().split("T")[0],
    assignment_notes: "",
  });
  const [returnForm, setReturnForm] = React.useState<AssetReturnPayload>({
    returned_date: new Date().toISOString().split("T")[0],
    return_notes: "",
    condition: "good",
    status: "available",
  });

  const fetchAssetDetails = React.useCallback(async () => {
    if (!currentOrganization || !assetId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [assetRes, asgnsRes] = await Promise.all([
        apiClient.get<AssetDetail>(API_ENDPOINTS.assets.detail(assetId)),
        apiClient.get<{ items: AssetAssignment[] }>(API_ENDPOINTS.assets.assignments(assetId)),
      ]);

      setAsset(assetRes);
      setAssignments(asgnsRes.items || []);
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load asset details.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, assetId]);

  const fetchDependencies = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const empRes = await apiClient.get<EmployeeListResponse>(API_ENDPOINTS.employees.list, {
        params: { page_size: 100 },
      });
      setEmployees(empRes.items || []);
    } catch {
      // Non-blocking
    }
  }, [currentOrganization]);

  React.useEffect(() => {
    if (currentOrganization && assetId) {
      fetchAssetDetails();
      fetchDependencies();
    }
  }, [currentOrganization, assetId, fetchAssetDetails, fetchDependencies]);

  // Handle Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: AssetUpdatePayload = {
        ...editForm,
        purchase_cost: editForm.purchase_cost ? Number(editForm.purchase_cost) : undefined,
        vendor_id: editForm.vendor_id || undefined,
        purchase_date: editForm.purchase_date || undefined,
        warranty_start_date: editForm.warranty_start_date || undefined,
        warranty_end_date: editForm.warranty_end_date || undefined,
      };

      await apiClient.patch(API_ENDPOINTS.assets.update(asset.id), payload);
      setSuccessMessage("Asset updated successfully.");
      setIsEditModalOpen(false);
      fetchAssetDetails();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update asset.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Assign
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || !assignForm.employee_id) {
      setFormError("Please select an employee to assign.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.assets.assign(asset.id), assignForm);
      setSuccessMessage("Asset assigned successfully.");
      setIsAssignModalOpen(false);
      setAssignForm({
        employee_id: "",
        assigned_date: new Date().toISOString().split("T")[0],
        assignment_notes: "",
      });
      fetchAssetDetails();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to assign asset.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Return
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.assets.return(asset.id), returnForm);
      setSuccessMessage("Asset return recorded successfully.");
      setIsReturnModalOpen(false);
      fetchAssetDetails();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to record return.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete
  const handleDeleteSubmit = async () => {
    if (!asset) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.delete(API_ENDPOINTS.assets.delete(asset.id));
      router.push("/assets");
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to delete asset.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading asset profile..." />;
  }

  if (error || !asset) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-4">
        <Link href="/assets">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Assets
          </Button>
        </Link>
        <ErrorState
          title="Asset Not Found"
          message={error || "The requested asset record does not exist or you do not have permission to view it."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/assets">
            <Button variant="ghost" size="sm" className="gap-1.5 text-neutral-600">
              <ArrowLeft className="h-4 w-4" /> Assets
            </Button>
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="font-mono text-sm font-semibold text-neutral-900">{asset.asset_code}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Assign */}
          {canAssignAssets && asset.status === "available" && (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              onClick={() => {
                setFormError(null);
                setIsAssignModalOpen(true);
              }}
            >
              <UserCheck className="h-4 w-4" />
              Assign Asset
            </Button>
          )}

          {/* Quick Return */}
          {canReturnAssets && asset.status === "assigned" && (
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              onClick={() => {
                setFormError(null);
                setIsReturnModalOpen(true);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Process Return
            </Button>
          )}

          {/* Edit */}
          {canUpdateAssets && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditForm({
                  name: asset.name,
                  category: asset.category,
                  description: asset.description || "",
                  serial_number: asset.serial_number || "",
                  model: asset.model || "",
                  manufacturer: asset.manufacturer || "",
                  vendor_id: asset.vendor_id || undefined,
                  purchase_date: asset.purchase_date || "",
                  purchase_cost: asset.purchase_cost ?? undefined,
                  currency: asset.currency,
                  warranty_start_date: asset.warranty_start_date || "",
                  warranty_end_date: asset.warranty_end_date || "",
                  status: asset.status,
                  condition: asset.condition,
                  location: asset.location || "",
                  notes: asset.notes || "",
                });
                setFormError(null);
                setIsEditModalOpen(true);
              }}
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </Button>
          )}

          {/* Delete */}
          {canDeleteAssets && asset.status !== "assigned" && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
              onClick={() => {
                setFormError(null);
                setIsDeleteModalOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-between text-sm shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Asset Header Card */}
      <Card className="border-neutral-200 shadow-sm bg-white">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm px-2.5 py-1 bg-neutral-100 text-neutral-800 rounded font-bold">
                  {asset.asset_code}
                </span>
                <Badge variant="outline" className={STATUS_CONFIG[asset.status]?.className}>
                  {STATUS_CONFIG[asset.status]?.label || asset.status}
                </Badge>
                <Badge variant="outline" className={CONDITION_CONFIG[asset.condition]?.className}>
                  Condition: {CONDITION_CONFIG[asset.condition]?.label || asset.condition}
                </Badge>
              </div>
              <h1 className="text-2xl font-bold text-neutral-900 mt-2">{asset.name}</h1>
              {asset.description && <p className="text-sm text-neutral-600">{asset.description}</p>}
            </div>

            {/* Custodian Snapshot */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 min-w-[260px]">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Current Custodian
              </span>
              {asset.current_custodian ? (
                <div className="mt-2 flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                    {asset.current_custodian.first_name[0]}
                    {asset.current_custodian.last_name[0]}
                  </div>
                  <div>
                    <div className="font-medium text-sm text-neutral-900">
                      {asset.current_custodian.first_name} {asset.current_custodian.last_name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {asset.current_custodian.designation || asset.current_custodian.employee_code}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-neutral-500 italic">No custodian assigned</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Specifications & Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Specifications */}
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-neutral-900 flex items-center gap-2 text-sm">
              <Box className="h-4 w-4 text-indigo-600" /> Specifications
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Category</span>
                <span className="font-medium capitalize">{asset.category.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Manufacturer</span>
                <span className="font-medium">{asset.manufacturer || "-"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Model</span>
                <span className="font-medium">{asset.model || "-"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Serial Number</span>
                <span className="font-mono text-xs">{asset.serial_number || "-"}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-500">Location</span>
                <span className="font-medium">{asset.location || "-"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchase & Financials */}
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-neutral-900 flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-emerald-600" /> Purchase & Vendor
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Purchase Cost</span>
                <span className="font-medium">
                  {asset.purchase_cost != null
                    ? `${asset.currency} ${Number(asset.purchase_cost).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}`
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Purchase Date</span>
                <span className="font-medium">{asset.purchase_date || "-"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Vendor</span>
                <span className="font-medium">
                  {asset.vendor ? `${asset.vendor.name} (${asset.vendor.vendor_code})` : "-"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-500">Purchase Order</span>
                <span className="font-medium">{asset.purchase_order?.po_number || "-"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Warranty & Branch */}
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-neutral-900 flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-blue-600" /> Warranty & Branch
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Warranty Start</span>
                <span className="font-medium">{asset.warranty_start_date || "-"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Warranty End</span>
                <span className="font-medium">{asset.warranty_end_date || "-"}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-500">Branch</span>
                <span className="font-medium">{asset.branch ? asset.branch.name : "Headquarters"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignment History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-indigo-600" /> Assignment History
          </h2>
          <span className="text-xs text-neutral-500">{assignments.length} total assignments recorded</span>
        </div>

        {assignments.length === 0 ? (
          <Card className="border-neutral-200 p-8 text-center bg-neutral-50/50">
            <p className="text-sm text-neutral-500">No assignment history recorded for this asset.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 font-medium text-neutral-600">
                <tr>
                  <th className="px-4 py-3 text-left">Assigned Employee</th>
                  <th className="px-4 py-3 text-left">Assigned Date</th>
                  <th className="px-4 py-3 text-left">Returned Date</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-800">
                {assignments.map((asgn) => (
                  <tr key={asgn.id} className="hover:bg-neutral-50/75">
                    <td className="px-4 py-3 font-medium">
                      {asgn.employee ? (
                        <div>
                          <div className="text-neutral-900 font-medium">
                            {asgn.employee.first_name} {asgn.employee.last_name}
                          </div>
                          <div className="text-xs text-neutral-500 font-mono">
                            {asgn.employee.employee_code}
                          </div>
                        </div>
                      ) : (
                        "Unknown Staff"
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{asgn.assigned_date}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {asgn.returned_date || <span className="text-blue-600 font-medium">Active</span>}
                    </td>
                    <td className="px-4 py-3">
                      {asgn.is_active ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          Active Custody
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-neutral-100 text-neutral-600 border-neutral-200">
                          Returned
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {asgn.assignment_notes && (
                        <div>
                          <span className="font-semibold text-neutral-500">Issued: </span>
                          {asgn.assignment_notes}
                        </div>
                      )}
                      {asgn.return_notes && (
                        <div className="mt-1">
                          <span className="font-semibold text-neutral-500">Return: </span>
                          {asgn.return_notes}
                        </div>
                      )}
                      {!asgn.assignment_notes && !asgn.return_notes && "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Asset: ${asset.asset_code}`}
        description="Update asset specifications, status, condition, or physical location."
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <Label htmlFor="edit_name">Asset Name *</Label>
            <Input
              id="edit_name"
              value={editForm.name || ""}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit_status">Status</Label>
              <select
                id="edit_status"
                value={editForm.status || "available"}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as AssetStatus })}
                className="w-full h-10 px-3 rounded-md border border-neutral-300 bg-white text-sm"
              >
                <option value="available">Available</option>
                <option value="assigned" disabled={asset.status !== "assigned"}>
                  Assigned (Process return to unassign)
                </option>
                <option value="under_maintenance">Under Maintenance</option>
                <option value="lost">Lost</option>
                <option value="retired">Retired</option>
                <option value="disposed">Disposed</option>
              </select>
            </div>
            <div>
              <Label htmlFor="edit_condition">Condition</Label>
              <select
                id="edit_condition"
                value={editForm.condition || "good"}
                onChange={(e) => setEditForm({ ...editForm, condition: e.target.value as AssetCondition })}
                className="w-full h-10 px-3 rounded-md border border-neutral-300 bg-white text-sm"
              >
                <option value="new">New</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="edit_location">Location</Label>
            <Input
              id="edit_location"
              value={editForm.location || ""}
              onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
            <Button variant="outline" type="button" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Assign Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Assign Asset: ${asset.asset_code}`}
        description={`Assign "${asset.name}" to an employee.`}
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <Label htmlFor="assign_emp">Employee *</Label>
            <select
              id="assign_emp"
              value={assignForm.employee_id}
              onChange={(e) => setAssignForm({ ...assignForm, employee_id: e.target.value })}
              className="w-full h-10 px-3 rounded-md border border-neutral-300 bg-white text-sm"
              required
            >
              <option value="">Select Employee...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({emp.employee_code}) - {emp.designation || "Staff"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="assign_date">Assignment Date *</Label>
            <Input
              id="assign_date"
              type="date"
              value={assignForm.assigned_date}
              onChange={(e) => setAssignForm({ ...assignForm, assigned_date: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="assign_notes">Assignment Notes</Label>
            <Input
              id="assign_notes"
              placeholder="e.g. Standard workstation kit issued for role"
              value={assignForm.assignment_notes}
              onChange={(e) => setAssignForm({ ...assignForm, assignment_notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
            <Button variant="outline" type="button" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? "Assigning..." : "Confirm Assignment"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title={`Process Asset Return: ${asset.asset_code}`}
        description={`Record return for "${asset.name}" and update condition.`}
      >
        <form onSubmit={handleReturnSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="return_date">Return Date *</Label>
              <Input
                id="return_date"
                type="date"
                value={returnForm.returned_date}
                onChange={(e) => setReturnForm({ ...returnForm, returned_date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="return_condition">Returned Condition</Label>
              <select
                id="return_condition"
                value={returnForm.condition}
                onChange={(e) => setReturnForm({ ...returnForm, condition: e.target.value as AssetCondition })}
                className="w-full h-10 px-3 rounded-md border border-neutral-300 bg-white text-sm"
              >
                <option value="new">New</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="return_status">New Asset Status</Label>
            <select
              id="return_status"
              value={returnForm.status}
              onChange={(e) => setReturnForm({ ...returnForm, status: e.target.value as AssetStatus })}
              className="w-full h-10 px-3 rounded-md border border-neutral-300 bg-white text-sm"
            >
              <option value="available">Available</option>
              <option value="under_maintenance">Send to Maintenance</option>
              <option value="retired">Retire Asset</option>
              <option value="disposed">Dispose Asset</option>
            </select>
          </div>

          <div>
            <Label htmlFor="return_notes">Return Notes</Label>
            <Input
              id="return_notes"
              placeholder="e.g. Returned upon project handover, verified working"
              value={returnForm.return_notes}
              onChange={(e) => setReturnForm({ ...returnForm, return_notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
            <Button variant="outline" type="button" onClick={() => setIsReturnModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isSubmitting ? "Processing..." : "Confirm Return"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={`Delete Asset: ${asset.asset_code}`}
        description="Are you sure you want to delete this asset from the registry? This action cannot be undone."
      >
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <p className="text-sm text-neutral-600">
            You are about to delete <strong>{asset.name}</strong> ({asset.asset_code}).
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
            <Button variant="outline" type="button" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete Asset"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
