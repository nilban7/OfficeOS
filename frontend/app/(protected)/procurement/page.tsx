"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Plus,
  Search,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  FileText,
  User,
  Trash2,
  Edit2,
  ExternalLink,
  Package,
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
import type { Department } from "@/types/employee";
import type {
  PurchaseOrderCreateInput,
  PurchaseOrderItemInput,
  PurchaseOrderListResponse,
  PurchaseOrderStatus,
  PurchaseRequestCreateInput,
  PurchaseRequestListResponse,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  Vendor,
  VendorCreateInput,
  VendorListResponse,
  VendorUpdateInput,
} from "@/types/procurement";

export default function ProcurementPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Active Tab
  const [activeTab, setActiveTab] = React.useState<"requests" | "orders" | "vendors">("requests");

  // Permissions
  const canViewProcurement =
    permissions.includes("procurement.view") ||
    permissions.includes("purchase_orders.view") ||
    permissions.includes("vendors.view") ||
    permissions.includes("procurement.create");
  const canCreatePR = permissions.includes("procurement.create");
  const canManagePO = permissions.includes("purchase_orders.manage");
  const canManageVendors = permissions.includes("vendors.manage");

  // Data States
  const [requestsData, setRequestsData] = React.useState<PurchaseRequestListResponse>({
    items: [],
    meta: { total: 0, page: 1, page_size: 20, total_pages: 1 },
  });
  const [ordersData, setOrdersData] = React.useState<PurchaseOrderListResponse>({
    items: [],
    meta: { total: 0, page: 1, page_size: 20, total_pages: 1 },
  });
  const [vendorsData, setVendorsData] = React.useState<VendorListResponse>({
    items: [],
    meta: { total: 0, page: 1, page_size: 50, total_pages: 1 },
  });
  const [departments, setDepartments] = React.useState<Department[]>([]);

  // Loading & Global States
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Filter States
  const [prSearch, setPrSearch] = React.useState("");
  const [prStatusFilter, setPrStatusFilter] = React.useState<string>("all");
  const [prPriorityFilter, setPrPriorityFilter] = React.useState<string>("all");
  const [prPage, setPrPage] = React.useState(1);

  const [poSearch, setPoSearch] = React.useState("");
  const [poStatusFilter, setPoStatusFilter] = React.useState<string>("all");
  const [poPage, setPoPage] = React.useState(1);

  const [vendorSearch, setVendorSearch] = React.useState("");
  const [vendorPage, setVendorPage] = React.useState(1);

  // Modals
  const [isAddPrModalOpen, setIsAddPrModalOpen] = React.useState(false);
  const [isAddPoModalOpen, setIsAddPoModalOpen] = React.useState(false);
  const [isAddVendorModalOpen, setIsAddVendorModalOpen] = React.useState(false);
  const [isEditVendorModalOpen, setIsEditVendorModalOpen] = React.useState(false);
  const [editingVendor, setEditingVendor] = React.useState<Vendor | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Forms
  const [addPrForm, setAddPrForm] = React.useState<PurchaseRequestCreateInput>({
    department_id: null,
    required_date: null,
    priority: "medium",
    purpose: "",
    estimated_amount: null,
    currency: "USD",
  });

  const [addPoForm, setAddPoForm] = React.useState<PurchaseOrderCreateInput>({
    vendor_id: "",
    purchase_request_id: null,
    order_date: new Date().toISOString().split("T")[0] || "",
    expected_delivery_date: null,
    currency: "USD",
    notes: "",
    items: [
      {
        item_description: "",
        quantity: 1,
        unit: "units",
        unit_price: 0,
        tax_rate: 0,
      },
    ],
  });

  const [addVendorForm, setAddVendorForm] = React.useState<VendorCreateInput>({
    vendor_code: "",
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    tax_id: "",
    is_active: true,
  });

  const [editVendorForm, setEditVendorForm] = React.useState<VendorUpdateInput>({});

  // Auto-dismiss Alerts
  React.useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [successMessage]);

  // Fetch Auxiliary Data
  const fetchAuxiliaryData = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const [deptRes, vendorRes] = await Promise.all([
        apiClient.get<{ items: Department[] }>(API_ENDPOINTS.departments.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
        }),
        apiClient.get<VendorListResponse>(API_ENDPOINTS.vendors.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
          params: { page_size: 100 },
        }),
      ]);
      setDepartments(deptRes?.items || []);
      setVendorsData(vendorRes || { items: [], meta: { total: 0, page: 1, page_size: 100, total_pages: 1 } });
    } catch {
      // Best-effort
    }
  }, [currentOrganization]);

  // Fetch Purchase Requests
  const fetchPurchaseRequests = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = {
        page: prPage,
        page_size: 20,
      };
      if (prSearch.trim()) params.search = prSearch.trim();
      if (prStatusFilter !== "all") params.status = prStatusFilter;
      if (prPriorityFilter !== "all") params.priority = prPriorityFilter;

      const res = await apiClient.get<PurchaseRequestListResponse>(API_ENDPOINTS.purchaseRequests.list, {
        headers: { "X-Organization-Id": currentOrganization.id },
        params,
      });

      setRequestsData(res || { items: [], meta: { total: 0, page: 1, page_size: 20, total_pages: 1 } });
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load purchase requests. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, prPage, prSearch, prStatusFilter, prPriorityFilter]);

  // Fetch Purchase Orders
  const fetchPurchaseOrders = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = {
        page: poPage,
        page_size: 20,
      };
      if (poSearch.trim()) params.search = poSearch.trim();
      if (poStatusFilter !== "all") params.status = poStatusFilter;

      const res = await apiClient.get<PurchaseOrderListResponse>(API_ENDPOINTS.purchaseOrders.list, {
        headers: { "X-Organization-Id": currentOrganization.id },
        params,
      });

      setOrdersData(res || { items: [], meta: { total: 0, page: 1, page_size: 20, total_pages: 1 } });
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load purchase orders. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, poPage, poSearch, poStatusFilter]);

  // Fetch Vendors
  const fetchVendors = React.useCallback(async () => {
    if (!currentOrganization) return;
    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = {
        page: vendorPage,
        page_size: 20,
      };
      if (vendorSearch.trim()) params.search = vendorSearch.trim();

      const res = await apiClient.get<VendorListResponse>(API_ENDPOINTS.vendors.list, {
        headers: { "X-Organization-Id": currentOrganization.id },
        params,
      });

      setVendorsData(res || { items: [], meta: { total: 0, page: 1, page_size: 20, total_pages: 1 } });
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load vendors. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, vendorPage, vendorSearch]);

  // Tab change effect
  React.useEffect(() => {
    if (!currentOrganization) return;
    fetchAuxiliaryData();
    if (activeTab === "requests") fetchPurchaseRequests();
    else if (activeTab === "orders") fetchPurchaseOrders();
    else if (activeTab === "vendors") fetchVendors();
  }, [currentOrganization, activeTab, fetchAuxiliaryData, fetchPurchaseRequests, fetchPurchaseOrders, fetchVendors]);

  // Handle Create Purchase Request
  const handleCreatePr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;

    if (!addPrForm.purpose.trim()) {
      setFormError("Please provide a purpose / description for the purchase request.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: Record<string, unknown> = {
        purpose: addPrForm.purpose.trim(),
        priority: addPrForm.priority || "medium",
        currency: addPrForm.currency || "USD",
      };
      if (addPrForm.department_id) payload.department_id = addPrForm.department_id;
      if (addPrForm.required_date) payload.required_date = addPrForm.required_date;
      if (addPrForm.estimated_amount !== null && addPrForm.estimated_amount !== undefined && addPrForm.estimated_amount > 0) {
        payload.estimated_amount = addPrForm.estimated_amount;
      }

      await apiClient.post(API_ENDPOINTS.purchaseRequests.create, payload, {
        headers: { "X-Organization-Id": currentOrganization.id },
      });

      setSuccessMessage("Purchase request created successfully as draft.");
      setIsAddPrModalOpen(false);
      setAddPrForm({
        department_id: null,
        required_date: null,
        priority: "medium",
        purpose: "",
        estimated_amount: null,
        currency: "USD",
      });
      fetchPurchaseRequests();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create purchase request. Please check inputs.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dynamic Line Item Handlers for PO
  const handleItemChange = (index: number, field: keyof PurchaseOrderItemInput, value: string | number) => {
    const updated = [...addPoForm.items];
    const current = updated[index];
    if (!current) return;
    updated[index] = {
      ...current,
      [field]: field === "quantity" || field === "unit_price" || field === "tax_rate" ? Number(value) : String(value),
    } as PurchaseOrderItemInput;
    setAddPoForm({ ...addPoForm, items: updated });
  };

  const handleAddItemRow = () => {
    setAddPoForm({
      ...addPoForm,
      items: [
        ...addPoForm.items,
        { item_description: "", quantity: 1, unit: "units", unit_price: 0, tax_rate: 0 },
      ],
    });
  };

  const handleRemoveItemRow = (index: number) => {
    if (addPoForm.items.length <= 1) return;
    const updated = addPoForm.items.filter((_, i) => i !== index);
    setAddPoForm({ ...addPoForm, items: updated });
  };

  // Preview Totals
  const poTotals = React.useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    for (const it of addPoForm.items) {
      const q = Number(it.quantity) || 0;
      const p = Number(it.unit_price) || 0;
      const r = Number(it.tax_rate) || 0;
      const lineSub = q * p;
      const lineTax = lineSub * (r / 100);
      subtotal += lineSub;
      taxAmount += lineTax;
    }
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  }, [addPoForm.items]);

  // Handle Create Purchase Order
  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;

    if (!addPoForm.vendor_id) {
      setFormError("Please select a vendor.");
      return;
    }
    if (!addPoForm.order_date) {
      setFormError("Please provide an order date.");
      return;
    }
    if (addPoForm.items.length === 0 || addPoForm.items.some((it) => !it.item_description.trim())) {
      setFormError("Please add at least one line item with a valid description.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: PurchaseOrderCreateInput = {
        vendor_id: addPoForm.vendor_id,
        purchase_request_id: addPoForm.purchase_request_id || null,
        order_date: addPoForm.order_date,
        expected_delivery_date: addPoForm.expected_delivery_date || null,
        currency: addPoForm.currency || "USD",
        notes: addPoForm.notes?.trim() || null,
        items: addPoForm.items.map((it) => ({
          item_description: it.item_description.trim(),
          quantity: Number(it.quantity) || 1,
          unit: it.unit?.trim() || "units",
          unit_price: Number(it.unit_price) || 0,
          tax_rate: Number(it.tax_rate) || 0,
        })),
      };

      await apiClient.post(API_ENDPOINTS.purchaseOrders.create, payload, {
        headers: { "X-Organization-Id": currentOrganization.id },
      });

      setSuccessMessage("Purchase order created successfully.");
      setIsAddPoModalOpen(false);
      setAddPoForm({
        vendor_id: "",
        purchase_request_id: null,
        order_date: new Date().toISOString().split("T")[0] || "",
        expected_delivery_date: null,
        currency: "USD",
        notes: "",
        items: [{ item_description: "", quantity: 1, unit: "units", unit_price: 0, tax_rate: 0 }],
      });
      fetchPurchaseOrders();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create purchase order. Please verify input fields.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Create Vendor
  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;

    if (!addVendorForm.vendor_code.trim() || !addVendorForm.name.trim()) {
      setFormError("Vendor code and name are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: VendorCreateInput = {
        vendor_code: addVendorForm.vendor_code.trim().toUpperCase(),
        name: addVendorForm.name.trim(),
        contact_person: addVendorForm.contact_person?.trim() || null,
        email: addVendorForm.email?.trim() || null,
        phone: addVendorForm.phone?.trim() || null,
        address: addVendorForm.address?.trim() || null,
        tax_id: addVendorForm.tax_id?.trim() || null,
        is_active: addVendorForm.is_active ?? true,
      };

      await apiClient.post(API_ENDPOINTS.vendors.create, payload, {
        headers: { "X-Organization-Id": currentOrganization.id },
      });

      setSuccessMessage("Vendor created successfully.");
      setIsAddVendorModalOpen(false);
      setAddVendorForm({
        vendor_code: "",
        name: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        tax_id: "",
        is_active: true,
      });
      fetchVendors();
      fetchAuxiliaryData();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create vendor. Check if vendor code is unique.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Vendor
  const handleEditVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !editingVendor) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.patch(API_ENDPOINTS.vendors.detail(editingVendor.id), editVendorForm, {
        headers: { "X-Organization-Id": currentOrganization.id },
      });

      setSuccessMessage("Vendor updated successfully.");
      setIsEditVendorModalOpen(false);
      setEditingVendor(null);
      fetchVendors();
      fetchAuxiliaryData();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update vendor.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper Badge Colors
  const getPrStatusBadge = (status: PurchaseRequestStatus) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "submitted":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Submitted</Badge>;
      case "approved":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-rose-100 text-rose-800 border-rose-300">Rejected</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="text-gray-500 border-gray-300">Cancelled</Badge>;
    }
  };

  const getPriorityBadge = (priority: PurchaseRequestPriority) => {
    switch (priority) {
      case "low":
        return <Badge variant="outline" className="text-gray-600">Low</Badge>;
      case "medium":
        return <Badge variant="outline" className="text-blue-600 border-blue-200">Medium</Badge>;
      case "high":
        return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">High</Badge>;
      case "urgent":
        return <Badge className="bg-rose-600 text-white font-medium">Urgent</Badge>;
    }
  };

  const getPoStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "issued":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Issued</Badge>;
      case "partially_received":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300">Partially Received</Badge>;
      case "received":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Received</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="text-gray-500 border-gray-300">Cancelled</Badge>;
      case "closed":
        return <Badge className="bg-slate-100 text-slate-800 border-slate-300">Closed</Badge>;
    }
  };

  if (isOrgLoading) {
    return <LoadingState message="Loading procurement dashboard..." />;
  }

  if (!canViewProcurement) {
    return (
      <div className="p-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-sm text-gray-600">
              You do not have permission to view procurement records. Please contact your organization administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Procurement & Purchases</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage purchase requisitions, orders, line items, and vendor relationships.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "requests" && canCreatePR && (
            <Button onClick={() => setIsAddPrModalOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              New Purchase Request
            </Button>
          )}
          {activeTab === "orders" && canManagePO && (
            <Button onClick={() => setIsAddPoModalOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              New Purchase Order
            </Button>
          )}
          {activeTab === "vendors" && canManageVendors && (
            <Button onClick={() => setIsAddVendorModalOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              New Vendor
            </Button>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={fetchPurchaseRequests} />}

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Purchase Requests</p>
              <h3 className="text-xl font-bold text-gray-900 mt-1">{requestsData?.meta?.total ?? 0}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Purchase Orders</p>
              <h3 className="text-xl font-bold text-gray-900 mt-1">{ordersData?.meta?.total ?? 0}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Vendors Directory</p>
              <h3 className="text-xl font-bold text-gray-900 mt-1">{vendorsData?.meta?.total ?? 0}</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Active Organization</p>
              <h3 className="text-sm font-semibold text-gray-900 mt-1 truncate max-w-[140px]">
                {currentOrganization?.name || "—"}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("requests")}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "requests"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Purchase Requests ({requestsData?.meta?.total ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "orders"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Purchase Orders ({ordersData?.meta?.total ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("vendors")}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "vendors"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Vendors ({vendorsData?.meta?.total ?? 0})
          </button>
        </nav>
      </div>

      {/* TAB 1: Purchase Requests */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <Input
                    placeholder="Search by request number or purpose..."
                    value={prSearch}
                    onChange={(e) => {
                      setPrSearch(e.target.value);
                      setPrPage(1);
                    }}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={prStatusFilter}
                    onChange={(e) => {
                      setPrStatusFilter(e.target.value);
                      setPrPage(1);
                    }}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </select>

                  <select
                    value={prPriorityFilter}
                    onChange={(e) => {
                      setPrPriorityFilter(e.target.value);
                      setPrPage(1);
                    }}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <LoadingState message="Loading requests..." />
          ) : requestsData.items.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No purchase requests found"
              description="Create your first purchase requisition to track procurement approvals."
              actionLabel={canCreatePR ? "New Purchase Request" : undefined}
              onAction={canCreatePR ? () => setIsAddPrModalOpen(true) : undefined}
            />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Request #</th>
                      <th className="px-6 py-3">Purpose</th>
                      <th className="px-6 py-3">Priority</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Requester</th>
                      <th className="px-6 py-3">Est. Amount</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {requestsData.items.map((pr) => (
                      <tr key={pr.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-gray-900">
                          <Link
                            href={`/procurement/requests/${pr.id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1.5"
                          >
                            {pr.request_number}
                            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-gray-900 max-w-xs truncate font-medium">
                          {pr.purpose}
                          {pr.department_name && (
                            <span className="block text-xs text-gray-500 font-normal">
                              Dept: {pr.department_name}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">{getPriorityBadge(pr.priority)}</td>
                        <td className="px-6 py-4">{getPrStatusBadge(pr.status)}</td>
                        <td className="px-6 py-4 text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-gray-400" />
                            <span>{pr.requester_name || pr.requester_code || "—"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-900 font-semibold">
                          {pr.estimated_amount !== null && pr.estimated_amount !== undefined
                            ? `${pr.currency} ${Number(pr.estimated_amount).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              })}`
                            : "—"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link href={`/procurement/requests/${pr.id}`}>
                            <Button variant="outline" size="sm" className="h-8">
                              View Details
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {requestsData.meta.total_pages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Showing Page {requestsData.meta.page} of {requestsData.meta.total_pages} (Total{" "}
                    {requestsData.meta.total} requests)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={prPage <= 1}
                      onClick={() => setPrPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={prPage >= requestsData.meta.total_pages}
                      onClick={() => setPrPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: Purchase Orders */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <Input
                    placeholder="Search PO number or notes..."
                    value={poSearch}
                    onChange={(e) => {
                      setPoSearch(e.target.value);
                      setPoPage(1);
                    }}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={poStatusFilter}
                    onChange={(e) => {
                      setPoStatusFilter(e.target.value);
                      setPoPage(1);
                    }}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="issued">Issued</option>
                    <option value="partially_received">Partially Received</option>
                    <option value="received">Received</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <LoadingState message="Loading purchase orders..." />
          ) : ordersData.items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No purchase orders found"
              description="Create a purchase order with line items to initiate vendor procurement."
              actionLabel={canManagePO ? "New Purchase Order" : undefined}
              onAction={canManagePO ? () => setIsAddPoModalOpen(true) : undefined}
            />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">PO #</th>
                      <th className="px-6 py-3">Vendor</th>
                      <th className="px-6 py-3">Order Date</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Items</th>
                      <th className="px-6 py-3">Total Amount</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {ordersData.items.map((po) => (
                      <tr key={po.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-gray-900">
                          <Link
                            href={`/procurement/orders/${po.id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1.5"
                          >
                            {po.po_number}
                            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                          </Link>
                          {po.purchase_request_number && (
                            <span className="block text-xs text-gray-500 font-normal">
                              Ref PR: {po.purchase_request_number}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-900 font-medium">
                          {po.vendor_name || "—"}
                          {po.vendor_code && (
                            <span className="block text-xs text-gray-500 font-mono">
                              ({po.vendor_code})
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            <span>{po.order_date}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">{getPoStatusBadge(po.status)}</td>
                        <td className="px-6 py-4 text-gray-600 font-medium">
                          {po.items_count ?? "—"} item(s)
                        </td>
                        <td className="px-6 py-4 text-gray-900 font-bold">
                          {po.currency}{" "}
                          {Number(po.total_amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link href={`/procurement/orders/${po.id}`}>
                            <Button variant="outline" size="sm" className="h-8">
                              View Order
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {ordersData.meta.total_pages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Showing Page {ordersData.meta.page} of {ordersData.meta.total_pages} (Total{" "}
                    {ordersData.meta.total} orders)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={poPage <= 1}
                      onClick={() => setPoPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={poPage >= ordersData.meta.total_pages}
                      onClick={() => setPoPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: Vendors Directory */}
      {activeTab === "vendors" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search vendors by code, name, contact person, or email..."
                  value={vendorSearch}
                  onChange={(e) => {
                    setVendorSearch(e.target.value);
                    setVendorPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <LoadingState message="Loading vendors directory..." />
          ) : vendorsData.items.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No vendors registered"
              description="Register vendors to link them to purchase requests and purchase orders."
              actionLabel={canManageVendors ? "New Vendor" : undefined}
              onAction={canManageVendors ? () => setIsAddVendorModalOpen(true) : undefined}
            />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Vendor Code</th>
                      <th className="px-6 py-3">Vendor Name</th>
                      <th className="px-6 py-3">Contact Person</th>
                      <th className="px-6 py-3">Email & Phone</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {vendorsData.items.map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-gray-900">{v.vendor_code}</td>
                        <td className="px-6 py-4 text-gray-900 font-semibold">{v.name}</td>
                        <td className="px-6 py-4 text-gray-600">{v.contact_person || "—"}</td>
                        <td className="px-6 py-4 text-gray-600">
                          <div>{v.email || "—"}</div>
                          {v.phone && <div className="text-xs text-gray-400">{v.phone}</div>}
                        </td>
                        <td className="px-6 py-4">
                          {v.is_active ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {canManageVendors && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => {
                                setEditingVendor(v);
                                setEditVendorForm({
                                  name: v.name,
                                  contact_person: v.contact_person,
                                  email: v.email,
                                  phone: v.phone,
                                  address: v.address,
                                  tax_id: v.tax_id,
                                  is_active: v.is_active,
                                });
                                setIsEditVendorModalOpen(true);
                              }}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              Edit
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {vendorsData.meta.total_pages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Showing Page {vendorsData.meta.page} of {vendorsData.meta.total_pages} (Total{" "}
                    {vendorsData.meta.total} vendors)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={vendorPage <= 1}
                      onClick={() => setVendorPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={vendorPage >= vendorsData.meta.total_pages}
                      onClick={() => setVendorPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 1: Create Purchase Request */}
      {/* ========================================== */}
      <Modal
        isOpen={isAddPrModalOpen}
        onClose={() => {
          setIsAddPrModalOpen(false);
          setFormError(null);
        }}
        title="Create Purchase Request"
      >
        <form onSubmit={handleCreatePr} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="purpose">
              Purpose / Description <span className="text-red-500">*</span>
            </Label>
            <Input
              id="purpose"
              placeholder="e.g. Office server upgrade components and memory"
              value={addPrForm.purpose}
              onChange={(e) => setAddPrForm({ ...addPrForm, purpose: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pr-priority">Priority</Label>
              <select
                id="pr-priority"
                value={addPrForm.priority || "medium"}
                onChange={(e) =>
                  setAddPrForm({ ...addPrForm, priority: e.target.value as PurchaseRequestPriority })
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pr-dept">Department</Label>
              <select
                id="pr-dept"
                value={addPrForm.department_id || ""}
                onChange={(e) =>
                  setAddPrForm({ ...addPrForm, department_id: e.target.value || null })
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No department assigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="required_date">Required By Date</Label>
              <Input
                id="required_date"
                type="date"
                value={addPrForm.required_date || ""}
                onChange={(e) => setAddPrForm({ ...addPrForm, required_date: e.target.value || null })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estimated_amount">Estimated Amount ($)</Label>
              <Input
                id="estimated_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={addPrForm.estimated_amount ?? ""}
                onChange={(e) =>
                  setAddPrForm({
                    ...addPrForm,
                    estimated_amount: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddPrModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Request (Draft)"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================== */}
      {/* MODAL 2: Create Purchase Order */}
      {/* ========================================== */}
      <Modal
        isOpen={isAddPoModalOpen}
        onClose={() => {
          setIsAddPoModalOpen(false);
          setFormError(null);
        }}
        title="Create Purchase Order"
      >
        <form onSubmit={handleCreatePo} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="po-vendor">
                Vendor <span className="text-red-500">*</span>
              </Label>
              <select
                id="po-vendor"
                value={addPoForm.vendor_id}
                onChange={(e) => setAddPoForm({ ...addPoForm, vendor_id: e.target.value })}
                required
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select Vendor</option>
                {vendorsData.items
                  .filter((v) => v.is_active)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.vendor_code})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="po-pr">Link Purchase Request (Optional)</Label>
              <select
                id="po-pr"
                value={addPoForm.purchase_request_id || ""}
                onChange={(e) =>
                  setAddPoForm({ ...addPoForm, purchase_request_id: e.target.value || null })
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No linked PR</option>
                {requestsData.items
                  .filter((pr) => pr.status === "approved" || pr.status === "submitted")
                  .map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.request_number} — {pr.purpose.slice(0, 30)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="po_order_date">
                Order Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="po_order_date"
                type="date"
                value={addPoForm.order_date}
                onChange={(e) => setAddPoForm({ ...addPoForm, order_date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="po_delivery_date">Expected Delivery Date</Label>
              <Input
                id="po_delivery_date"
                type="date"
                value={addPoForm.expected_delivery_date || ""}
                onChange={(e) =>
                  setAddPoForm({ ...addPoForm, expected_delivery_date: e.target.value || null })
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po_notes">Notes / Terms</Label>
            <Input
              id="po_notes"
              placeholder="Delivery terms, warranty notes, etc."
              value={addPoForm.notes || ""}
              onChange={(e) => setAddPoForm({ ...addPoForm, notes: e.target.value })}
            />
          </div>

          {/* Line Items Builder */}
          <div className="pt-2 border-t space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Line Items</h4>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItemRow} className="gap-1 h-8">
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {addPoForm.items.map((item, idx) => (
                <div key={idx} className="p-3 bg-gray-50 border rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-700">Item #{idx + 1}</span>
                    {addPoForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(idx)}
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Description *</Label>
                    <Input
                      placeholder="e.g. Dell PowerEdge R750 Server"
                      value={item.item_description}
                      onChange={(e) => handleItemChange(idx, "item_description", e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, "quantity", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Unit</Label>
                      <Input
                        value={item.unit || "units"}
                        onChange={(e) => handleItemChange(idx, "unit", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Price ($)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(idx, "unit_price", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Tax %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={item.tax_rate ?? 0}
                        onChange={(e) => handleItemChange(idx, "tax_rate", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Calculated Preview */}
            <div className="bg-gray-100 p-3 rounded-lg text-xs space-y-1 text-right">
              <div className="text-gray-600">
                Subtotal: <span className="font-semibold">${poTotals.subtotal.toFixed(2)}</span>
              </div>
              <div className="text-gray-600">
                Estimated Tax: <span className="font-semibold">${poTotals.taxAmount.toFixed(2)}</span>
              </div>
              <div className="text-sm font-bold text-gray-900 pt-1 border-t border-gray-300">
                Total PO Value: ${poTotals.total.toFixed(2)} USD
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddPoModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Purchase Order"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================== */}
      {/* MODAL 3: Create Vendor */}
      {/* ========================================== */}
      <Modal
        isOpen={isAddVendorModalOpen}
        onClose={() => {
          setIsAddVendorModalOpen(false);
          setFormError(null);
        }}
        title="Register New Vendor"
      >
        <form onSubmit={handleCreateVendor} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="v_code">
                Vendor Code <span className="text-red-500">*</span>
              </Label>
              <Input
                id="v_code"
                placeholder="e.g. VND-DELL"
                value={addVendorForm.vendor_code}
                onChange={(e) => setAddVendorForm({ ...addVendorForm, vendor_code: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="v_name">
                Vendor Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="v_name"
                placeholder="e.g. Dell Technologies Inc"
                value={addVendorForm.name}
                onChange={(e) => setAddVendorForm({ ...addVendorForm, name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="v_contact">Contact Person</Label>
              <Input
                id="v_contact"
                placeholder="Account Manager Name"
                value={addVendorForm.contact_person || ""}
                onChange={(e) => setAddVendorForm({ ...addVendorForm, contact_person: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="v_tax">Tax ID / GST</Label>
              <Input
                id="v_tax"
                placeholder="e.g. US-12345678"
                value={addVendorForm.tax_id || ""}
                onChange={(e) => setAddVendorForm({ ...addVendorForm, tax_id: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="v_email">Email</Label>
              <Input
                id="v_email"
                type="email"
                placeholder="sales@vendor.com"
                value={addVendorForm.email || ""}
                onChange={(e) => setAddVendorForm({ ...addVendorForm, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="v_phone">Phone</Label>
              <Input
                id="v_phone"
                placeholder="+1-555-0100"
                value={addVendorForm.phone || ""}
                onChange={(e) => setAddVendorForm({ ...addVendorForm, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v_addr">Address</Label>
            <Input
              id="v_addr"
              placeholder="Vendor Headquarters or billing address"
              value={addVendorForm.address || ""}
              onChange={(e) => setAddVendorForm({ ...addVendorForm, address: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddVendorModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Registering..." : "Register Vendor"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================== */}
      {/* MODAL 4: Edit Vendor */}
      {/* ========================================== */}
      <Modal
        isOpen={isEditVendorModalOpen}
        onClose={() => {
          setIsEditVendorModalOpen(false);
          setEditingVendor(null);
          setFormError(null);
        }}
        title={`Edit Vendor — ${editingVendor?.vendor_code || ""}`}
      >
        <form onSubmit={handleEditVendor} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="edit_v_name">
              Vendor Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit_v_name"
              value={editVendorForm.name || ""}
              onChange={(e) => setEditVendorForm({ ...editVendorForm, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit_v_contact">Contact Person</Label>
              <Input
                id="edit_v_contact"
                value={editVendorForm.contact_person || ""}
                onChange={(e) => setEditVendorForm({ ...editVendorForm, contact_person: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_v_tax">Tax ID / GST</Label>
              <Input
                id="edit_v_tax"
                value={editVendorForm.tax_id || ""}
                onChange={(e) => setEditVendorForm({ ...editVendorForm, tax_id: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit_v_email">Email</Label>
              <Input
                id="edit_v_email"
                type="email"
                value={editVendorForm.email || ""}
                onChange={(e) => setEditVendorForm({ ...editVendorForm, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit_v_phone">Phone</Label>
              <Input
                id="edit_v_phone"
                value={editVendorForm.phone || ""}
                onChange={(e) => setEditVendorForm({ ...editVendorForm, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_v_addr">Address</Label>
            <Input
              id="edit_v_addr"
              value={editVendorForm.address || ""}
              onChange={(e) => setEditVendorForm({ ...editVendorForm, address: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="edit_v_active"
              checked={editVendorForm.is_active ?? true}
              onChange={(e) => setEditVendorForm({ ...editVendorForm, is_active: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="edit_v_active" className="text-sm cursor-pointer">
              Vendor is active
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditVendorModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
