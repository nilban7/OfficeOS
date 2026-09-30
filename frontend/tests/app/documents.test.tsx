import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DocumentsPage from "@/app/(protected)/documents/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Document } from "@/types/document";
import type { Organization } from "@/types/organization";

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

describe("DocumentsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockDocuments: Document[] = [
    {
      id: "doc-1",
      organization_id: "org-uuid-1",
      document_number: "DOC-001",
      title: "Master Services Agreement",
      description: "Standard customer MSA",
      category: "contract",
      document_type: "pdf",
      owner_id: "emp-1",
      status: "active",
      storage_path: "org-uuid-1/documents/doc_001.pdf",
      original_filename: "MSA_Final.pdf",
      mime_type: "application/pdf",
      file_size: 1048576,
      current_version: 1,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "doc-2",
      organization_id: "org-uuid-1",
      document_number: "DOC-002",
      title: "Q3 Financial Report",
      description: "Quarterly summary",
      category: "report",
      document_type: "xlsx",
      owner_id: "emp-2",
      status: "archived",
      storage_path: "org-uuid-1/documents/doc_002.xlsx",
      original_filename: "Q3_Report.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      file_size: 204800,
      current_version: 2,
      created_at: "2025-02-01T00:00:00Z",
      updated_at: "2025-02-01T00:00:00Z",
    },
  ];

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

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/documents")) {
        return Promise.resolve({
          data: { items: mockDocuments, total: 2, page: 1, page_size: 20, total_pages: 1 },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });
  });

  it("renders documents list with correct data", async () => {
    render(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Master Services Agreement")).toBeInTheDocument();
    });

    expect(screen.getByText("DOC-001")).toBeInTheDocument();
    expect(screen.getByText("Q3 Financial Report")).toBeInTheDocument();
    expect(screen.getByText("DOC-002")).toBeInTheDocument();
    expect(screen.getByText("contract")).toBeInTheDocument();
    expect(screen.getByText("report")).toBeInTheDocument();
  });

  it("shows empty state when no documents", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 1 },
    } as any);

    render(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText("No documents found")).toBeInTheDocument();
    });
  });

  it("shows access denied when missing documents.view permission", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [],
      isLoading: false,
    } as any);

    render(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
    });
  });

  it("opens upload document modal when button is clicked", async () => {
    const user = userEvent.setup();
    render(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /upload document/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /upload document/i }));
    expect(screen.getByText("Upload New Document", { selector: "[role='dialog'] *" })).toBeInTheDocument();
  });

  it("displays status badges for each document", async () => {
    render(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Active", { selector: "span" })).toBeInTheDocument();
    });

    expect(screen.getByText("Archived", { selector: "span" })).toBeInTheDocument();
  });

  it("shows page header with Document Management title and KPI cards", async () => {
    render(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Document Management")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Documents")).toBeInTheDocument();
    expect(screen.getByText("Active Documents")).toBeInTheDocument();
    expect(screen.getByText("Total File Size")).toBeInTheDocument();
  });
});
