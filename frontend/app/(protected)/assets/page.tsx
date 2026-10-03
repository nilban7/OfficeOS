"use client";

import * as React from "react";
import Link from "next/link";
import {
  Box,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Edit2,
  Trash2,
  Eye,
  UserCheck,
  RotateCcw,
  Tag,
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
import type {
  Asset,
  AssetAssignPayload,
  AssetCondition,
  AssetCreatePayload,
  AssetReturnPayload,
  AssetStatus,
  AssetUpdatePayload,
} from "@/types/asset";
import type { Employee, EmployeeListResponse } from "@/types/employee";
import type { Vendor, VendorListResponse } from "@/types/procurement";

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

export default function AssetsPage() {
  const { currentOrganization, permissions, membership, isLoading: isOrgLoading } = useOrganization();

  const isSystemAdmin = membership?.role === "system_admin";

  // Permissions
  const canViewAssets = isSystemAdmin || permissions.includes("assets.view") || permissions.length === 0;
  const canCreateAssets = isSystemAdmin || permissions.includes("assets.create");
  const canUpdateAssets = isSystemAdmin || permissions.includes("assets.update");
  const canDeleteAssets = isSystemAdmin || permissions.includes("assets.delete");
  const canAssignAssets = isSystemAdmin || permissions.includes("assets.assign");
  const canReturnAssets = isSystemAdmin || permissions.includes("assets.return");

  // State
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [conditionFilter, setConditionFilter] = React.useState("all");

  // Notifications
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);

  const [selectedAsset, setSelectedAsset] = React.useState<Asset | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Form States
  const [addForm, setAddForm] = React.useState<AssetCreatePayload>({
    asset_code: "",
    name: "",
    category: "it_equipment",
    description: "",
    serial_number: "",
    model: "",
    manufacturer: "",
    vendor_id: undefined,
    purchase_date: "",
    purchase_cost: undefined,
    currency: "USD",
    warranty_start_date: "",
    warranty_end_date: "",
    status: "available",
    condition: "good",
    location: "",
    notes: "",
  });

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

  const fetchAssets = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (categoryFilter !== "all") params.category = categoryFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      if (conditionFilter !== "all") params.condition = conditionFilter;

      const res = await apiClient.get<{ items: Asset[]; meta: { total: number } }>(
        API_ENDPOINTS.assets.list,
        { params }
      );
      setAssets(res.items || []);
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load assets. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, search, categoryFilter, statusFilter, conditionFilter]);

  const fetchDependencies = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const [empRes, vndRes] = await Promise.allSettled([
        apiClient.get<EmployeeListResponse>(API_ENDPOINTS.employees.list, { params: { page_size: 100 } }),
        apiClient.get<VendorListResponse>(API_ENDPOINTS.vendors.list, { params: { page_size: 100 } }),
      ]);

      if (empRes.status === "fulfilled") {
        setEmployees(empRes.value.items || []);
      }
      if (vndRes.status === "fulfilled") {
        setVendors(vndRes.value.items || []);
      }
    } catch {
      // Non-blocking
    }
  }, [currentOrganization]);

  React.useEffect(() => {
    if (currentOrganization) {
      fetchAssets();
      fetchDependencies();
    }
  }, [currentOrganization, fetchAssets, fetchDependencies]);

  // Handle Add Asset
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.asset_code.trim() || !addForm.name.trim() || !addForm.category.trim()) {
      setFormError("Asset Code, Name, and Category are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: AssetCreatePayload = {
        ...addForm,
        purchase_cost: addForm.purchase_cost ? Number(addForm.purchase_cost) : undefined,
        vendor_id: addForm.vendor_id || undefined,
        purchase_date: addForm.purchase_date || undefined,
        warranty_start_date: addForm.warranty_start_date || undefined,
        warranty_end_date: addForm.warranty_end_date || undefined,
      };

      await apiClient.post(API_ENDPOINTS.assets.create, payload);
      setSuccessMessage(`Asset "${addForm.asset_code}" registered successfully.`);
      setIsAddModalOpen(false);
      setAddForm({
        asset_code: "",
        name: "",
        category: "it_equipment",
        description: "",
        serial_number: "",
        model: "",
        manufacturer: "",
        vendor_id: undefined,
        purchase_date: "",
        purchase_cost: undefined,
        currency: "USD",
        warranty_start_date: "",
        warranty_end_date: "",
        status: "available",
        condition: "good",
        location: "",
        notes: "",
      });
      fetchAssets();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create asset. Please check inputs.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Asset
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;

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

      await apiClient.patch(API_ENDPOINTS.assets.update(selectedAsset.id), payload);
      setSuccessMessage(`Asset "${selectedAsset.asset_code}" updated successfully.`);
      setIsEditModalOpen(false);
      setSelectedAsset(null);
      fetchAssets();
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

  // Handle Assign Asset
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !assignForm.employee_id) {
      setFormError("Please select an employee to assign.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.assets.assign(selectedAsset.id), assignForm);
      setSuccessMessage(`Asset "${selectedAsset.asset_code}" assigned successfully.`);
      setIsAssignModalOpen(false);
      setSelectedAsset(null);
      setAssignForm({
        employee_id: "",
        assigned_date: new Date().toISOString().split("T")[0],
        assignment_notes: "",
      });
      fetchAssets();
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

  // Handle Return Asset
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(API_ENDPOINTS.assets.return(selectedAsset.id), returnForm);
      setSuccessMessage(`Asset "${selectedAsset.asset_code}" returned successfully.`);
      setIsReturnModalOpen(false);
      setSelectedAsset(null);
      fetchAssets();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to process asset return.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Asset
  const handleDeleteSubmit = async () => {
    if (!selectedAsset) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.delete(API_ENDPOINTS.assets.delete(selectedAsset.id));
      setSuccessMessage(`Asset "${selectedAsset.asset_code}" deleted successfully.`);
      setIsDeleteModalOpen(false);
      setSelectedAsset(null);
      fetchAssets();
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

  if (isOrgLoading) {
    return <LoadingState message="Loading organization context..." />;
  }

  if (!canViewAssets) {
    return (
      <div className="p-8">
        <ErrorState
          title="Access Denied"
          message="You do not have permission to access the Asset Management workspace."
        />
      </div>
    );
  }

  // Summary Metrics
  const totalAssets = assets.length;
  const availableAssets = assets.filter((a) => a.status === "available").length;
  const assignedAssets = assets.filter((a) => a.status === "assigned").length;
  const maintenanceAssets = assets.filter((a) => a.status === "under_maintenance").length;
  const otherAssets = assets.filter((a) => ["lost", "retired", "disposed"].includes(a.status)).length;

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 flex items-center gap-3">
            <Box className="h-8 w-8 text-indigo-600" />
            Asset Management
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Track, assign, and manage enterprise hardware, equipment, and company assets.
          </p>
        </div>

        {canCreateAssets && (
          <Button
            onClick={() => {
              setFormError(null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Register Asset
          </Button>
        )}
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

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-center justify-between text-sm shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAssets}>
            Retry
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Assets</span>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{totalAssets}</div>
          </CardContent>
        </Card>
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Available</span>
            <div className="mt-2 text-2xl font-bold text-emerald-600">{availableAssets}</div>
          </CardContent>
        </Card>
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Assigned</span>
            <div className="mt-2 text-2xl font-bold text-blue-600">{assignedAssets}</div>
          </CardContent>
        </Card>
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Maintenance</span>
            <div className="mt-2 text-2xl font-bold text-amber-600">{maintenanceAssets}</div>
          </CardContent>
        </Card>
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Retired/Lost</span>
            <div className="mt-2 text-2xl font-bold text-neutral-600">{otherAssets}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card className="border-neutral-200 shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-1 flex-wrap gap-3 items-center min-w-[280px]">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search by code, name, model, serial..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-neutral-300 bg-white text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Categories</option>
              <option value="it_equipment">IT Equipment</option>
              <option value="furniture">Furniture</option>
              <option value="vehicle">Vehicle</option>
              <option value="machinery">Machinery</option>
              <option value="software_license">Software License</option>
              <option value="other">Other</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-neutral-300 bg-white text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="under_maintenance">In Maintenance</option>
              <option value="lost">Lost</option>
              <option value="retired">Retired</option>
              <option value="disposed">Disposed</option>
            </select>

            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-neutral-300 bg-white text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Conditions</option>
              <option value="new">New</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Assets Table */}
      {isLoading ? (
        <LoadingState message="Loading assets..." />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Box}
          title="No assets found"
          description={
            search || categoryFilter !== "all" || statusFilter !== "all" || conditionFilter !== "all"
              ? "No assets match your search or filter criteria."
              : "No assets have been registered yet in your organization."
          }
          actionLabel={canCreateAssets ? "Register First Asset" : undefined}
          onAction={
            canCreateAssets
              ? () => {
                  setFormError(null);
                  setIsAddModalOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 font-medium text-neutral-600">
              <tr>
                <th className="px-4 py-3 text-left">Asset Code</th>
                <th className="px-4 py-3 text-left">Name / Model</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Condition</th>
                <th className="px-4 py-3 text-left">Current Custodian</th>
                <th className="px-4 py-3 text-left">Cost</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {assets.map((asset) => (
                <tr key={asset.id} className="hover:bg-neutral-50/75 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-indigo-600">
                    <Link href={`/assets/${asset.id}`} className="hover:underline flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-indigo-400" />
                      {asset.asset_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{asset.name}</div>
                    {asset.model && <div className="text-xs text-neutral-500">{asset.model}</div>}
                  </td>
                  <td className="px-4 py-3 capitalize text-neutral-700">
                    {asset.category.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={STATUS_CONFIG[asset.status]?.className}>
                      {STATUS_CONFIG[asset.status]?.label || asset.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={CONDITION_CONFIG[asset.condition]?.className}>
                      {CONDITION_CONFIG[asset.condition]?.label || asset.condition}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {asset.current_custodian ? (
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>
                          {asset.current_custodian.first_name} {asset.current_custodian.last_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {asset.purchase_cost != null ? (
                      `${asset.currency} ${Number(asset.purchase_cost).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}`
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/assets/${asset.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View details">
                          <Eye className="h-4 w-4 text-neutral-600" />
                        </Button>
                      </Link>

                      {/* Quick Assign */}
                      {canAssignAssets && asset.status === "available" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          title="Assign asset"
                          onClick={() => {
                            setSelectedAsset(asset);
                            setFormError(null);
                            setIsAssignModalOpen(true);
                          }}
                        >
                          <UserCheck className="h-3.5 w-3.5 mr-1" />
                          Assign
                        </Button>
                      )}

                      {/* Quick Return */}
                      {canReturnAssets && asset.status === "assigned" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          title="Process return"
                          onClick={() => {
                            setSelectedAsset(asset);
                            setFormError(null);
                            setIsReturnModalOpen(true);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Return
                        </Button>
                      )}

                      {/* Edit */}
                      {canUpdateAssets && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Edit asset"
                          onClick={() => {
                            setSelectedAsset(asset);
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
                          <Edit2 className="h-4 w-4 text-neutral-600" />
                        </Button>
                      )}

                      {/* Delete */}
                      {canDeleteAssets && asset.status !== "assigned" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Delete asset"
                          onClick={() => {
                            setSelectedAsset(asset);
                            setFormError(null);
                            setIsDeleteModalOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Register Asset Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Asset"
        description="Add a new company asset, workstation, equipment, or device to the registry."
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="asset_code">Asset Code *</Label>
              <Input
                id="asset_code"
                placeholder="e.g. AST-2026-001"
                value={addForm.asset_code}
                onChange={(e) => setAddForm({ ...addForm, asset_code: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="category">Category *</Label>
              <select
                id="category"
                value={addForm.category}
                onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-neutral-300 bg-white text-sm"
                required
              >
                <option value="it_equipment">IT Equipment</option>
                <option value="furniture">Furniture</option>
                <option value="vehicle">Vehicle</option>
                <option value="machinery">Machinery</option>
                <option value="software_license">Software License</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="name">Asset Name *</Label>
            <Input
              id="name"
              placeholder="e.g. Apple MacBook Pro 16-inch M3 Max"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                placeholder="e.g. MacBookPro18,1"
                value={addForm.model}
                onChange={(e) => setAddForm({ ...addForm, model: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                placeholder="e.g. Apple"
                value={addForm.manufacturer}
                onChange={(e) => setAddForm({ ...addForm, manufacturer: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="serial_number">Serial Number</Label>
              <Input
                id="serial_number"
                placeholder="e.g. C02G41ABMD6M"
                value={addForm.serial_number}
                onChange={(e) => setAddForm({ ...addForm, serial_number: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="vendor">Vendor / Supplier</Label>
              <select
                id="vendor"
                value={addForm.vendor_id || ""}
                onChange={(e) => setAddForm({ ...addForm, vendor_id: e.target.value || undefined })}
                className="w-full h-10 px-3 rounded-md border border-neutral-300 bg-white text-sm"
              >
                <option value="">None / Unknown</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.vendor_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="purchase_cost">Purchase Cost</Label>
              <Input
                id="purchase_cost"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={addForm.purchase_cost ?? ""}
                onChange={(e) =>
                  setAddForm({ ...addForm, purchase_cost: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="condition">Initial Condition</Label>
              <select
                id="condition"
                value={addForm.condition}
                onChange={(e) => setAddForm({ ...addForm, condition: e.target.value as AssetCondition })}
                className="w-full h-10 px-3 rounded-md border border-neutral-300 bg-white text-sm"
              >
                <option value="new">New</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>
            <div>
              <Label htmlFor="location">Physical Location</Label>
              <Input
                id="location"
                placeholder="e.g. Building 2, 4th Floor Storage"
                value={addForm.location}
                onChange={(e) => setAddForm({ ...addForm, location: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
            <Button variant="outline" type="button" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSubmitting ? "Registering..." : "Register Asset"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Asset Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Asset: ${selectedAsset?.asset_code}`}
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
                <option value="assigned" disabled={selectedAsset?.status !== "assigned"}>
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

      {/* Assign Asset Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Assign Asset: ${selectedAsset?.asset_code}`}
        description={`Assign "${selectedAsset?.name}" to an employee.`}
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
              placeholder="e.g. Standard workstation kit issued for remote role"
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

      {/* Return Asset Modal */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title={`Process Asset Return: ${selectedAsset?.asset_code}`}
        description={`Record return for "${selectedAsset?.name}" and update condition.`}
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
        title={`Delete Asset: ${selectedAsset?.asset_code}`}
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
            You are about to delete <strong>{selectedAsset?.name}</strong> ({selectedAsset?.asset_code}).
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
