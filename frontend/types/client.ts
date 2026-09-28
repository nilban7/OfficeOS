/**
 * Client Management Types for OfficeOS Frontend
 * Matches FastAPI backend schemas in app.schemas.client
 */

export type ClientStatus = "active" | "inactive" | "archived";

export interface ClientContact {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  designation?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  organization_id: string;
  client_code: string;
  name: string;
  legal_name?: string | null;
  client_type?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_id?: string | null;
  status: ClientStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  primary_contact?: ClientContact | null;
  contacts_count?: number;
}

export interface ClientDetail extends Client {
  contacts: ClientContact[];
}

export interface ClientCreateInput {
  client_code: string;
  name: string;
  legal_name?: string | null;
  client_type?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_id?: string | null;
  status?: ClientStatus;
  notes?: string | null;
}

export interface ClientUpdateInput {
  client_code?: string;
  name?: string;
  legal_name?: string | null;
  client_type?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_id?: string | null;
  status?: ClientStatus;
  notes?: string | null;
}

export interface ContactCreateInput {
  name: string;
  designation?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  notes?: string | null;
}

export interface ContactUpdateInput {
  name?: string;
  designation?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  notes?: string | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ClientListResponse {
  items: Client[];
  meta: PaginationMeta;
}
