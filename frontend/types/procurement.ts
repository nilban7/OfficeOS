/**
 * Procurement & Purchase Management Types for OfficeOS Frontend
 * Matches FastAPI backend schemas in app.schemas.procurement
 */

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ==========================================
// Vendor Types
// ==========================================
export interface Vendor {
  id: string;
  organization_id: string;
  vendor_code: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tax_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorCreateInput {
  vendor_code: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tax_id?: string | null;
  is_active?: boolean;
}

export interface VendorUpdateInput {
  name?: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tax_id?: string | null;
  is_active?: boolean;
}

export interface VendorListResponse {
  items: Vendor[];
  meta: PaginationMeta;
}

// ==========================================
// Purchase Request Types
// ==========================================
export type PurchaseRequestStatus = "draft" | "submitted" | "approved" | "rejected" | "cancelled";
export type PurchaseRequestPriority = "low" | "medium" | "high" | "urgent";

export interface PurchaseRequest {
  id: string;
  organization_id: string;
  request_number: string;
  requester_id: string;
  department_id?: string | null;
  required_date?: string | null;
  priority: PurchaseRequestPriority;
  purpose: string;
  estimated_amount?: number | string | null;
  currency: string;
  status: PurchaseRequestStatus;
  reviewer_id?: string | null;
  reviewed_at?: string | null;
  reviewer_comment?: string | null;
  created_at: string;
  updated_at: string;
  requester_name?: string | null;
  requester_code?: string | null;
  requester_email?: string | null;
  department_name?: string | null;
  reviewer_name?: string | null;
}

export interface PurchaseRequestCreateInput {
  department_id?: string | null;
  required_date?: string | null;
  priority?: PurchaseRequestPriority;
  purpose: string;
  estimated_amount?: number | null;
  currency?: string;
}

export interface PurchaseRequestUpdateInput {
  department_id?: string | null;
  required_date?: string | null;
  priority?: PurchaseRequestPriority;
  purpose?: string;
  estimated_amount?: number | null;
  currency?: string;
}

export interface PurchaseRequestReviewInput {
  reviewer_comment?: string | null;
}

export interface PurchaseRequestListResponse {
  items: PurchaseRequest[];
  meta: PaginationMeta;
}

// ==========================================
// Purchase Order Types
// ==========================================
export type PurchaseOrderStatus = "draft" | "issued" | "partially_received" | "received" | "cancelled" | "closed";

export interface PurchaseOrderItem {
  id: string;
  organization_id: string;
  purchase_order_id: string;
  item_description: string;
  quantity: number | string;
  unit: string;
  unit_price: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  line_total: number | string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItemInput {
  item_description: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  tax_rate?: number;
}

export interface PurchaseOrder {
  id: string;
  organization_id: string;
  po_number: string;
  vendor_id: string;
  purchase_request_id?: string | null;
  order_date: string;
  expected_delivery_date?: string | null;
  status: PurchaseOrderStatus;
  subtotal: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  currency: string;
  notes?: string | null;
  created_by_id?: string | null;
  created_at: string;
  updated_at: string;
  vendor_name?: string | null;
  vendor_code?: string | null;
  purchase_request_number?: string | null;
  created_by_name?: string | null;
  items_count?: number;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  items: PurchaseOrderItem[];
}

export interface PurchaseOrderCreateInput {
  vendor_id: string;
  purchase_request_id?: string | null;
  order_date: string;
  expected_delivery_date?: string | null;
  currency?: string;
  notes?: string | null;
  items: PurchaseOrderItemInput[];
}

export interface PurchaseOrderUpdateInput {
  vendor_id?: string;
  expected_delivery_date?: string | null;
  notes?: string | null;
  items?: PurchaseOrderItemInput[];
}

export interface PurchaseOrderListResponse {
  items: PurchaseOrder[];
  meta: PaginationMeta;
}
