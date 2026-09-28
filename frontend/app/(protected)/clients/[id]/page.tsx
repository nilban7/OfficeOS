"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Edit2,
  Archive,
  Plus,
  Trash2,
  Star,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ClientContact,
  ClientDetail,
  ClientStatus,
  ClientUpdateInput,
  ContactCreateInput,
  ContactUpdateInput,
} from "@/types/client";

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params?.id as string;

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canViewClients = permissions.includes("clients.view");
  const canUpdateClients = permissions.includes("clients.update");
  const canDeleteClients = permissions.includes("clients.delete");
  const canViewContacts = permissions.includes("client_contacts.view");
  const canManageContacts = permissions.includes("client_contacts.manage");

  // Client Data State
  const [client, setClient] = React.useState<ClientDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Edit Client Modal
  const [isEditClientOpen, setIsEditClientOpen] = React.useState(false);
  const [editClientForm, setEditClientForm] = React.useState<ClientUpdateInput>({});
  const [isArchiveModalOpen, setIsArchiveModalOpen] = React.useState(false);

  // Contact Modals
  const [isAddContactOpen, setIsAddContactOpen] = React.useState(false);
  const [isEditContactOpen, setIsEditContactOpen] = React.useState(false);
  const [isDeleteContactOpen, setIsDeleteContactOpen] = React.useState(false);

  const [addContactForm, setAddContactForm] = React.useState<ContactCreateInput>({
    name: "",
    designation: "",
    email: "",
    phone: "",
    is_primary: false,
    notes: "",
  });

  const [selectedContact, setSelectedContact] = React.useState<ClientContact | null>(null);
  const [editContactForm, setEditContactForm] = React.useState<ContactUpdateInput>({});

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Fetch Client Details
  const fetchClientDetails = React.useCallback(async () => {
    if (!currentOrganization?.id || !clientId || !canViewClients) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<ClientDetail>(API_ENDPOINTS.clients.detail(clientId), {
        organizationId: currentOrganization.id,
      });

      if (res && res.id) {
        setClient(res);
      }
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to load client details. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, clientId, canViewClients]);

  React.useEffect(() => {
    fetchClientDetails();
  }, [fetchClientDetails]);

  // Open Edit Client Modal
  const openEditClientModal = () => {
    if (!client) return;
    setEditClientForm({
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
    setIsEditClientOpen(true);
  };

  // Submit Edit Client
  const handleEditClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !client || !canUpdateClients) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: ClientUpdateInput = {
        client_code: editClientForm.client_code?.trim().toUpperCase(),
        name: editClientForm.name?.trim(),
        legal_name: editClientForm.legal_name?.trim() || null,
        client_type: editClientForm.client_type || null,
        email: editClientForm.email?.trim() || null,
        phone: editClientForm.phone?.trim() || null,
        website: editClientForm.website?.trim() || null,
        address: editClientForm.address?.trim() || null,
        city: editClientForm.city?.trim() || null,
        state: editClientForm.state?.trim() || null,
        postal_code: editClientForm.postal_code?.trim() || null,
        country: editClientForm.country?.trim() || null,
        tax_id: editClientForm.tax_id?.trim() || null,
        status: editClientForm.status,
        notes: editClientForm.notes?.trim() || null,
      };

      const res = await apiClient.patch<ClientDetail>(
        API_ENDPOINTS.clients.update(client.id),
        payload,
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsEditClientOpen(false);
      setClient(res);
      setSuccessMessage("Client details updated successfully.");
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

  // Archive Client
  const handleArchiveClient = async () => {
    if (!currentOrganization?.id || !client || !canDeleteClients) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await apiClient.delete<ClientDetail>(API_ENDPOINTS.clients.delete(client.id), {
        organizationId: currentOrganization.id,
      });

      setIsArchiveModalOpen(false);
      setClient(res);
      setSuccessMessage("Client has been archived.");
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

  // Add Contact Submit
  const handleAddContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !client || !canManageContacts) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: ContactCreateInput = {
        name: addContactForm.name.trim(),
        designation: addContactForm.designation?.trim() || null,
        email: addContactForm.email?.trim() || null,
        phone: addContactForm.phone?.trim() || null,
        is_primary: Boolean(addContactForm.is_primary),
        notes: addContactForm.notes?.trim() || null,
      };

      await apiClient.post<ClientContact>(
        API_ENDPOINTS.clients.contacts(client.id),
        payload,
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsAddContactOpen(false);
      setSuccessMessage(`Contact ${payload.name} added successfully.`);
      setAddContactForm({
        name: "",
        designation: "",
        email: "",
        phone: "",
        is_primary: false,
        notes: "",
      });
      await fetchClientDetails();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to add contact. Please verify details and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Contact Modal
  const openEditContactModal = (contact: ClientContact) => {
    setSelectedContact(contact);
    setEditContactForm({
      name: contact.name,
      designation: contact.designation || "",
      email: contact.email || "",
      phone: contact.phone || "",
      is_primary: contact.is_primary,
      notes: contact.notes || "",
    });
    setFormError(null);
    setIsEditContactOpen(true);
  };

  // Submit Edit Contact
  const handleEditContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !client || !selectedContact || !canManageContacts) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: ContactUpdateInput = {
        name: editContactForm.name?.trim(),
        designation: editContactForm.designation?.trim() || null,
        email: editContactForm.email?.trim() || null,
        phone: editContactForm.phone?.trim() || null,
        is_primary: editContactForm.is_primary,
        notes: editContactForm.notes?.trim() || null,
      };

      await apiClient.patch<ClientContact>(
        API_ENDPOINTS.clients.contactDetail(client.id, selectedContact.id),
        payload,
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsEditContactOpen(false);
      setSuccessMessage(`Contact ${selectedContact.name} updated successfully.`);
      await fetchClientDetails();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to update contact. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Delete Contact Modal
  const openDeleteContactModal = (contact: ClientContact) => {
    setSelectedContact(contact);
    setFormError(null);
    setIsDeleteContactOpen(true);
  };

  // Submit Delete Contact
  const handleDeleteContactSubmit = async () => {
    if (!currentOrganization?.id || !client || !selectedContact || !canManageContacts) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiClient.delete(
        API_ENDPOINTS.clients.contactDetail(client.id, selectedContact.id),
        {
          organizationId: currentOrganization.id,
        }
      );

      setIsDeleteContactOpen(false);
      setSuccessMessage(`Contact ${selectedContact.name} deleted successfully.`);
      await fetchClientDetails();
    } catch (err) {
      if (err instanceof ApiException) {
        setFormError(err.message);
      } else {
        setFormError("Failed to delete contact. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isOrgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingState message="Loading client details..." />
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
          You do not have permission to view clients in this organization.
        </p>
        <Link href={ROUTES.CLIENTS}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Clients
          </Button>
        </Link>
      </div>
    );
  }

  // Error State
  if (error || !client) {
    return (
      <div className="space-y-4">
        <Link href={ROUTES.CLIENTS}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Clients
          </Button>
        </Link>
        <ErrorState
          title="Client not found"
          message={error || "The requested client record could not be loaded."}
          onRetry={fetchClientDetails}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href={ROUTES.CLIENTS}
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Clients
        </Link>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600 shadow-sm shrink-0">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {client.name}
              </h1>
              <Badge
                variant={
                  client.status === "active"
                    ? "success"
                    : client.status === "inactive"
                    ? "outline"
                    : "destructive"
                }
                className="capitalize"
              >
                {client.status}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
              <span className="font-mono font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                {client.client_code}
              </span>
              {client.legal_name && (
                <span>Legal Name: {client.legal_name}</span>
              )}
              {client.client_type && (
                <span className="capitalize">• Type: {client.client_type}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canUpdateClients && (
            <Button
              variant="outline"
              size="sm"
              onClick={openEditClientModal}
              className="flex items-center gap-1.5"
            >
              <Edit2 className="h-4 w-4" />
              Edit Client
            </Button>
          )}

          {canDeleteClients && client.status !== "archived" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsArchiveModalOpen(true)}
              className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          )}
        </div>
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

      {/* Information Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contact & Business Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Corporate Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-400 block">Email</span>
              {client.email ? (
                <a
                  href={`mailto:${client.email}`}
                  className="text-primary-600 hover:underline flex items-center gap-1.5 mt-0.5"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {client.email}
                </a>
              ) : (
                <span className="text-slate-400 text-xs italic">Not provided</span>
              )}
            </div>

            <div>
              <span className="text-xs text-slate-400 block">Phone</span>
              {client.phone ? (
                <a
                  href={`tel:${client.phone}`}
                  className="text-slate-800 flex items-center gap-1.5 mt-0.5"
                >
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  {client.phone}
                </a>
              ) : (
                <span className="text-slate-400 text-xs italic">Not provided</span>
              )}
            </div>

            <div>
              <span className="text-xs text-slate-400 block">Website</span>
              {client.website ? (
                <a
                  href={client.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline flex items-center gap-1.5 mt-0.5 truncate"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{client.website}</span>
                </a>
              ) : (
                <span className="text-slate-400 text-xs italic">Not provided</span>
              )}
            </div>

            <div>
              <span className="text-xs text-slate-400 block">Tax / GST ID</span>
              <span className="font-mono text-xs text-slate-700 mt-0.5 block">
                {client.tax_id || "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Physical Address */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Address & Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-slate-800 font-medium">
                  {client.address || "No street address specified"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {[client.city, client.state, client.postal_code].filter(Boolean).join(", ")}
                </p>
                {client.country && (
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {client.country}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metadata & Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Internal Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-slate-600 whitespace-pre-wrap">
              {client.notes || "No internal notes recorded for this client."}
            </p>
            <div className="pt-3 border-t border-slate-100 flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Created {new Date(client.created_at).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contacts Management Section */}
      <Card>
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary-600" />
                Point of Contacts ({client.contacts.length})
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Key decision makers, project sponsors, and billing contacts.
              </p>
            </div>

            {canManageContacts && (
              <Button
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setIsAddContactOpen(true);
                }}
                className="flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add Contact
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {!canViewContacts ? (
            <div className="p-8">
              <EmptyState
                title="Access Restricted"
                description="You do not have permission to view contacts for this client."
              />
            </div>
          ) : client.contacts.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No contacts added"
                description="Keep track of key contact persons for this client."
                actionLabel={canManageContacts ? "Add Contact" : undefined}
                onAction={
                  canManageContacts
                    ? () => {
                        setFormError(null);
                        setIsAddContactOpen(true);
                      }
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {client.contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 hover:bg-slate-50/60 transition-colors gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">
                        {contact.name}
                      </span>
                      {contact.is_primary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                          Primary Contact
                        </span>
                      )}
                    </div>
                    {contact.designation && (
                      <p className="text-xs font-medium text-slate-600">
                        {contact.designation}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-0.5">
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="flex items-center gap-1 hover:text-primary-600"
                        >
                          <Mail className="h-3 w-3" />
                          {contact.email}
                        </a>
                      )}
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="flex items-center gap-1 hover:text-slate-800"
                        >
                          <Phone className="h-3 w-3" />
                          {contact.phone}
                        </a>
                      )}
                    </div>
                    {contact.notes && (
                      <p className="text-xs text-slate-400 italic pt-1">
                        Note: {contact.notes}
                      </p>
                    )}
                  </div>

                  {canManageContacts && (
                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Edit Contact"
                        onClick={() => openEditContactModal(contact)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Delete Contact"
                        onClick={() => openDeleteContactModal(contact)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Client Modal */}
      <Modal
        isOpen={isEditClientOpen}
        onClose={() => !isSubmitting && setIsEditClientOpen(false)}
        title="Edit Client Information"
        description="Update corporate profile and address details."
      >
        <form onSubmit={handleEditClientSubmit} className="space-y-4">
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
                value={editClientForm.client_code || ""}
                onChange={(e) =>
                  setEditClientForm({ ...editClientForm, client_code: e.target.value })
                }
                className="mt-1 font-mono uppercase"
              />
            </div>
            <div>
              <Label htmlFor="edit_client_name">Client Name *</Label>
              <Input
                id="edit_client_name"
                required
                value={editClientForm.name || ""}
                onChange={(e) =>
                  setEditClientForm({ ...editClientForm, name: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit_legal_name">Legal Name</Label>
              <Input
                id="edit_legal_name"
                value={editClientForm.legal_name || ""}
                onChange={(e) =>
                  setEditClientForm({ ...editClientForm, legal_name: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit_client_status">Status</Label>
              <select
                id="edit_client_status"
                value={editClientForm.status || "active"}
                onChange={(e) =>
                  setEditClientForm({
                    ...editClientForm,
                    status: e.target.value as ClientStatus,
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="edit_client_email">Email</Label>
              <Input
                id="edit_client_email"
                type="email"
                value={editClientForm.email || ""}
                onChange={(e) =>
                  setEditClientForm({ ...editClientForm, email: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit_client_phone">Phone</Label>
              <Input
                id="edit_client_phone"
                value={editClientForm.phone || ""}
                onChange={(e) =>
                  setEditClientForm({ ...editClientForm, phone: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit_client_tax_id">Tax / GST ID</Label>
              <Input
                id="edit_client_tax_id"
                value={editClientForm.tax_id || ""}
                onChange={(e) =>
                  setEditClientForm({ ...editClientForm, tax_id: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditClientOpen(false)}
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
        description="Are you sure you want to archive this client record?"
      >
        <div className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <p className="text-sm text-slate-600">
            Archiving <strong>{client.name}</strong> will update its status to archived. All contacts and projects remain preserved.
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
              onClick={handleArchiveClient}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Archiving..." : "Confirm Archive"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Contact Modal */}
      <Modal
        isOpen={isAddContactOpen}
        onClose={() => !isSubmitting && setIsAddContactOpen(false)}
        title="Add New Contact"
        description={`Add a point of contact for ${client.name}.`}
      >
        <form onSubmit={handleAddContactSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contact_name">Full Name *</Label>
              <Input
                id="contact_name"
                required
                placeholder="e.g. Jane Doe"
                value={addContactForm.name}
                onChange={(e) =>
                  setAddContactForm({ ...addContactForm, name: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="contact_designation">Designation / Role</Label>
              <Input
                id="contact_designation"
                placeholder="e.g. VP Engineering"
                value={addContactForm.designation || ""}
                onChange={(e) =>
                  setAddContactForm({ ...addContactForm, designation: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contact_email">Email</Label>
              <Input
                id="contact_email"
                type="email"
                placeholder="jane@client.com"
                value={addContactForm.email || ""}
                onChange={(e) =>
                  setAddContactForm({ ...addContactForm, email: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="contact_phone">Phone</Label>
              <Input
                id="contact_phone"
                placeholder="+1 555-0199"
                value={addContactForm.phone || ""}
                onChange={(e) =>
                  setAddContactForm({ ...addContactForm, phone: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="is_primary"
              checked={Boolean(addContactForm.is_primary)}
              onChange={(e) =>
                setAddContactForm({ ...addContactForm, is_primary: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <Label htmlFor="is_primary" className="text-xs text-slate-700 font-normal">
              Set as primary point of contact for this client
            </Label>
          </div>

          <div>
            <Label htmlFor="contact_notes">Notes</Label>
            <textarea
              id="contact_notes"
              rows={2}
              placeholder="Preferred contact hours, responsibilities..."
              value={addContactForm.notes || ""}
              onChange={(e) =>
                setAddContactForm({ ...addContactForm, notes: e.target.value })
              }
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddContactOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Contact"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal
        isOpen={isEditContactOpen}
        onClose={() => !isSubmitting && setIsEditContactOpen(false)}
        title="Edit Contact"
        description="Update contact details."
      >
        <form onSubmit={handleEditContactSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit_contact_name">Full Name *</Label>
              <Input
                id="edit_contact_name"
                required
                value={editContactForm.name || ""}
                onChange={(e) =>
                  setEditContactForm({ ...editContactForm, name: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit_contact_designation">Designation / Role</Label>
              <Input
                id="edit_contact_designation"
                value={editContactForm.designation || ""}
                onChange={(e) =>
                  setEditContactForm({ ...editContactForm, designation: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit_contact_email">Email</Label>
              <Input
                id="edit_contact_email"
                type="email"
                value={editContactForm.email || ""}
                onChange={(e) =>
                  setEditContactForm({ ...editContactForm, email: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit_contact_phone">Phone</Label>
              <Input
                id="edit_contact_phone"
                value={editContactForm.phone || ""}
                onChange={(e) =>
                  setEditContactForm({ ...editContactForm, phone: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="edit_is_primary"
              checked={Boolean(editContactForm.is_primary)}
              onChange={(e) =>
                setEditContactForm({ ...editContactForm, is_primary: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <Label htmlFor="edit_is_primary" className="text-xs text-slate-700 font-normal">
              Primary point of contact
            </Label>
          </div>

          <div>
            <Label htmlFor="edit_contact_notes">Notes</Label>
            <textarea
              id="edit_contact_notes"
              rows={2}
              value={editContactForm.notes || ""}
              onChange={(e) =>
                setEditContactForm({ ...editContactForm, notes: e.target.value })
              }
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditContactOpen(false)}
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

      {/* Delete Contact Modal */}
      <Modal
        isOpen={isDeleteContactOpen}
        onClose={() => !isSubmitting && setIsDeleteContactOpen(false)}
        title="Delete Contact"
        description="Are you sure you want to delete this contact?"
      >
        <div className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <p className="text-sm text-slate-600">
            Are you sure you want to remove <strong>{selectedContact?.name}</strong> from this client? This action cannot be undone.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteContactOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteContactSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete Contact"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
