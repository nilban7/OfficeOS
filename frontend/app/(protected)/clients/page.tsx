"use client";

import * as React from "react";
import Link from "next/link";
import {
  Briefcase,
  Plus,
  Search,
  Building2,
  Mail,
  Phone,
  Edit2,
  Archive,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Eye,
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
import type {
  Client,
  ClientCreateInput,
  ClientListResponse,
  ClientStatus,
  ClientUpdateInput,
} from "@/types/client";

export default function ClientsPage() {
  const { currentOrganization, permissions, membership, isLoading: isOrgLoading } = useOrganization();

  const isSystemAdmin = membership?.role === "system_admin";

  // Permissions
  const canViewClients = isSystemAdmin || permissions.includes("clients.view");
  const canCreateClients = isSystemAdmin || permissions.includes("clients.create");
  const canUpdateClients = isSystemAdmin || permissions.includes("clients.update");
  const canDeleteClients = isSystemAdmin || permissions.includes("clients.delete");

  // Client Data & Filters
  const [clientsData, setClientsData] = React.useState<ClientListResponse>({
    items: [],
    meta: { total: 0, page: 1, page_size: 20, total_pages: 1 },
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize] = React.useState(20);

  // Global Alerts
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [editingClient, setEditingClient] = React.useState<Client | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = React.useState(false);
  const [clientToArchive, setClientToArchive] = React.useState<Client | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Add Client Form State
  const [addForm, setAddForm] = React.useState<ClientCreateInput>({
    client_code: "",
    name: "",
    legal_name: "",
    client_type: "enterprise",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    tax_id: "",
    status: "active",
    notes: "",
  });

  // Edit Client Form State
  const [editForm, setEditForm] = React.useState<ClientUpdateInput>({});

  // Fetch Clients
  const fetchClients = React.useCallback(async () => {
    if (!currentOrganization?.id || !canViewClients) return;

    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: pageSize,
      };

      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      const res = await apiClient.get<ClientListResponse>(API_ENDPOINTS.clients.list, {
        params,
        organizationId: currentOrganization.id,
      });

      if (res && res.items) {
        setClientsData(res);
      }
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load clients. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, canViewClients, currentPage, pageSize, searchTerm, statusFilter]);

  React.useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Handle Search Input (reset to page 1)
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  // Add Client Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !canCreateClients) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: ClientCreateInput = {
        client_code: addForm.client_code.trim().toUpperCase(),
        name: addForm.name.trim(),
        legal_name: addForm.legal_name?.trim() || null,
        client_type: addForm.client_type || null,
        email: addForm.email?.trim() || null,
        phone: addForm.phone?.trim() || null,
        website: addForm.website?.trim() || null,
        address: addForm.address?.trim() || null,
        city: addForm.city?.trim() || null,
        state: addForm.state?.trim() || null,
        postal_code: addForm.postal_code?.trim() || null,
        country: addForm.country?.trim() || null,
        tax_id: addForm.tax_id?.trim() || null,
        status: (addForm.status as ClientStatus) || "active",
        notes: addForm.notes?.trim() || null,
      };

      await apiClient.post<Client>(API_ENDPOINTS.clients.create, payload, {
        organizationId: currentOrganization.id,
      });

      setIsAddModalOpen(false);
      setSuccessMessage(`Client ${payload.name} created successfully.`);
      setAddForm({
        client_code: "",
        name: "",
        legal_name: "",
        client_type: "enterprise",
        email: "",
        phone: "",
        website: "",
        address: "",
        city: "",
        state: "",
        postal_code: "",
        country: "",
        tax_id: "",
        status: "active",
        notes: "",
      });
      await fetchClients();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to create client. Please verify information and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setEditForm({
      client_code: client.client_code,
      name: client.name,
      legal_name: client.legal_name || "",
      client_type: client.client_type || "",
      email: client.email || "",
      phone: client.phone || "",
      website: client.website || "",
      address: client.address || "",
      city: client.city || "",
      state: client.state || "",
      postal_code: client.postal_code || "",
      country: client.country || "",
      tax_id: client.tax_id || "",
      status: client.status,
      notes: client.notes || "",
    });
    setFormError(null);
    setIsEditModalOpen(true);
  };

  // Edit Client Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !editingClient || !canUpdateClients) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: ClientUpdateInput = {
        client_code: editForm.client_code?.trim().toUpperCase(),
        name: editForm.name?.trim(),
        legal_name: editForm.legal_name?.trim() || null,
        client_type: editForm.client_type || null,
        email: editForm.email?.trim() || null,
        phone: editForm.phone?.trim() || null,
        website: editForm.website?.trim() || null,
        address: editForm.address?.trim() || null,
        city: editForm.city?.trim() || null,
        state: editForm.state?.trim() || null,
        postal_code: editForm.postal_code?.trim() || null,
        country: editForm.country?.trim() || null,
        tax_id: editForm.tax_id?.trim() || null,
        status: editForm.status,
        notes: editForm.notes?.trim() || null,
      };

      await apiClient.patch<Client>(
        API_ENDPOINTS.clients.update(editingClient.id),
        payload,
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsEditModalOpen(false);
      setSuccessMessage(`Client ${editingClient.name} updated successfully.`);
      await fetchClients();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update client. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Archive Confirmation
  const openArchiveModal = (client: Client) => {
    setClientToArchive(client);
    setFormError(null);
    setIsArchiveModalOpen(true);
  };

  // Confirm Archive
  const handleArchiveSubmit = async () => {
    if (!currentOrganization?.id || !clientToArchive || !canDeleteClients) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.delete<Client>(
        API_ENDPOINTS.clients.delete(clientToArchive.id),
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsArchiveModalOpen(false);
      setSuccessMessage(`Client ${clientToArchive.name} has been archived.`);
      await fetchClients();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to archive client. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isOrgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingState message="Loading organization context..." />
      </div>
    );
  }

  // Permission Denied View
  if (!canViewClients) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-4">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-600 max-w-md mb-6">
          You do not have permission to view clients in this organization. Contact your administrator if you need access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary-600" />
            Client Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your organization clients, corporate profiles, and key point-of-contact details.
          </p>
        </div>

        {canCreateClients && (
          <Button
            onClick={() => {
              setFormError(null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Client
          </Button>
        )}
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-semibold text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <ErrorState
          title="Error loading clients"
          message={error}
          onRetry={fetchClients}
        />
      )}

      {/* Filter and Search Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by code, name, tax ID..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-9"
              />
            </div>

            {/* Status Filter Buttons */}
            <div className="flex items-center gap-1.5 self-start md:self-auto overflow-x-auto w-full md:w-auto">
              <span className="text-xs font-semibold text-slate-500 mr-1 uppercase tracking-wider">
                Status:
              </span>
              {(["all", "active", "inactive", "archived"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusFilterChange(status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${
                    statusFilter === status
                      ? "bg-primary-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clients Table / List */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <LoadingState message="Loading clients..." />
        </div>
      ) : clientsData.items.length === 0 ? (
        <EmptyState
          title="No clients found"
          description={
            searchTerm || statusFilter !== "all"
              ? "No clients matched your search criteria. Try clearing filters."
              : "No clients have been registered for this organization yet."
          }
          actionLabel={canCreateClients ? "Add First Client" : undefined}
          onAction={canCreateClients ? () => setIsAddModalOpen(true) : undefined}
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Code / Client</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Primary Contact</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientsData.items.map((client) => {
                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Code & Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div>
                            <Link
                              href={`/clients/${client.id}`}
                              className="font-semibold text-slate-900 hover:text-primary-600 hover:underline flex items-center gap-1.5"
                            >
                              {client.name}
                              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-xs font-medium text-slate-500">
                                {client.client_code}
                              </span>
                              {client.tax_id && (
                                <span className="text-[11px] text-slate-400">
                                  • Tax ID: {client.tax_id}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Client Type */}
                      <td className="px-4 py-3">
                        <span className="capitalize text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {client.client_type || "Standard"}
                        </span>
                      </td>

                      {/* Primary Contact */}
                      <td className="px-4 py-3">
                        {client.primary_contact ? (
                          <div>
                            <p className="font-medium text-xs text-slate-900">
                              {client.primary_contact.name}
                            </p>
                            <div className="text-[11px] text-slate-500 flex flex-col gap-0.5 mt-0.5">
                              {client.primary_contact.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {client.primary_contact.email}
                                </span>
                              )}
                              {client.primary_contact.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {client.primary_contact.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            No contacts yet
                          </span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {client.city || client.country ? (
                          <span>
                            {[client.city, client.state, client.country]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            client.status === "active"
                              ? "success"
                              : client.status === "inactive"
                              ? "outline"
                              : "destructive"
                          }
                          className="capitalize text-[11px]"
                        >
                          {client.status}
                        </Badge>
                      </td>

                      {/* Action Buttons */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/clients/${client.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View Client Details"
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4 text-slate-500" />
                            </Button>
                          </Link>

                          {canUpdateClients && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit Client"
                              onClick={() => openEditModal(client)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="h-4 w-4 text-slate-500" />
                            </Button>
                          )}

                          {canDeleteClients && client.status !== "archived" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Archive Client"
                              onClick={() => openArchiveModal(client)}
                              className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {clientsData.meta.total_pages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-500 px-2">
              <span>
                Showing page {clientsData.meta.page} of {clientsData.meta.total_pages} (
                {clientsData.meta.total} clients total)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= clientsData.meta.total_pages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="h-8"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Client Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !isSubmitting && setIsAddModalOpen(false)}
        title="Create New Client"
        description="Add a new client profile to your organization directory."
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="client_code">Client Code *</Label>
              <Input
                id="client_code"
                required
                placeholder="e.g. CLI-001"
                value={addForm.client_code}
                onChange={(e) => setAddForm({ ...addForm, client_code: e.target.value })}
                className="mt-1 font-mono uppercase"
              />
            </div>
            <div>
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                required
                placeholder="Company or client name"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="legal_name">Legal Entity Name</Label>
              <Input
                id="legal_name"
                placeholder="Registered business name"
                value={addForm.legal_name || ""}
                onChange={(e) => setAddForm({ ...addForm, legal_name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="client_type">Client Category / Type</Label>
              <select
                id="client_type"
                value={addForm.client_type || ""}
                onChange={(e) => setAddForm({ ...addForm, client_type: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="enterprise">Enterprise</option>
                <option value="sme">Small / Medium Business (SME)</option>
                <option value="startup">Startup</option>
                <option value="government">Government / Public</option>
                <option value="individual">Individual</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="email">Business Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="contact@company.com"
                value={addForm.email || ""}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="+1 555-0100"
                value={addForm.phone || ""}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="tax_id">Tax / GST Identifier</Label>
              <Input
                id="tax_id"
                placeholder="GSTIN / VAT / EIN"
                value={addForm.tax_id || ""}
                onChange={(e) => setAddForm({ ...addForm, tax_id: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="City"
                value={addForm.city || ""}
                onChange={(e) => setAddForm({ ...addForm, city: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="state">State / Province</Label>
              <Input
                id="state"
                placeholder="State"
                value={addForm.state || ""}
                onChange={(e) => setAddForm({ ...addForm, state: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                placeholder="Country"
                value={addForm.country || ""}
                onChange={(e) => setAddForm({ ...addForm, country: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes / Background</Label>
            <textarea
              id="notes"
              rows={2}
              placeholder="Key industry, payment terms, or client preferences..."
              value={addForm.notes || ""}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Client"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Client Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !isSubmitting && setIsEditModalOpen(false)}
        title={`Edit Client — ${editingClient?.name}`}
        description="Update client details and status."
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit_client_code">Client Code *</Label>
              <Input
                id="edit_client_code"
                required
                value={editForm.client_code || ""}
                onChange={(e) => setEditForm({ ...editForm, client_code: e.target.value })}
                className="mt-1 font-mono uppercase"
              />
            </div>
            <div>
              <Label htmlFor="edit_name">Client Name *</Label>
              <Input
                id="edit_name"
                required
                value={editForm.name || ""}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit_status">Status</Label>
              <select
                id="edit_status"
                value={editForm.status || "active"}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ClientStatus })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <Label htmlFor="edit_tax_id">Tax / GST ID</Label>
              <Input
                id="edit_tax_id"
                value={editForm.tax_id || ""}
                onChange={(e) => setEditForm({ ...editForm, tax_id: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit_email">Business Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={editForm.email || ""}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit_phone">Phone Number</Label>
              <Input
                id="edit_phone"
                value={editForm.phone || ""}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit_notes">Notes</Label>
            <textarea
              id="edit_notes"
              rows={2}
              value={editForm.notes || ""}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
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

      {/* Archive Client Modal */}
      <Modal
        isOpen={isArchiveModalOpen}
        onClose={() => !isSubmitting && setIsArchiveModalOpen(false)}
        title="Archive Client"
        description="Are you sure you want to archive this client?"
      >
        <div className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <p className="text-sm text-slate-600">
            Archiving <strong>{clientToArchive?.name}</strong> will mark it as archived. Existing projects and historical records will remain intact.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsArchiveModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchiveSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Archiving..." : "Archive Client"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
