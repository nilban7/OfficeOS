import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClientsPage from "@/app/(protected)/clients/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { ApiException } from "@/types/api";
import type { Organization } from "@/types/organization";
import type { ClientListResponse, Client } from "@/types/client";

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

describe("ClientsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockClients: Client[] = [
    {
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
      notes: "Key enterprise client",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      contacts_count: 2,
      primary_contact: {
        id: "contact-uuid-1",
        organization_id: "org-uuid-1",
        client_id: "client-uuid-1",
        name: "Jane Doe",
        designation: "VP Engineering",
        email: "jane@gtc.com",
        phone: "+1-555-987-6543",
        is_primary: true,
        notes: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    },
    {
      id: "client-uuid-2",
      organization_id: "org-uuid-1",
      name: "Apex Logistics",
      client_code: "APX",
      status: "inactive",
      client_type: "standard",
      email: "info@apexlog.com",
      phone: "+1-555-234-5678",
      website: null,
      address: "200 Freight Ave",
      city: "Chicago",
      state: "IL",
      postal_code: "60601",
      country: "USA",
      notes: null,
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      contacts_count: 0,
      primary_contact: null,
    },
  ];

  const mockClientsResponse: ClientListResponse = {
    items: mockClients,
    meta: {
      total: 2,
      page: 1,
      page_size: 20,
      total_pages: 1,
    },
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

    vi.mocked(apiClient.get).mockResolvedValue(mockClientsResponse);
  });

  it("renders access restricted when user lacks clients.view permission", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [],
      isLoading: false,
      userRole: "viewer",
      organizations: [mockOrg],
      setCurrentOrganization: vi.fn(),
      refreshOrganizations: vi.fn(),
    } as any);

    render(<ClientsPage />);

    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    expect(
      screen.getByText(/You do not have permission to view clients in this organization/i)
    ).toBeInTheDocument();
  });

  it("renders clients list and statistics correctly", async () => {
    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText("Global Tech Corp")).toBeInTheDocument();
      expect(screen.getByText("Apex Logistics")).toBeInTheDocument();
    });

    expect(screen.getByText("Client Management")).toBeInTheDocument();
    expect(screen.getByText("GTC")).toBeInTheDocument();
    expect(screen.getByText("APX")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders empty state when no clients exist", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      items: [],
      meta: {
        total: 0,
        page: 1,
        page_size: 20,
        total_pages: 1,
      },
    });

    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText("No clients found")).toBeInTheDocument();
    });

    expect(
      screen.getByText("No clients have been registered for this organization yet.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add first client/i })).toBeInTheDocument();
  });

  it("allows searching and filtering clients", async () => {
    const user = userEvent.setup();
    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText("Global Tech Corp")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search by code, name, tax id/i);
    await user.type(searchInput, "Global");

    const activeFilterBtn = screen.getByRole("button", { name: /^active$/i });
    await user.click(activeFilterBtn);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining("/clients"),
        expect.objectContaining({
          organizationId: "org-uuid-1",
          params: expect.objectContaining({
            status: "active",
            search: "Global",
          }),
        })
      );
    });
  });

  it("opens Add Client modal and submits a new client", async () => {
    const user = userEvent.setup();
    const newClient: Client = {
      id: "client-uuid-3",
      organization_id: "org-uuid-1",
      name: "New Horizons Inc",
      client_code: "NHI",
      status: "active",
      client_type: "standard",
      email: "info@nhi.com",
      phone: "+1-555-345-6789",
      website: "https://nhi.com",
      address: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      notes: null,
      created_at: "2026-01-03T00:00:00Z",
      updated_at: "2026-01-03T00:00:00Z",
      contacts_count: 0,
      primary_contact: null,
    };

    vi.mocked(apiClient.post).mockResolvedValue(newClient);

    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText("Global Tech Corp")).toBeInTheDocument();
    });

    const addBtn = screen.getByRole("button", { name: /add client/i });
    await user.click(addBtn);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /create new client/i })).toBeInTheDocument();

    const nameInput = within(modal).getByLabelText(/client name/i);
    const codeInput = within(modal).getByLabelText(/client code/i);

    await user.type(nameInput, "New Horizons Inc");
    await user.type(codeInput, "NHI");

    const submitBtn = within(modal).getByRole("button", { name: "Create Client" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining("/clients"),
        expect.objectContaining({
          name: "New Horizons Inc",
          client_code: "NHI",
        }),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });

  it("handles 409 conflict when creating client with duplicate code", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiException("A client with code 'GTC' already exists in this organization.", 409)
    );

    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText("Global Tech Corp")).toBeInTheDocument();
    });

    const addBtn = screen.getByRole("button", { name: /add client/i });
    await user.click(addBtn);

    const modal = screen.getByRole("dialog");
    const nameInput = within(modal).getByLabelText(/client name/i);
    const codeInput = within(modal).getByLabelText(/client code/i);

    await user.type(nameInput, "Duplicate Tech");
    await user.type(codeInput, "GTC");

    const submitBtn = within(modal).getByRole("button", { name: "Create Client" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        within(modal).getByText("A client with code 'GTC' already exists in this organization.")
      ).toBeInTheDocument();
    });
  });

  it("opens Edit Client modal and submits updates", async () => {
    const user = userEvent.setup();
    const updatedClient: Client = {
      ...mockClients[0],
      name: "Global Tech Corporation",
    };

    vi.mocked(apiClient.patch).mockResolvedValue(updatedClient);

    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText("Global Tech Corp")).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTitle("Edit Client");
    await user.click(editBtns[0]);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /edit client/i })).toBeInTheDocument();

    const nameInput = within(modal).getByLabelText(/client name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Global Tech Corporation");

    const saveBtn = within(modal).getByRole("button", { name: "Save Changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        expect.stringContaining(`/clients/${mockClients[0].id}`),
        expect.objectContaining({
          name: "Global Tech Corporation",
        }),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });

  it("opens Archive modal and archives client on confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue({
      id: mockClients[0].id,
      status: "archived",
      message: "Client successfully archived",
    });

    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText("Global Tech Corp")).toBeInTheDocument();
    });

    const archiveBtns = screen.getAllByTitle("Archive Client");
    await user.click(archiveBtns[0]);

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: "Archive Client" })).toBeInTheDocument();
    expect(
      within(modal).getByText(/Archiving/i)
    ).toBeInTheDocument();

    const confirmBtn = within(modal).getByRole("button", { name: "Archive Client" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/clients/${mockClients[0].id}`),
        expect.objectContaining({ organizationId: "org-uuid-1" })
      );
    });
  });
});
