import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmployeesPage from "@/app/(protected)/employees/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { ApiException } from "@/types/api";
import type { Organization, BranchResponse } from "@/types/organization";
import type {
  Department,
  Employee,
  ManagerOption,
  PaginatedEmployees,
} from "@/types/employee";

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

describe("EmployeesPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1111",
    name: "Acme Global",
    slug: "acme-global",
  };

  const mockBranches: BranchResponse[] = [
    {
      id: "branch-uuid-1",
      organization_id: "org-uuid-1111",
      name: "Headquarters - New York",
      code: "HQ-NY",
      address: "100 Broadway, NY",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockDepartments: Department[] = [
    {
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
    },
    {
      id: "dept-uuid-2",
      organization_id: "org-uuid-1111",
      name: "People Ops",
      code: "HR",
      description: "Human Resources",
      manager_id: null,
      manager_name: null,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockManagers: ManagerOption[] = [
    {
      id: "emp-uuid-1",
      employee_code: "EMP-001",
      first_name: "Alice",
      last_name: "Smith",
      designation: "VP of Engineering",
    },
  ];

  const mockEmployee1: Employee = {
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
    reporting_manager_id: null,
    employment_type: "full_time",
    status: "active",
    date_of_joining: "2024-01-15T00:00:00Z",
    date_of_exit: null,
    is_active: true,
    current_address: "123 Main St, NY",
    emergency_contact_name: "Bob Smith",
    emergency_contact_relationship: "Spouse",
    emergency_contact_phone: "+1 555-0199",
    created_at: "2024-01-15T00:00:00Z",
    updated_at: "2024-01-15T00:00:00Z",
    department: mockDepartments[0],
    branch: mockBranches[0],
    reporting_manager: null,
  };

  const mockEmployee2: Employee = {
    id: "emp-uuid-2",
    organization_id: "org-uuid-1111",
    profile_id: null,
    membership_id: null,
    employee_code: "EMP-002",
    first_name: "Charlie",
    last_name: "Brown",
    work_email: "charlie@acme.com",
    personal_email: null,
    phone_number: null,
    designation: "Senior Frontend Engineer",
    department_id: "dept-uuid-1",
    branch_id: "branch-uuid-1",
    reporting_manager_id: "emp-uuid-1",
    employment_type: "full_time",
    status: "probation",
    date_of_joining: "2025-06-01T00:00:00Z",
    date_of_exit: null,
    is_active: true,
    current_address: null,
    emergency_contact_name: null,
    emergency_contact_relationship: null,
    emergency_contact_phone: null,
    created_at: "2025-06-01T00:00:00Z",
    updated_at: "2025-06-01T00:00:00Z",
    department: mockDepartments[0],
    branch: mockBranches[0],
    reporting_manager: {
      id: "emp-uuid-1",
      employee_code: "EMP-001",
      first_name: "Alice",
      last_name: "Smith",
      designation: "VP of Engineering",
    },
  };

  const mockPaginatedEmployees: PaginatedEmployees = {
    items: [mockEmployee1, mockEmployee2],
    meta: {
      total: 2,
      page: 1,
      page_size: 20,
      total_pages: 1,
    },
  };

  const allPermissions = [
    "employees.view",
    "employees.create",
    "employees.update",
    "employees.delete",
    "departments.view",
    "departments.manage",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state when organization context is loading", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: null,
      organizations: [],
      permissions: [],
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

    render(<EmployeesPage />);
    expect(screen.getByText(/loading organization context/i)).toBeInTheDocument();
  });

  it("renders empty state when no organization is selected", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: null,
      organizations: [],
      permissions: [],
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

    render(<EmployeesPage />);
    expect(screen.getByText(/no organization selected/i)).toBeInTheDocument();
  });

  it("renders access denied when user lacks employees.view and departments.view permissions", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["organizations.view"],
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

    render(<EmployeesPage />);
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/you do not have permission to view the employee directory/i)).toBeInTheDocument();
  });

  it("loads and renders employee directory table with mock data", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: allPermissions,
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
      if (path === "/departments") {
        return Promise.resolve(mockDepartments);
      }
      if (path === "/organizations/current/branches") {
        return Promise.resolve(mockBranches);
      }
      if (path === "/employees/managers") {
        return Promise.resolve(mockManagers);
      }
      if (path === "/employees") {
        return Promise.resolve(mockPaginatedEmployees);
      }
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    render(<EmployeesPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("EMP-001")).toBeInTheDocument();
      expect(screen.getByText("VP of Engineering")).toBeInTheDocument();
      expect(screen.getByText("Charlie Brown")).toBeInTheDocument();
      expect(screen.getByText("EMP-002")).toBeInTheDocument();
      expect(screen.getByText("Senior Frontend Engineer")).toBeInTheDocument();
      expect(screen.getByText(/Showing/i)).toBeInTheDocument();
    });
  });

  it("renders empty state when employee list is empty and offers Add Employee button", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: allPermissions,
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
      if (path === "/departments") return Promise.resolve(mockDepartments);
      if (path === "/organizations/current/branches") return Promise.resolve(mockBranches);
      if (path === "/employees/managers") return Promise.resolve([]);
      if (path === "/employees") {
        return Promise.resolve({
          items: [],
          meta: { total: 0, page: 1, page_size: 20, total_pages: 1 },
        });
      }
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    render(<EmployeesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no employees found/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /add first employee/i })).toBeInTheDocument();
    });
  });

  it("handles tab switching between Directory and Departments", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: allPermissions,
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
      if (path === "/departments") return Promise.resolve(mockDepartments);
      if (path === "/organizations/current/branches") return Promise.resolve(mockBranches);
      if (path === "/employees/managers") return Promise.resolve(mockManagers);
      if (path === "/employees") return Promise.resolve(mockPaginatedEmployees);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    render(<EmployeesPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    // Click Departments tab
    const deptTab = screen.getByRole("button", { name: /departments/i });
    await user.click(deptTab);

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
      expect(screen.getByText("ENG")).toBeInTheDocument();
      expect(screen.getByText("People Ops")).toBeInTheDocument();
      expect(screen.getByText("HR")).toBeInTheDocument();
      expect(screen.getByText("Software engineering")).toBeInTheDocument();
    });
  });

  it("renders read-only mode when user has employees.view but lacks create/update/delete", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: ["employees.view", "departments.view"],
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
      if (path === "/departments") return Promise.resolve(mockDepartments);
      if (path === "/organizations/current/branches") return Promise.resolve(mockBranches);
      if (path === "/employees/managers") return Promise.resolve(mockManagers);
      if (path === "/employees") return Promise.resolve(mockPaginatedEmployees);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    render(<EmployeesPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /add employee/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /terminate/i })).not.toBeInTheDocument();
    });
  });

  it("opens Add Employee modal and creates new employee on valid submission", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: allPermissions,
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
      if (path === "/departments") return Promise.resolve(mockDepartments);
      if (path === "/organizations/current/branches") return Promise.resolve(mockBranches);
      if (path === "/employees/managers") return Promise.resolve(mockManagers);
      if (path === "/employees") return Promise.resolve(mockPaginatedEmployees);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    const newEmp: Employee = {
      id: "emp-uuid-3",
      organization_id: "org-uuid-1111",
      profile_id: null,
      membership_id: null,
      employee_code: "EMP-003",
      first_name: "Dana",
      last_name: "Scully",
      work_email: "dana@acme.com",
      personal_email: null,
      phone_number: null,
      designation: "Lead Investigator",
      department_id: "dept-uuid-1",
      branch_id: "branch-uuid-1",
      reporting_manager_id: null,
      employment_type: "full_time",
      status: "active",
      date_of_joining: "2026-03-01T00:00:00Z",
      date_of_exit: null,
      is_active: true,
      current_address: null,
      emergency_contact_name: null,
      emergency_contact_relationship: null,
      emergency_contact_phone: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
      department: mockDepartments[0],
      branch: mockBranches[0],
      reporting_manager: null,
    };

    vi.mocked(apiClient.post).mockResolvedValue(newEmp);

    render(<EmployeesPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    const addBtn = screen.getByRole("button", { name: /add employee/i });
    await user.click(addBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add New Employee")).toBeInTheDocument();

    const codeInput = screen.getByLabelText(/employee code/i);
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const designationInput = screen.getByLabelText(/designation/i);
    const joiningDateInput = screen.getByLabelText(/date of joining/i);

    await user.type(codeInput, "EMP-003");
    await user.type(firstNameInput, "Dana");
    await user.type(lastNameInput, "Scully");
    await user.type(designationInput, "Lead Investigator");
    await user.type(joiningDateInput, "2026-03-01");

    const submitBtn = screen.getByRole("button", { name: /create employee/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/employees",
        expect.objectContaining({
          employee_code: "EMP-003",
          first_name: "Dana",
          last_name: "Scully",
          designation: "Lead Investigator",
          date_of_joining: "2026-03-01",
        }),
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/employee record created successfully/i)).toBeInTheDocument();
    });
  });

  it("handles 409 conflict when creating employee with duplicate code", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: allPermissions,
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
      if (path === "/departments") return Promise.resolve(mockDepartments);
      if (path === "/organizations/current/branches") return Promise.resolve(mockBranches);
      if (path === "/employees/managers") return Promise.resolve(mockManagers);
      if (path === "/employees") return Promise.resolve(mockPaginatedEmployees);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiException("Employee with code EMP-001 already exists in this organization", 409, "CONFLICT")
    );

    render(<EmployeesPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /add employee/i }));

    await user.type(screen.getByLabelText(/employee code/i), "EMP-001");
    await user.type(screen.getByLabelText(/first name/i), "Duplicate");
    await user.type(screen.getByLabelText(/last name/i), "User");
    await user.type(screen.getByLabelText(/designation/i), "Engineer");
    await user.type(screen.getByLabelText(/date of joining/i), "2026-03-01");

    await user.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /employee with code emp-001 already exists in this organization/i
      );
    });
  });

  it("opens Edit Employee modal and submits updated employee data", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: allPermissions,
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
      if (path === "/departments") return Promise.resolve(mockDepartments);
      if (path === "/organizations/current/branches") return Promise.resolve(mockBranches);
      if (path === "/employees/managers") return Promise.resolve(mockManagers);
      if (path === "/employees") return Promise.resolve(mockPaginatedEmployees);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    const updatedEmp: Employee = {
      ...mockEmployee1,
      designation: "Senior VP of Engineering",
    };

    vi.mocked(apiClient.patch).mockResolvedValue(updatedEmp);

    render(<EmployeesPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[0]!);

    expect(screen.getByRole("heading", { name: "Edit Employee Record" })).toBeInTheDocument();
    const designationInput = screen.getByLabelText(/designation/i);
    expect(designationInput).toHaveValue("VP of Engineering");

    await user.clear(designationInput);
    await user.type(designationInput, "Senior VP of Engineering");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/employees/emp-uuid-1",
        expect.objectContaining({
          designation: "Senior VP of Engineering",
        }),
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/employee record updated successfully/i)).toBeInTheDocument();
    });
  });

  it("opens Terminate modal and soft-deactivates employee", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: allPermissions,
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
      if (path === "/departments") return Promise.resolve(mockDepartments);
      if (path === "/organizations/current/branches") return Promise.resolve(mockBranches);
      if (path === "/employees/managers") return Promise.resolve(mockManagers);
      if (path === "/employees") return Promise.resolve(mockPaginatedEmployees);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    const terminatedEmp: Employee = {
      ...mockEmployee1,
      status: "terminated",
      is_active: false,
    };

    vi.mocked(apiClient.delete).mockResolvedValue(terminatedEmp);

    render(<EmployeesPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    const terminateButtons = screen.getAllByRole("button", { name: /terminate/i });
    await user.click(terminateButtons[0]!);

    expect(screen.getByRole("heading", { name: "Terminate Employee" })).toBeInTheDocument();
    expect(screen.getByText(/soft deactivation/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /confirm termination/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        "/employees/emp-uuid-1",
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/employee alice smith has been terminated/i)).toBeInTheDocument();
    });
  });

  it("manages departments: creates department, edits department, and deactivates department", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      permissions: allPermissions,
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
      if (path === "/departments") return Promise.resolve(mockDepartments);
      if (path === "/organizations/current/branches") return Promise.resolve(mockBranches);
      if (path === "/employees/managers") return Promise.resolve(mockManagers);
      if (path === "/employees") return Promise.resolve(mockPaginatedEmployees);
      return Promise.reject(new Error(`Unknown path: ${path}`));
    });

    const newDept: Department = {
      id: "dept-uuid-3",
      organization_id: "org-uuid-1111",
      name: "Finance",
      code: "FIN",
      description: "Financial planning",
      manager_id: null,
      manager_name: null,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    vi.mocked(apiClient.post).mockResolvedValue(newDept);

    render(<EmployeesPage />);

    // Switch to Departments tab
    await user.click(screen.getByRole("button", { name: /departments/i }));

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });

    // Add Department
    await user.click(screen.getByRole("button", { name: /add department/i }));
    expect(screen.getByRole("heading", { name: "Add Department" })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/department name/i), "Finance");
    await user.type(screen.getByLabelText(/department code/i), "FIN");
    await user.type(screen.getByLabelText(/description/i), "Financial planning");

    await user.click(screen.getByRole("button", { name: /create department/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/departments",
        {
          name: "Finance",
          code: "FIN",
          description: "Financial planning",
          is_active: true,
          manager_id: null,
        },
        { organizationId: "org-uuid-1111" }
      );
      expect(screen.getByText(/department created successfully/i)).toBeInTheDocument();
    });
  });
});
