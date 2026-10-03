import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmployeeDetailPage from "@/app/(protected)/employees/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { ApiException } from "@/types/api";
import type { Organization, BranchResponse } from "@/types/organization";
import type {
  Department,
  Employee,
  ManagerOption,
} from "@/types/employee";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "emp-uuid-1" }),
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

describe("EmployeeDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1111",
    name: "Acme Global",
    slug: "acme-global",
  };

  const mockBranch: BranchResponse = {
    id: "branch-uuid-1",
    organization_id: "org-uuid-1111",
    name: "Headquarters - New York",
    code: "HQ-NY",
    address: "100 Broadway, NY",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const mockDept: Department = {
    id: "dept-uuid-1",
    organization_id: "org-uuid-1111",
    name: "Engineering",
    code: "ENG",
    description: "Software engineering",
    manager_id: null,
    manager_name: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const mockManager: ManagerOption = {
    id: "emp-uuid-99",
    employee_code: "EMP-099",
    first_name: "Sarah",
    last_name: "Connor",
    designation: "Chief Technology Officer",
  };

  const mockEmployee: Employee = {
    id: "emp-uuid-1",
    organization_id: "org-uuid-1111",
    profile_id: null,
    membership_id: null,
    employee_code: "EMP-001",
    first_name: "Alice",
    last_name: "Smith",
    work_email: "alice@acme.com",
    personal_email: "alice.personal@example.com",
    phone_number: "+1 555-0100",
    designation: "VP of Engineering",
    department_id: "dept-uuid-1",
    branch_id: "branch-uuid-1",
    reporting_manager_id: "emp-uuid-99",
    employment_type: "full_time",
    status: "active",
    date_of_joining: "2024-01-15T00:00:00Z",
    date_of_exit: null,
    is_active: true,
    current_address: "123 Main St, New York, NY",
    emergency_contact_name: "Bob Smith",
    emergency_contact_relationship: "Spouse",
    emergency_contact_phone: "+1 555-0199",
    created_at: "2024-01-15T00:00:00Z",
    updated_at: "2024-01-15T00:00:00Z",
    department: mockDept,
    branch: mockBranch,
    reporting_manager: mockManager,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state when loading employee data", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["employees.view"],
      membership: null,
      isLoadingOrgs: true,
      isLoadingPermissions: false,
      isLoading: true,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    render(<EmployeeDetailPage />);
    expect(screen.getByText(/loading employee details/i)).toBeInTheDocument();
  });

  it("renders access denied when user lacks employees.view permission", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["departments.view"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    render(<EmployeeDetailPage />);
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/you do not have permission to view employee details/i)).toBeInTheDocument();
  });

  it("renders employee not found error when API returns 404", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["employees.view"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockRejectedValue(
      new ApiException("Employee not found", 404, "NOT_FOUND")
    );

    render(<EmployeeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /employee not found/i })).toBeInTheDocument();
    });
  });

  it("loads and displays complete employee details and cards", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["employees.view", "employees.update", "employees.delete"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockImplementation((path: string, options) => {
      expect(options?.organizationId).toBe("org-uuid-1111");
      if (path === "/employees/emp-uuid-1") {
        return Promise.resolve(mockEmployee);
      }
      if (path === "/departments") {
        return Promise.resolve([mockDept]);
      }
      if (path === "/organizations/current/branches") {
        return Promise.resolve([mockBranch]);
      }
      if (path === "/employees/managers") {
        return Promise.resolve([mockManager]);
      }
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    render(<EmployeeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alice Smith" })).toBeInTheDocument();
      expect(screen.getByText("VP of Engineering")).toBeInTheDocument();
      expect(screen.getByText(/EMP-001/i)).toBeInTheDocument();
      expect(screen.getByText("alice@acme.com")).toBeInTheDocument();
      expect(screen.getByText("alice.personal@example.com")).toBeInTheDocument();
      expect(screen.getByText("+1 555-0100")).toBeInTheDocument();
      expect(screen.getByText("123 Main St, New York, NY")).toBeInTheDocument();
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
      expect(screen.getByText("+1 555-0199")).toBeInTheDocument();
      expect(screen.getByText("Sarah Connor")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /edit profile/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /terminate/i })).toBeInTheDocument();
    });
  });

  it("opens edit modal and successfully updates employee record", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["employees.view", "employees.update", "employees.delete"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === "/employees/emp-uuid-1") return Promise.resolve(mockEmployee);
      if (path === "/departments") return Promise.resolve([mockDept]);
      if (path === "/organizations/current/branches") return Promise.resolve([mockBranch]);
      if (path === "/employees/managers") return Promise.resolve([mockManager]);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    const updatedEmployee: Employee = {
      ...mockEmployee,
      designation: "Executive VP of Engineering",
    };

    vi.mocked(apiClient.patch).mockResolvedValue(updatedEmployee);

    render(<EmployeeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alice Smith" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /edit profile/i }));

    expect(screen.getByText("Edit Employee Profile")).toBeInTheDocument();
    const designationInput = screen.getByLabelText(/designation/i);
    expect(designationInput).toHaveValue("VP of Engineering");

    await user.clear(designationInput);
    await user.type(designationInput, "Executive VP of Engineering");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/employees/emp-uuid-1",
        expect.objectContaining({
          designation: "Executive VP of Engineering",
        }),
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/employee record updated successfully/i)).toBeInTheDocument();
    });
  });

  it("opens terminate modal and soft-deactivates employee", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["employees.view", "employees.update", "employees.delete"],
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === "/employees/emp-uuid-1") return Promise.resolve(mockEmployee);
      if (path === "/departments") return Promise.resolve([mockDept]);
      if (path === "/organizations/current/branches") return Promise.resolve([mockBranch]);
      if (path === "/employees/managers") return Promise.resolve([mockManager]);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    const terminatedEmployee: Employee = {
      ...mockEmployee,
      status: "terminated",
      is_active: false,
    };

    vi.mocked(apiClient.delete).mockResolvedValue(terminatedEmployee);

    render(<EmployeeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alice Smith" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /terminate/i }));

    expect(screen.getByRole("heading", { name: "Terminate Employee" })).toBeInTheDocument();
    expect(screen.getByText(/soft deactivation/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm termination/i }));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        "/employees/emp-uuid-1",
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/employee alice smith has been terminated/i)).toBeInTheDocument();
    });
  });

  it("hides edit and terminate buttons in read-only mode", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["employees.view"], // lacks update and delete
      membership: null,
      isLoadingOrgs: false,
      isLoadingPermissions: false,
      isLoading: false,
      orgError: null,
      permissionError: null,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    });

    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === "/employees/emp-uuid-1") return Promise.resolve(mockEmployee);
      if (path === "/departments") return Promise.resolve([mockDept]);
      if (path === "/organizations/current/branches") return Promise.resolve([mockBranch]);
      if (path === "/employees/managers") return Promise.resolve([mockManager]);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    render(<EmployeeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alice Smith" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /edit profile/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /terminate/i })).not.toBeInTheDocument();
    });
  });
});
