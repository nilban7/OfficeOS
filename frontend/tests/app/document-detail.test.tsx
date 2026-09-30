import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DocumentDetailPage from "@/app/(protected)/documents/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { DocumentDetail } from "@/types/document";
import type { Organization } from "@/types/organization";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "doc-1" }),
  useRouter: () => ({ push: vi.fn() }),
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

describe("DocumentDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockDocument: DocumentDetail = {
    id: "doc-1",
    organization_id: "org-uuid-1",
    document_number: "DOC-001",
    title: "Master Services Agreement",
    description: "Standard customer MSA description",
    category: "contract",
    document_type: "pdf",
    owner_id: "emp-1",
    status: "active",
    storage_path: "org-uuid-1/documents/doc_001.pdf",
    original_filename: "MSA_Final.pdf",
    mime_type: "application/pdf",
    file_size: 1048576,
    current_version: 2,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
    owner: {
      id: "emp-1",
      employee_code: "EMP-001",
      first_name: "Jane",
      last_name: "Doe",
      designation: "Legal Counsel",
    },
    client: {
      id: "client-1",
      name: "Global Corp",
    },
    versions: [
      {
        id: "ver-1",
        organization_id: "org-uuid-1",
        document_id: "doc-1",
        version_number: 1,
        storage_path: "org-uuid-1/documents/doc_001_v1.pdf",
        original_filename: "MSA_Draft.pdf",
        mime_type: "application/pdf",
        file_size: 1000000,
        uploaded_by_id: "emp-1",
        notes: "Initial draft",
        created_at: "2025-01-01T00:00:00Z",
      },
      {
        id: "ver-2",
        organization_id: "org-uuid-1",
        document_id: "doc-1",
        version_number: 2,
        storage_path: "org-uuid-1/documents/doc_001.pdf",
        original_filename: "MSA_Final.pdf",
        mime_type: "application/pdf",
        file_size: 1048576,
        uploaded_by_id: "emp-1",
        notes: "Signed copy",
        created_at: "2025-01-02T00:00:00Z",
      },
    ],
    permissions: [
      {
        id: "perm-1",
        organization_id: "org-uuid-1",
        document_id: "doc-1",
        grantee_type: "employee",
        grantee_id: "emp-2-uuid",
        permission_level: "view",
        created_at: "2025-01-01T00:00:00Z",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "documents.view",
        "documents.create",
        "documents.update",
        "documents.delete",
        "documents.download",
        "documents.manage",
      ],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockResolvedValue({ data: mockDocument } as any);
  });

  it("renders document detail with title, number, and status", async () => {
    render(<DocumentDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Master Services Agreement")).toBeInTheDocument();
    });

    expect(screen.getByText(/DOC-001/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Standard customer MSA description")).toBeInTheDocument();
  });

  it("renders version history table with versions", async () => {
    render(<DocumentDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Version History (2)")).toBeInTheDocument();
    });

    expect(screen.getByText("MSA_Draft.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("MSA_Final.pdf").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Initial draft")).toBeInTheDocument();
    expect(screen.getByText("Signed copy")).toBeInTheDocument();
  });

  it("renders permissions card and list", async () => {
    render(<DocumentDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Permissions (1)")).toBeInTheDocument();
    });

    expect(screen.getByText(/emp-2/i)).toBeInTheDocument();
  });

  it("triggers download action when download button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        download_url: "https://example.com/download.pdf",
        expires_in: 300,
        filename: "MSA_Final.pdf",
        mime_type: "application/pdf",
        file_size: 1048576,
      },
    } as any);

    // Mock window.open
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<DocumentDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^download$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^download$/i }));

    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining("/documents/doc-1/download"),
      {}
    );

    openSpy.mockRestore();
  });

  it("opens upload version modal when New Version button is clicked", async () => {
    const user = userEvent.setup();
    render(<DocumentDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new version/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /new version/i }));
    expect(screen.getByText("Upload New Version", { selector: "[role='dialog'] *" })).toBeInTheDocument();
  });
});
