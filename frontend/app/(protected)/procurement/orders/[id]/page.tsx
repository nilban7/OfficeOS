"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Edit2,
  XCircle,
  Plus,
  Trash2,
  Check,
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
  PurchaseOrderDetail,
  PurchaseOrderItem,
  PurchaseOrderItemInput,
  PurchaseOrderStatus,
  PurchaseOrderUpdateInput,
  Vendor,
  VendorListResponse,
} from "@/types/procurement";

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canViewProcurement =
    permissions.includes("procurement.view") ||
    permissions.includes("purchase_orders.view") ||
    permissions.includes("purchase_orders.manage");
  const canManagePO = permissions.includes("purchase_orders.manage");

  // State
  const [order, setOrder] = React.useState<PurchaseOrderDetail | null>(null);
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Alerts
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = React.useState(false);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Edit PO Form State
  const [editForm, setEditForm] = React.useState<PurchaseOrderUpdateInput>({
    vendor_id: "",
    expected_delivery_date: null,
    notes: "",
    items: [],
  });

  // Fetch Order Details
  const fetchOrder = React.useCallback(async () => {
    if (!currentOrganization || !orderId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [orderRes, vendorRes] = await Promise.all([
        apiClient.get<PurchaseOrderDetail>(API_ENDPOINTS.purchaseOrders.detail(orderId), {
          headers: { "X-Organization-Id": currentOrganization.id },
        }),
        apiClient.get<VendorListResponse>(API_ENDPOINTS.vendors.list, {
          headers: { "X-Organization-Id": currentOrganization.id },
          params: { page_size: 100 },
        }),
      ]);

      if (orderRes) {
        setOrder(orderRes);
        setEditForm({
          vendor_id: orderRes.vendor_id,
          expected_delivery_date: orderRes.expected_delivery_date,
          notes: orderRes.notes || "",
          items: orderRes.items.map((it: PurchaseOrderItem) => ({
            item_description: it.item_description,
            quantity: Number(it.quantity),
            unit: it.unit,
            unit_price: Number(it.unit_price),
            tax_rate: Number(it.tax_rate),
          })),
        });
      }
      setVendors(vendorRes?.items || []);
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load purchase order details.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, orderId]);

  React.useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Edit Dynamic Item Handlers
  const handleItemChange = (index: number, field: keyof PurchaseOrderItemInput, value: string | number) => {
    if (!editForm.items) return;
    const updated = [...editForm.items];
    const current = updated[index];
    if (!current) return;
    updated[index] = {
      ...current,
      [field]: field === "quantity" || field === "unit_price" || field === "tax_rate" ? Number(value) : String(value),
    } as PurchaseOrderItemInput;
    setEditForm({ ...editForm, items: updated });
  };

  const handleAddItemRow = () => {
    setEditForm({
      ...editForm,
      items: [
        ...(editForm.items || []),
        { item_description: "", quantity: 1, unit: "units", unit_price: 0, tax_rate: 0 },
      ],
    });
  };

  const handleRemoveItemRow = (index: number) => {
    if (!editForm.items || editForm.items.length <= 1) return;
    const updated = editForm.items.filter((_, i) => i !== index);
    setEditForm({ ...editForm, items: updated });
  };

  // Totals preview for edit modal
  const editTotals = React.useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    for (const it of editForm.items || []) {
      const q = Number(it.quantity) || 0;
      const p = Number(it.unit_price) || 0;
      const r = Number(it.tax_rate) || 0;
      const lineSub = q * p;
      const lineTax = lineSub * (r / 100);
      subtotal += lineSub;
      taxAmount += lineTax;
    }
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  }, [editForm.items]);

  // Handle Update PO
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !orderId) return;

    if (!editForm.items || editForm.items.length === 0 || editForm.items.some((it) => !it.item_description.trim())) {
      setFormError("All line items must have a valid description.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: PurchaseOrderUpdateInput = {
        vendor_id: editForm.vendor_id,
        expected_delivery_date: editForm.expected_delivery_date || null,
        notes: editForm.notes?.trim() || null,
        items: editForm.items.map((it) => ({
          item_description: it.item_description.trim(),
          quantity: Number(it.quantity) || 1,
          unit: it.unit?.trim() || "units",
          unit_price: Number(it.unit_price) || 0,
          tax_rate: Number(it.tax_rate) || 0,
        })),
      };

      await apiClient.patch(API_ENDPOINTS.purchaseOrders.update(orderId), payload, {
        headers: { "X-Organization-Id": currentOrganization.id },
      });

      setSuccessMessage("Purchase order updated successfully.");
      setIsEditModalOpen(false);
      fetchOrder();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update purchase order.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Cancel PO
  const handleCancel = async () => {
    if (!currentOrganization || !orderId) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.purchaseOrders.cancel(orderId),
        {},
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );

      setSuccessMessage("Purchase order cancelled.");
      setIsCancelModalOpen(false);
      fetchOrder();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to cancel purchase order.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Close PO
  const handleClose = async () => {
    if (!currentOrganization || !orderId) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.post(
        API_ENDPOINTS.purchaseOrders.close(orderId),
        {},
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );

      setSuccessMessage("Purchase order marked as closed.");
      setIsCloseModalOpen(false);
      fetchOrder();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to close purchase order.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status Badge
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

  if (isOrgLoading || isLoading) {
    return <LoadingState message="Loading purchase order details..." />;
  }

  if (!canViewProcurement) {
    return (
      <div className="p-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-sm text-gray-600">
              You do not have permission to view purchase orders.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <ErrorState message={error || "Purchase order not found"} onRetry={fetchOrder} />
        <div className="mt-4">
          <Link href="/procurement">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Procurement
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/procurement"
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Procurement
        </Link>
      </div>

      {/* Success Alert */}
      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono text-gray-900">{order.po_number}</h1>
            {getPoStatusBadge(order.status)}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Order Date: {order.order_date} &middot; Created{" "}
            {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {canManagePO && order.status === "draft" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditModalOpen(true)}
                className="gap-1.5"
              >
                <Edit2 className="w-4 h-4" />
                Edit Order
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                className="gap-1.5 text-rose-600 hover:text-rose-700"
              >
                <XCircle className="w-4 h-4" />
                Cancel Order
              </Button>
            </>
          )}

          {canManagePO && (order.status === "issued" || order.status === "partially_received" || order.status === "received") && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCloseModalOpen(true)}
                className="gap-1.5 bg-slate-700 hover:bg-slate-800"
              >
                <Check className="w-4 h-4" />
                Close PO
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                className="gap-1.5 text-rose-600 hover:text-rose-700"
              >
                <XCircle className="w-4 h-4" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Top Cards: Vendor & Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Vendor Profile (1 col) */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Vendor Information
            </h3>

            <div className="space-y-2 text-sm">
              <div>
                <span className="text-xs text-gray-500 block">Vendor Name</span>
                <span className="font-bold text-gray-900">{order.vendor_name || "—"}</span>
                {order.vendor_code && (
                  <span className="block text-xs font-mono text-gray-500">Code: {order.vendor_code}</span>
                )}
              </div>

              {order.purchase_request_number && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-gray-500 block">Linked Requisition</span>
                  <span className="font-mono text-xs text-blue-600 font-semibold">
                    {order.purchase_request_number}
                  </span>
                </div>
              )}

              {order.created_by_name && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-gray-500 block">Prepared By</span>
                  <span className="text-gray-900 font-medium">{order.created_by_name}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Delivery & Timeline (1 col) */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              Timeline & Delivery
            </h3>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-gray-500 block">Order Issue Date</span>
                <span className="font-semibold text-gray-900">{order.order_date}</span>
              </div>

              <div>
                <span className="text-xs text-gray-500 block">Expected Delivery Date</span>
                <span className="font-semibold text-gray-900">
                  {order.expected_delivery_date || "Not specified"}
                </span>
              </div>

              {order.notes && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-gray-500 block mb-1">Notes / Terms</span>
                  <p className="text-xs text-gray-700 italic bg-gray-50 p-2 rounded border">
                    {order.notes}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary (1 col) */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Financial Summary
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span className="font-medium">
                  {order.currency}{" "}
                  {Number(order.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span>Tax Total:</span>
                <span className="font-medium">
                  {order.currency}{" "}
                  {Number(order.tax_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>Total Amount:</span>
                <span className="text-emerald-700">
                  {order.currency}{" "}
                  {Number(order.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items Table */}
      <Card>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            Order Line Items ({order.items.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 w-12">#</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3 text-right">Quantity</th>
                <th className="px-6 py-3 text-right">Unit Price</th>
                <th className="px-6 py-3 text-right">Tax %</th>
                <th className="px-6 py-3 text-right">Tax Amount</th>
                <th className="px-6 py-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {order.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50/80">
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{idx + 1}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{item.item_description}</td>
                  <td className="px-6 py-4 text-right text-gray-700">
                    {Number(item.quantity)} {item.unit}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700 font-mono">
                    ${Number(item.unit_price).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-500 font-mono">
                    {Number(item.tax_rate).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-right text-gray-500 font-mono">
                    ${Number(item.tax_amount).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900 font-mono">
                    ${Number(item.line_total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ========================================== */}
      {/* EDIT MODAL */}
      {/* ========================================== */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setFormError(null);
        }}
        title={`Edit Purchase Order — ${order.po_number}`}
      >
        <form onSubmit={handleUpdate} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-vendor">Vendor</Label>
              <select
                id="edit-vendor"
                value={editForm.vendor_id}
                onChange={(e) => setEditForm({ ...editForm, vendor_id: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {vendors
                  .filter((v) => v.is_active || v.id === order.vendor_id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.vendor_code})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-delivery">Expected Delivery Date</Label>
              <Input
                id="edit-delivery"
                type="date"
                value={editForm.expected_delivery_date || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, expected_delivery_date: e.target.value || null })
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Notes</Label>
            <Input
              id="edit-notes"
              value={editForm.notes || ""}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </div>

          {/* Line items editor */}
          <div className="pt-2 border-t space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Line Items</h4>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItemRow} className="gap-1 h-8">
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {editForm.items?.map((item, idx) => (
                <div key={idx} className="p-3 bg-gray-50 border rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-700">Item #{idx + 1}</span>
                    {(editForm.items?.length || 0) > 1 && (
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

            <div className="bg-gray-100 p-3 rounded-lg text-xs space-y-1 text-right">
              <div className="text-gray-600">
                Subtotal: <span className="font-semibold">${editTotals.subtotal.toFixed(2)}</span>
              </div>
              <div className="text-gray-600">
                Estimated Tax: <span className="font-semibold">${editTotals.taxAmount.toFixed(2)}</span>
              </div>
              <div className="text-sm font-bold text-gray-900 pt-1 border-t border-gray-300">
                Updated Total: ${editTotals.total.toFixed(2)} USD
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
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

      {/* ========================================== */}
      {/* CANCEL CONFIRM MODAL */}
      {/* ========================================== */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Purchase Order"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to cancel purchase order <strong>{order.po_number}</strong>?
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button onClick={handleCancel} disabled={isSubmitting} variant="destructive">
              {isSubmitting ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================== */}
      {/* CLOSE CONFIRM MODAL */}
      {/* ========================================== */}
      <Modal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        title="Close Purchase Order"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Confirm closure of purchase order <strong>{order.po_number}</strong>. This indicates all items
            have been fulfilled and processed.
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCloseModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleClose} disabled={isSubmitting} className="bg-slate-800 hover:bg-slate-900 text-white">
              {isSubmitting ? "Closing..." : "Confirm Close"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
