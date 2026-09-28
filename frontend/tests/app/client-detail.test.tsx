import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClientDetailPage from "@/app/(protected)/clients/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { ApiException } from "@/types/api";
import type { Organization } from "@/types/organization";
import type { ClientDetail, ClientContact } from "@/types/client";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "client-uuid-1" }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("ClientDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockContacts: ClientContact[] = [
    {
      id: "contact-uuid-1",
      organization_id: "org-uuid-1",
      client_id: "client-uuid-1",
      name: "Jane Doe",
      designation: "Chief Technology Officer",
      email: "jane.doe@gtc.com",
      phone: "+1-555-987-6543",
      is_primary: true,
      notes: "Main decision maker",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "contact-uuid-2",
      organization_id: "org-uuid-1",
      client_id: "client-uuid-1",
      name: "John Smith",
      designation: "Procurement Manager",
      email: "john.smith@gtc.com",
      phone: "+1-555-432-1098",
      is_primary: false,
      notes: "Handles invoices and billing",
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
  ];

  const mockClientDetail: ClientDetail = {
    id: "client-uuid-1",
    organization_id: "org-uuid-1",
    name: "Global Tech Corp",
    client_code: "GTC",
    status: "active",
    client_type: "enterprise",
    email: "contact@gtc.com",
    phone: "+1-555-123-4567",
    website: "https://gtc.com",
    address: "100 Innovation Way",
    city: "San Francisco",
    state: "CA",
    postal_code: "94105",
    country: "USA",
    notes: "Key enterprise client with ongoing SaaS contracts",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    contacts: mockContacts,
  };

  const defaultPermissions = [
    "clients.view",
    "clients.create",
    "clients.update",
    "clients.delete",
    "client_contacts.view",
    "client_contacts.manage",
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: defaultPermissions,
      isLoading: false,
      userRole: "admin",
      organizations: [mockOrg],
      setCurrentOrganization: vi.fn(),
      refreshOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockResolvedValue(mockClientDetail);
  });

  it("renders client detail overview correctly", async () => {
    render(<ClientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Global Tech Corp")).toBeInTheDocument();
    });

    expect(screen.getByText("GTC")).toBeInTheDocument();
    expect(screen.getByText("contact@gtc.com")).toBeInTheDocument();
    expect(screen.getByText("+1-555-123-4567")).toBeInTheDocument();
    expect(screen.getByText("100 Innovation Way")).toBeInTheDocument();
    expect(screen.getByText("San Francisco, CA, 94105")).toBeInTheDocument();
    expect(screen.getByText("USA")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Chief Technology Officer")).toBeInTheDocument();
    expect(screen.getByText("Primary Contact")).toBeInTheDocument();
  });

  it("handles client fetch error / 404 state", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(
      new ApiException("Client not found or does not belong to organization", 404)
    );

    render(<ClientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Client not found")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Client not found or does not belong to organization")
    ).toBeInTheDocument();
  });

  it("renders empty contacts state when client has no contacts", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      ...mockClientDetail,
      contacts: [],
    });

    render(<ClientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("No contacts added")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Keep track of key contact persons for this client.")
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /add contact/i }).length).toBeGreaterThan(0);
  });

  it("opens Add Contact modal and creates a new contact", async () => {
    const user = userEvent.setup();
    const newContact: ClientContact = {
      id: "contact-uuid-3",
      organization_id: "org-uuid-1",
      client_id: "client-uuid-1",
      name: "Alice Wang",
      designation: "Product Lead",
      email: "alice@gtc.com",
      phone: "+1-555-678-9012",
      is_primary: false,
      notes: null,
      created_at: "2026-01-03T00:00:00Z",
      updated_at: "2026-01-03T00:00:00Z",
    };

    vi.mocked(apiClient.post).mockResolvedValue(newContact);

    render(<ClientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Global Tech Corp")).toBeInTheDocument();
    });

    const addContactBtn = screen.getByRole("button", { name: /add contact/i });
    await user.click(addContactBtn);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /add new contact/i })).toBeInTheDocument();

    const nameInput = within(modal).getByLabelText(/full name/i);
    const desigInput = within(modal).getByLabelText(/designation/i);
    const emailInput = within(modal).getByLabelText(/email/i);

    await user.type(nameInput, "Alice Wang");
    await user.type(desigInput, "Product Lead");
    await user.type(emailInput, "alice@gtc.com");

    const submitBtn = within(modal).getByRole("button", { name: "Add Contact" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining(`/clients/${mockClientDetail.id}/contacts`),
        expect.objectContaining({
          name: "Alice Wang",
          designation: "Product Lead",
          email: "alice@gtc.com",
        }),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });

  it("opens Edit Contact modal and updates contact details", async () => {
    const user = userEvent.setup();
    const updatedContact: ClientContact = {
      ...mockContacts[0],
      designation: "Chief Information Officer",
    };

    vi.mocked(apiClient.patch).mockResolvedValue(updatedContact);

    render(<ClientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTitle("Edit Contact");
    await user.click(editBtns[0]);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /edit contact/i })).toBeInTheDocument();

    const desigInput = within(modal).getByLabelText(/designation/i);
    await user.clear(desigInput);
    await user.type(desigInput, "Chief Information Officer");

    const saveBtn = within(modal).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        expect.stringContaining(
          `/clients/${mockClientDetail.id}/contacts/${mockContacts[0].id}`
        ),
        expect.objectContaining({
          designation: "Chief Information Officer",
        }),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });

  it("opens Delete Contact modal and deletes contact", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue({
      id: mockContacts[1].id,
      message: "Client contact deleted successfully",
    });

    render(<ClientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByTitle("Delete Contact");
    await user.click(deleteBtns[1]); // John Smith

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /delete contact/i })).toBeInTheDocument();
    expect(
      within(modal).getByText(/Are you sure you want to remove/i)
    ).toBeInTheDocument();

    const confirmBtn = within(modal).getByRole("button", { name: "Delete Contact" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        expect.stringContaining(
          `/clients/${mockClientDetail.id}/contacts/${mockContacts[1].id}`
        ),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });

  it("allows setting a contact as primary via edit modal", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue({
      ...mockContacts[1],
      is_primary: true,
    });

    render(<ClientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTitle("Edit Contact");
    await user.click(editBtns[1]); // John Smith

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /edit contact/i })).toBeInTheDocument();

    const primaryCheckbox = within(modal).getByRole("checkbox");
    await user.click(primaryCheckbox);

    const saveBtn = within(modal).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        expect.stringContaining(
          `/clients/${mockClientDetail.id}/contacts/${mockContacts[1].id}`
        ),
        expect.objectContaining({
          is_primary: true,
        }),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });
});
