"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  FolderTree,
  Plus,
  Search,
  ArrowUpDown,
  Edit2,
  PowerOff,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Building2,
  Mail,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
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
import type { BranchResponse } from "@/types/organization";
import type {
  Department,
  DepartmentCreate,
  DepartmentUpdate,
  Employee,
  EmployeeCreate,
  EmployeeUpdate,
  ManagerOption,
  PaginatedEmployees,
} from "@/types/employee";

export default function EmployeesPage() {
  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  // Permissions
  const canViewEmployees = permissions.includes("employees.view");
  const canCreateEmployees = permissions.includes("employees.create");
  const canUpdateEmployees = permissions.includes("employees.update");
  const canDeleteEmployees = permissions.includes("employees.delete");

  const canViewDepartments = permissions.includes("departments.view");
  const canManageDepartments = permissions.includes("departments.manage");

  // Tab State
  const [activeTab, setActiveTab] = React.useState<"directory" | "departments">("directory");

  // Directory Filter & Pagination State
  const [employeesData, setEmployeesData] = React.useState<PaginatedEmployees>({
    items: [],
    meta: { total: 0, page: 1, page_size: 20, total_pages: 1 },
  });
  const [isLoadingEmployees, setIsLoadingEmployees] = React.useState(false);
  const [employeeError, setEmployeeError] = React.useState<string | null>(null);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterDepartment, setFilterDepartment] = React.useState<string>("");
  const [filterBranch, setFilterBranch] = React.useState<string>("");
  const [filterStatus, setFilterStatus] = React.useState<string>("");
  const [filterType, setFilterType] = React.useState<string>("");
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<string>("name");
  const [sortOrder, setSortOrder] = React.useState<string>("asc");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  // Departments State
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = React.useState(false);
  const [departmentError, setDepartmentError] = React.useState<string | null>(null);

  // Reference Options
  const [branches, setBranches] = React.useState<BranchResponse[]>([]);
  const [managers, setManagers] = React.useState<ManagerOption[]>([]);

  // Global Alerts
  const [globalSuccess, setGlobalSuccess] = React.useState<string | null>(null);

  // Modals: Add / Edit Employee
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = React.useState(false);
  const [isEditEmployeeOpen, setIsEditEmployeeOpen] = React.useState(false);
  const [editingEmployee, setEditingEmployee] = React.useState<Employee | null>(null);
  const [employeeFormError, setEmployeeFormError] = React.useState<string | null>(null);
  const [isSubmittingEmployee, setIsSubmittingEmployee] = React.useState(false);

  // Employee Form Fields
  const [empCode, setEmpCode] = React.useState("");
  const [empFirstName, setEmpFirstName] = React.useState("");
  const [empLastName, setEmpLastName] = React.useState("");
  const [empDesignation, setEmpDesignation] = React.useState("");
  const [empType, setEmpType] = React.useState("full_time");
  const [empStatus, setEmpStatus] = React.useState("active");
  const [empJoiningDate, setEmpJoiningDate] = React.useState("");
  const [empExitDate, setEmpExitDate] = React.useState("");
  const [empDepartmentId, setEmpDepartmentId] = React.useState("");
  const [empBranchId, setEmpBranchId] = React.useState("");
  const [empManagerId, setEmpManagerId] = React.useState("");
  const [empWorkEmail, setEmpWorkEmail] = React.useState("");
  const [empPersonalEmail, setEmpPersonalEmail] = React.useState("");
  const [empPhone, setEmpPhone] = React.useState("");
  const [empAddress, setEmpAddress] = React.useState("");
  const [empEmergencyName, setEmpEmergencyName] = React.useState("");
  const [empEmergencyRel, setEmpEmergencyRel] = React.useState("");
  const [empEmergencyPhone, setEmpEmergencyPhone] = React.useState("");

  // Terminate Employee Modal
  const [isTerminateOpen, setIsTerminateOpen] = React.useState(false);
  const [terminatingEmployee, setTerminatingEmployee] = React.useState<Employee | null>(null);
  const [isTerminating, setIsTerminating] = React.useState(false);

  // Modals: Add / Edit Department
  const [isAddDeptOpen, setIsAddDeptOpen] = React.useState(false);
  const [isEditDeptOpen, setIsEditDeptOpen] = React.useState(false);
  const [editingDept, setEditingDept] = React.useState<Department | null>(null);
  const [deptFormError, setDeptFormError] = React.useState<string | null>(null);
  const [isSubmittingDept, setIsSubmittingDept] = React.useState(false);

  // Department Form Fields
  const [deptName, setDeptName] = React.useState("");
  const [deptCode, setDeptCode] = React.useState("");
  const [deptDescription, setDeptDescription] = React.useState("");
  const [deptManagerId, setDeptManagerId] = React.useState("");

  // Deactivate Department Modal
  const [isDeactivateDeptOpen, setIsDeactivateDeptOpen] = React.useState(false);
  const [deactivatingDept, setDeactivatingDept] = React.useState<Department | null>(null);
  const [isDeactivatingDept, setIsDeactivatingDept] = React.useState(false);

  // 1. Fetch Reference Options (Departments, Branches, Managers)
  const fetchReferenceData = React.useCallback(async () => {
    if (!currentOrganization) return;
    try {
      const [deptRes, branchRes, mgrRes] = await Promise.allSettled([
        apiClient.get<Department[]>(API_ENDPOINTS.departments.list, {
          organizationId: currentOrganization.id,
        }),
        apiClient.get<BranchResponse[]>(API_ENDPOINTS.organizations.currentBranches, {
          organizationId: currentOrganization.id,
        }),
        apiClient.get<ManagerOption[]>(API_ENDPOINTS.employees.managers, {
          organizationId: currentOrganization.id,
        }),
      ]);

      if (deptRes.status === "fulfilled" && deptRes.value) {
        setDepartments(deptRes.value);
      }
      if (branchRes.status === "fulfilled" && branchRes.value) {
        setBranches(branchRes.value);
      }
      if (mgrRes.status === "fulfilled" && mgrRes.value) {
        setManagers(mgrRes.value);
      }
    } catch {
      // Best-effort reference data loading
    }
  }, [currentOrganization]);

  // 2. Fetch Employees List
  const fetchEmployees = React.useCallback(async () => {
    if (!currentOrganization || !canViewEmployees) return;
    setIsLoadingEmployees(true);
    setEmployeeError(null);

    try {
      const queryParams: Record<string, string | number | boolean> = {
        page: currentPage,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
        include_inactive: includeInactive,
      };
      if (searchTerm.trim()) queryParams.search = searchTerm.trim();
      if (filterDepartment) queryParams.department_id = filterDepartment;
      if (filterBranch) queryParams.branch_id = filterBranch;
      if (filterStatus) queryParams.status = filterStatus;
      if (filterType) queryParams.employment_type = filterType;

      const res = await apiClient.get<PaginatedEmployees>(
        API_ENDPOINTS.employees.list,
        {
          organizationId: currentOrganization.id,
          params: queryParams,
        }
      );

      if (res) {
        setEmployeesData(res);
      }
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to load employees list";
      setEmployeeError(msg);
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [
    currentOrganization,
    canViewEmployees,
    currentPage,
    pageSize,
    sortBy,
    sortOrder,
    includeInactive,
    searchTerm,
    filterDepartment,
    filterBranch,
    filterStatus,
    filterType,
  ]);

  // 3. Fetch Departments List
  const fetchDepartments = React.useCallback(async () => {
    if (!currentOrganization || !canViewDepartments) return;
    setIsLoadingDepartments(true);
    setDepartmentError(null);

    try {
      const depts = await apiClient.get<Department[]>(API_ENDPOINTS.departments.list, {
        organizationId: currentOrganization.id,
      });
      setDepartments(depts || []);
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to load departments";
      setDepartmentError(msg);
    } finally {
      setIsLoadingDepartments(false);
    }
  }, [currentOrganization, canViewDepartments]);

  // Trigger loads on org / tab change
  React.useEffect(() => {
    if (currentOrganization) {
      void fetchReferenceData();
      if (activeTab === "directory") {
        void fetchEmployees();
      } else {
        void fetchDepartments();
      }
    }
  }, [currentOrganization, activeTab, fetchReferenceData, fetchEmployees, fetchDepartments]);

  // Handle Employee Form Reset
  const resetEmployeeForm = () => {
    setEmpCode("");
    setEmpFirstName("");
    setEmpLastName("");
    setEmpDesignation("");
    setEmpType("full_time");
    setEmpStatus("active");
    setEmpJoiningDate("");
    setEmpExitDate("");
    setEmpDepartmentId("");
    setEmpBranchId("");
    setEmpManagerId("");
    setEmpWorkEmail("");
    setEmpPersonalEmail("");
    setEmpPhone("");
    setEmpAddress("");
    setEmpEmergencyName("");
    setEmpEmergencyRel("");
    setEmpEmergencyPhone("");
    setEmployeeFormError(null);
    setEditingEmployee(null);
  };

  const openAddEmployee = () => {
    resetEmployeeForm();
    setIsAddEmployeeOpen(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpCode(emp.employee_code);
    setEmpFirstName(emp.first_name);
    setEmpLastName(emp.last_name);
    setEmpDesignation(emp.designation);
    setEmpType(emp.employment_type);
    setEmpStatus(emp.status);
    setEmpJoiningDate(emp.date_of_joining ? emp.date_of_joining.split("T")[0] || "" : "");
    setEmpExitDate(emp.date_of_exit ? emp.date_of_exit.split("T")[0] || "" : "");
    setEmpDepartmentId(emp.department_id || "");
    setEmpBranchId(emp.branch_id || "");
    setEmpManagerId(emp.reporting_manager_id || "");
    setEmpWorkEmail(emp.work_email || "");
    setEmpPersonalEmail(emp.personal_email || "");
    setEmpPhone(emp.phone_number || "");
    setEmpAddress(emp.current_address || "");
    setEmpEmergencyName(emp.emergency_contact_name || "");
    setEmpEmergencyRel(emp.emergency_contact_relationship || "");
    setEmpEmergencyPhone(emp.emergency_contact_phone || "");
    setEmployeeFormError(null);
    setIsEditEmployeeOpen(true);
  };

  // Submit Add Employee
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;

    if (!empCode.trim() || !empFirstName.trim() || !empLastName.trim() || !empDesignation.trim() || !empJoiningDate) {
      setEmployeeFormError("Please fill in all required fields.");
      return;
    }

    setIsSubmittingEmployee(true);
    setEmployeeFormError(null);

    const payload: EmployeeCreate = {
      employee_code: empCode.trim().toUpperCase(),
      first_name: empFirstName.trim(),
      last_name: empLastName.trim(),
      designation: empDesignation.trim(),
      employment_type: empType,
      status: empStatus,
      date_of_joining: empJoiningDate,
      date_of_exit: empExitDate ? empExitDate : null,
      department_id: empDepartmentId || null,
      branch_id: empBranchId || null,
      reporting_manager_id: empManagerId || null,
      work_email: empWorkEmail.trim() || null,
      personal_email: empPersonalEmail.trim() || null,
      phone_number: empPhone.trim() || null,
      current_address: empAddress.trim() || null,
      emergency_contact_name: empEmergencyName.trim() || null,
      emergency_contact_relationship: empEmergencyRel.trim() || null,
      emergency_contact_phone: empEmergencyPhone.trim() || null,
    };

    try {
      await apiClient.post(API_ENDPOINTS.employees.list, payload, {
        organizationId: currentOrganization.id,
      });
      setIsAddEmployeeOpen(false);
      resetEmployeeForm();
      setGlobalSuccess("Employee record created successfully.");
      void fetchEmployees();
      void fetchReferenceData();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to create employee.";
      setEmployeeFormError(msg);
    } finally {
      setIsSubmittingEmployee(false);
    }
  };

  // Submit Edit Employee
  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !editingEmployee) return;

    setIsSubmittingEmployee(true);
    setEmployeeFormError(null);

    const payload: EmployeeUpdate = {
      employee_code: empCode.trim().toUpperCase(),
      first_name: empFirstName.trim(),
      last_name: empLastName.trim(),
      designation: empDesignation.trim(),
      employment_type: empType,
      status: empStatus,
      date_of_joining: empJoiningDate,
      date_of_exit: empExitDate ? empExitDate : null,
      department_id: empDepartmentId || null,
      branch_id: empBranchId || null,
      reporting_manager_id: empManagerId || null,
      work_email: empWorkEmail.trim() || null,
      personal_email: empPersonalEmail.trim() || null,
      phone_number: empPhone.trim() || null,
      current_address: empAddress.trim() || null,
      emergency_contact_name: empEmergencyName.trim() || null,
      emergency_contact_relationship: empEmergencyRel.trim() || null,
      emergency_contact_phone: empEmergencyPhone.trim() || null,
    };

    try {
      await apiClient.patch(API_ENDPOINTS.employees.detail(editingEmployee.id), payload, {
        organizationId: currentOrganization.id,
      });
      setIsEditEmployeeOpen(false);
      resetEmployeeForm();
      setGlobalSuccess("Employee record updated successfully.");
      void fetchEmployees();
      void fetchReferenceData();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to update employee.";
      setEmployeeFormError(msg);
    } finally {
      setIsSubmittingEmployee(false);
    }
  };

  // Submit Terminate Employee
  const handleTerminateEmployee = async () => {
    if (!currentOrganization || !terminatingEmployee) return;
    setIsTerminating(true);

    try {
      await apiClient.delete(API_ENDPOINTS.employees.detail(terminatingEmployee.id), {
        organizationId: currentOrganization.id,
      });
      setIsTerminateOpen(false);
      setTerminatingEmployee(null);
      setGlobalSuccess(`Employee ${terminatingEmployee.first_name} ${terminatingEmployee.last_name} has been terminated.`);
      void fetchEmployees();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to terminate employee.";
      setEmployeeError(msg);
    } finally {
      setIsTerminating(false);
    }
  };

  // Department Form Reset
  const resetDeptForm = () => {
    setDeptName("");
    setDeptCode("");
    setDeptDescription("");
    setDeptManagerId("");
    setDeptFormError(null);
    setEditingDept(null);
  };

  const openAddDept = () => {
    resetDeptForm();
    setIsAddDeptOpen(true);
  };

  const openEditDept = (dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptCode(dept.code);
    setDeptDescription(dept.description || "");
    setDeptManagerId(dept.manager_id || "");
    setDeptFormError(null);
    setIsEditDeptOpen(true);
  };

  // Submit Add Department
  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization) return;

    if (!deptName.trim() || !deptCode.trim()) {
      setDeptFormError("Please enter Department Name and Code.");
      return;
    }

    setIsSubmittingDept(true);
    setDeptFormError(null);

    const payload: DepartmentCreate = {
      name: deptName.trim(),
      code: deptCode.trim().toUpperCase(),
      description: deptDescription.trim() || null,
      manager_id: deptManagerId || null,
      is_active: true,
    };

    try {
      await apiClient.post(API_ENDPOINTS.departments.list, payload, {
        organizationId: currentOrganization.id,
      });
      setIsAddDeptOpen(false);
      resetDeptForm();
      setGlobalSuccess("Department created successfully.");
      void fetchDepartments();
      void fetchReferenceData();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to create department.";
      setDeptFormError(msg);
    } finally {
      setIsSubmittingDept(false);
    }
  };

  // Submit Edit Department
  const handleUpdateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !editingDept) return;

    setIsSubmittingDept(true);
    setDeptFormError(null);

    const payload: DepartmentUpdate = {
      name: deptName.trim(),
      code: deptCode.trim().toUpperCase(),
      description: deptDescription.trim() || null,
      manager_id: deptManagerId || null,
    };

    try {
      await apiClient.patch(API_ENDPOINTS.departments.detail(editingDept.id), payload, {
        organizationId: currentOrganization.id,
      });
      setIsEditDeptOpen(false);
      resetDeptForm();
      setGlobalSuccess("Department updated successfully.");
      void fetchDepartments();
      void fetchReferenceData();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to update department.";
      setDeptFormError(msg);
    } finally {
      setIsSubmittingDept(false);
    }
  };

  // Submit Deactivate Department
  const handleDeactivateDept = async () => {
    if (!currentOrganization || !deactivatingDept) return;
    setIsDeactivatingDept(true);

    try {
      await apiClient.delete(API_ENDPOINTS.departments.detail(deactivatingDept.id), {
        organizationId: currentOrganization.id,
      });
      setIsDeactivateDeptOpen(false);
      setDeactivatingDept(null);
      setGlobalSuccess(`Department '${deactivatingDept.name}' has been deactivated.`);
      void fetchDepartments();
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to deactivate department.";
      setDepartmentError(msg);
    } finally {
      setIsDeactivatingDept(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: string, isActive: boolean) => {
    if (!isActive || status === "terminated") {
      return <Badge variant="destructive">Terminated</Badge>;
    }
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "probation":
        return <Badge variant="warning">Probation</Badge>;
      case "notice_period":
        return <Badge variant="warning">Notice Period</Badge>;
      case "on_leave":
        return <Badge variant="info">On Leave</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Format Type Helper
  const formatEmploymentType = (type: string) => {
    switch (type) {
      case "full_time":
        return "Full-Time";
      case "part_time":
        return "Part-Time";
      case "contract":
        return "Contract";
      case "intern":
        return "Intern";
      default:
        return type;
    }
  };

  if (isOrgLoading) {
    return <LoadingState message="Loading organization context..." fullPage />;
  }

  if (!currentOrganization) {
    return (
      <EmptyState
        icon={Building2}
        title="No Organization Selected"
        description="Please select or join an organization to access Employee & HR management."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-primary-600" />
            People & HR
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your organization&apos;s workforce, departments, and employee directory.
          </p>
        </div>

        {/* Global Action depending on active tab */}
        <div className="flex items-center gap-2">
          {activeTab === "directory" && canCreateEmployees && (
            <Button onClick={openAddEmployee} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Employee
            </Button>
          )}
          {activeTab === "departments" && canManageDepartments && (
            <Button onClick={openAddDept} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Department
            </Button>
          )}
        </div>
      </div>

      {/* Global Success Banner */}
      {globalSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <span>{globalSuccess}</span>
          </div>
          <button
            onClick={() => setGlobalSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-medium text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("directory")}
            className={`py-4 px-1 inline-flex items-center gap-2 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "directory"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Users className="h-4 w-4" />
            Employee Directory
            {employeesData.meta.total > 0 && (
              <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                {employeesData.meta.total}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("departments")}
            className={`py-4 px-1 inline-flex items-center gap-2 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "departments"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <FolderTree className="h-4 w-4" />
            Departments
            {departments.length > 0 && (
              <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                {departments.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: EMPLOYEE DIRECTORY */}
      {/* ========================================================================= */}
      {activeTab === "directory" && (
        <div className="space-y-4">
          {/* Permission Denied Check */}
          {!canViewEmployees ? (
            <ErrorState
              title="Access Denied"
              message="You do not have permission to view the employee directory. Contact an administrator."
            />
          ) : (
            <>
              {/* Search & Filter Controls Card */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {/* Search */}
                    <div className="lg:col-span-2 relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search name, code, or email..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="pl-9 text-sm"
                      />
                    </div>

                    {/* Department Filter */}
                    <div>
                      <select
                        value={filterDepartment}
                        onChange={(e) => {
                          setFilterDepartment(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">All Departments</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Branch Filter */}
                    <div>
                      <select
                        value={filterBranch}
                        onChange={(e) => {
                          setFilterBranch(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">All Branches</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Status Filter */}
                    <div>
                      <select
                        value={filterStatus}
                        onChange={(e) => {
                          setFilterStatus(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="probation">Probation</option>
                        <option value="notice_period">Notice Period</option>
                        <option value="on_leave">On Leave</option>
                        <option value="suspended">Suspended</option>
                        <option value="terminated">Terminated</option>
                      </select>
                    </div>

                    {/* Employment Type Filter */}
                    <div>
                      <select
                        value={filterType}
                        onChange={(e) => {
                          setFilterType(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">All Types</option>
                        <option value="full_time">Full-Time</option>
                        <option value="part_time">Part-Time</option>
                        <option value="contract">Contract</option>
                        <option value="intern">Intern</option>
                      </select>
                    </div>
                  </div>

                  {/* Secondary Filters: Include Inactive, Sort, Page Size */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 text-xs text-slate-600">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeInactive}
                        onChange={(e) => {
                          setIncludeInactive(e.target.checked);
                          setCurrentPage(1);
                        }}
                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span>Show inactive / terminated employees</span>
                    </label>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span>Sort:</span>
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="name">Name</option>
                          <option value="employee_code">Code</option>
                          <option value="date_of_joining">Joining Date</option>
                          <option value="created_at">Created At</option>
                        </select>
                        <button
                          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                          className="p-1 hover:bg-slate-100 rounded text-slate-600"
                          title="Toggle sort order"
                        >
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span>Per page:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Employees Table Content */}
              {isLoadingEmployees ? (
                <LoadingState message="Loading employees..." />
              ) : employeeError ? (
                <ErrorState
                  title="Error Loading Employees"
                  message={employeeError}
                  onRetry={fetchEmployees}
                />
              ) : employeesData.items.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No Employees Found"
                  description={
                    searchTerm || filterDepartment || filterBranch || filterStatus || filterType
                      ? "No employees match the specified filters. Try clearing some filter parameters."
                      : "Your organization does not have any employee records yet."
                  }
                  actionLabel={canCreateEmployees && !searchTerm ? "Add First Employee" : undefined}
                  onAction={canCreateEmployees && !searchTerm ? openAddEmployee : undefined}
                />
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-3.5">Employee</th>
                          <th className="px-4 py-3.5">Code</th>
                          <th className="px-4 py-3.5">Designation</th>
                          <th className="px-4 py-3.5">Department</th>
                          <th className="px-4 py-3.5">Branch</th>
                          <th className="px-4 py-3.5">Type</th>
                          <th className="px-4 py-3.5">Status</th>
                          <th className="px-4 py-3.5">Joined</th>
                          <th className="px-4 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {employeesData.items.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/75 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </div>
                              {emp.work_email && (
                                <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Mail className="h-3 w-3" />
                                  {emp.work_email}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">
                              {emp.employee_code}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{emp.designation}</td>
                            <td className="px-4 py-3 text-slate-600">
                              {emp.department ? emp.department.name : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {emp.branch ? emp.branch.name : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {formatEmploymentType(emp.employment_type)}
                            </td>
                            <td className="px-4 py-3">{getStatusBadge(emp.status, emp.is_active)}</td>
                            <td className="px-4 py-3 text-slate-600 text-xs">
                              {emp.date_of_joining ? emp.date_of_joining.split("T")[0] : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <Link
                                  href={`/employees/${emp.id}`}
                                  className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                                  title="View Employee Profile"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Link>
                                {canUpdateEmployees && (
                                  <button
                                    onClick={() => openEditEmployee(emp)}
                                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                                    title="Edit Employee"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                )}
                                {canDeleteEmployees && emp.is_active && emp.status !== "terminated" && (
                                  <button
                                    onClick={() => {
                                      setTerminatingEmployee(emp);
                                      setIsTerminateOpen(true);
                                    }}
                                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                                    title="Terminate Employee"
                                  >
                                    <PowerOff className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-1 text-sm text-slate-600">
                    <div>
                      Showing{" "}
                      <span className="font-semibold text-slate-900">
                        {(currentPage - 1) * pageSize + 1}
                      </span>{" "}
                      to{" "}
                      <span className="font-semibold text-slate-900">
                        {Math.min(currentPage * pageSize, employeesData.meta.total)}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-slate-900">
                        {employeesData.meta.total}
                      </span>{" "}
                      employees
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="flex items-center gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="text-xs font-medium px-2">
                        Page {currentPage} of {employeesData.meta.total_pages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPage((p) => Math.min(employeesData.meta.total_pages, p + 1))
                        }
                        disabled={currentPage >= employeesData.meta.total_pages}
                        className="flex items-center gap-1"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DEPARTMENTS */}
      {/* ========================================================================= */}
      {activeTab === "departments" && (
        <div className="space-y-4">
          {!canViewDepartments ? (
            <ErrorState
              title="Access Denied"
              message="You do not have permission to view organization departments."
            />
          ) : isLoadingDepartments ? (
            <LoadingState message="Loading departments..." />
          ) : departmentError ? (
            <ErrorState
              title="Error Loading Departments"
              message={departmentError}
              onRetry={fetchDepartments}
            />
          ) : departments.length === 0 ? (
            <EmptyState
              icon={FolderTree}
              title="No Departments Created"
              description="Departments organize your workforce into functional units like Engineering, HR, or Marketing."
              actionLabel={canManageDepartments ? "Add First Department" : undefined}
              onAction={canManageDepartments ? openAddDept : undefined}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3.5">Department Name</th>
                    <th className="px-4 py-3.5">Code</th>
                    <th className="px-4 py-3.5">Description</th>
                    <th className="px-4 py-3.5">Department Manager</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {departments.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-slate-900">{d.name}</td>
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-700">
                        {d.code}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 max-w-xs truncate">
                        {d.description || "—"}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">
                        {d.manager_name ? (
                          <span className="inline-flex items-center gap-1.5">
                            <UserCheck className="h-3.5 w-3.5 text-primary-600" />
                            {d.manager_name}
                          </span>
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {d.is_active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {canManageDepartments && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openEditDept(d)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                              title="Edit Department"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            {d.is_active && (
                              <button
                                onClick={() => {
                                  setDeactivatingDept(d);
                                  setIsDeactivateDeptOpen(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="Deactivate Department"
                              >
                                <PowerOff className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT EMPLOYEE */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddEmployeeOpen || isEditEmployeeOpen}
        onClose={() => {
          setIsAddEmployeeOpen(false);
          setIsEditEmployeeOpen(false);
          resetEmployeeForm();
        }}
        title={isEditEmployeeOpen ? "Edit Employee Record" : "Add New Employee"}
        description={
          isEditEmployeeOpen
            ? "Update the employee's personal and organizational details."
            : "Enter employee profile and organizational assignment information."
        }
        size="lg"
      >
        <form onSubmit={isEditEmployeeOpen ? handleUpdateEmployee : handleCreateEmployee} className="space-y-4">
          {employeeFormError && (
            <div role="alert" className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <span>{employeeFormError}</span>
            </div>
          )}

          {/* Section 1: Basic Information */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Basic Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="emp_code">
                  Employee Code <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="emp_code"
                  placeholder="e.g. EMP-001"
                  value={empCode}
                  onChange={(e) => setEmpCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div>
                <Label htmlFor="emp_first_name">
                  First Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="emp_first_name"
                  placeholder="First name"
                  value={empFirstName}
                  onChange={(e) => setEmpFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="emp_last_name">
                  Last Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="emp_last_name"
                  placeholder="Last name"
                  value={empLastName}
                  onChange={(e) => setEmpLastName(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Employment & Assignment */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Employment Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="emp_designation">
                  Designation <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="emp_designation"
                  placeholder="e.g. Senior Software Engineer"
                  value={empDesignation}
                  onChange={(e) => setEmpDesignation(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="emp_type">Employment Type</Label>
                <select
                  id="emp_type"
                  value={empType}
                  onChange={(e) => setEmpType(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="full_time">Full-Time</option>
                  <option value="part_time">Part-Time</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <div>
                <Label htmlFor="emp_status">Status</Label>
                <select
                  id="emp_status"
                  value={empStatus}
                  onChange={(e) => setEmpStatus(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="active">Active</option>
                  <option value="probation">Probation</option>
                  <option value="notice_period">Notice Period</option>
                  <option value="on_leave">On Leave</option>
                  <option value="suspended">Suspended</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="emp_joining_date">
                  Date of Joining <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="emp_joining_date"
                  type="date"
                  value={empJoiningDate}
                  onChange={(e) => setEmpJoiningDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="emp_exit_date">Date of Exit</Label>
                <Input
                  id="emp_exit_date"
                  type="date"
                  value={empExitDate}
                  onChange={(e) => setEmpExitDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="emp_department">Department</Label>
                <select
                  id="emp_department"
                  value={empDepartmentId}
                  onChange={(e) => setEmpDepartmentId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">None / Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="emp_branch">Branch</Label>
                <select
                  id="emp_branch"
                  value={empBranchId}
                  onChange={(e) => setEmpBranchId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">None / Unassigned</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="emp_manager">Reporting Manager</Label>
                <select
                  id="emp_manager"
                  value={empManagerId}
                  onChange={(e) => setEmpManagerId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">None (Top Level)</option>
                  {managers
                    .filter((m) => !editingEmployee || m.id !== editingEmployee.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} ({m.designation})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Contact Details */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Contact Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="emp_work_email">Work Email</Label>
                <Input
                  id="emp_work_email"
                  type="email"
                  placeholder="name@company.com"
                  value={empWorkEmail}
                  onChange={(e) => setEmpWorkEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="emp_personal_email">Personal Email</Label>
                <Input
                  id="emp_personal_email"
                  type="email"
                  placeholder="personal@email.com"
                  value={empPersonalEmail}
                  onChange={(e) => setEmpPersonalEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="emp_phone">Phone Number</Label>
                <Input
                  id="emp_phone"
                  placeholder="+1 (555) 000-0000"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="emp_address">Current Address</Label>
              <Input
                id="emp_address"
                placeholder="Street, City, State, ZIP"
                value={empAddress}
                onChange={(e) => setEmpAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Section 4: Emergency Contact */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Emergency Contact
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="emp_em_name">Contact Name</Label>
                <Input
                  id="emp_em_name"
                  placeholder="Full name"
                  value={empEmergencyName}
                  onChange={(e) => setEmpEmergencyName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="emp_em_rel">Relationship</Label>
                <Input
                  id="emp_em_rel"
                  placeholder="e.g. Spouse, Parent"
                  value={empEmergencyRel}
                  onChange={(e) => setEmpEmergencyRel(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="emp_em_phone">Emergency Phone</Label>
                <Input
                  id="emp_em_phone"
                  placeholder="+1 (555) 000-0000"
                  value={empEmergencyPhone}
                  onChange={(e) => setEmpEmergencyPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddEmployeeOpen(false);
                setIsEditEmployeeOpen(false);
                resetEmployeeForm();
              }}
              disabled={isSubmittingEmployee}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmittingEmployee}>
              {isSubmittingEmployee
                ? "Saving..."
                : isEditEmployeeOpen
                ? "Save Changes"
                : "Create Employee"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: TERMINATE EMPLOYEE CONFIRMATION */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isTerminateOpen}
        onClose={() => {
          setIsTerminateOpen(false);
          setTerminatingEmployee(null);
        }}
        title="Terminate Employee"
        description="Are you sure you want to terminate this employee record?"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5 text-amber-900">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Soft Deactivation Notice
            </div>
            <p>
              Terminating an employee will set their status to <strong>Terminated</strong> and mark them as inactive (<code>is_active = false</code>). Their historical records, audits, and past associations are retained.
            </p>
          </div>

          {terminatingEmployee && (
            <div className="text-sm bg-slate-50 p-3 rounded border border-slate-200">
              <p className="font-medium text-slate-900">
                {terminatingEmployee.first_name} {terminatingEmployee.last_name}
              </p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {terminatingEmployee.employee_code} • {terminatingEmployee.designation}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsTerminateOpen(false);
                setTerminatingEmployee(null);
              }}
              disabled={isTerminating}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleTerminateEmployee} disabled={isTerminating}>
              {isTerminating ? "Terminating..." : "Confirm Termination"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT DEPARTMENT */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddDeptOpen || isEditDeptOpen}
        onClose={() => {
          setIsAddDeptOpen(false);
          setIsEditDeptOpen(false);
          resetDeptForm();
        }}
        title={isEditDeptOpen ? "Edit Department" : "Add Department"}
        description={
          isEditDeptOpen
            ? "Update the department details and manager assignment."
            : "Create a new organizational department."
        }
        size="md"
      >
        <form onSubmit={isEditDeptOpen ? handleUpdateDept : handleCreateDept} className="space-y-4">
          {deptFormError && (
            <div role="alert" className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <span>{deptFormError}</span>
            </div>
          )}

          <div>
            <Label htmlFor="dept_name">
              Department Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="dept_name"
              placeholder="e.g. Engineering"
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="dept_code">
              Department Code <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="dept_code"
              placeholder="e.g. ENG"
              value={deptCode}
              onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
              required
            />
          </div>

          <div>
            <Label htmlFor="dept_desc">Description</Label>
            <Input
              id="dept_desc"
              placeholder="Brief summary of department responsibilities"
              value={deptDescription}
              onChange={(e) => setDeptDescription(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="dept_mgr">Department Head / Manager</Label>
            <select
              id="dept_mgr"
              value={deptManagerId}
              onChange={(e) => setDeptManagerId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">None (Unassigned)</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name} ({m.designation})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddDeptOpen(false);
                setIsEditDeptOpen(false);
                resetDeptForm();
              }}
              disabled={isSubmittingDept}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmittingDept}>
              {isSubmittingDept ? "Saving..." : isEditDeptOpen ? "Save Changes" : "Create Department"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: DEACTIVATE DEPARTMENT CONFIRMATION */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isDeactivateDeptOpen}
        onClose={() => {
          setIsDeactivateDeptOpen(false);
          setDeactivatingDept(null);
        }}
        title="Deactivate Department"
        description="Are you sure you want to deactivate this department?"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5 text-amber-900">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Soft Deactivation Notice
            </div>
            <p>
              Deactivating a department marks it as inactive. Existing employee assignments are preserved, but the department will no longer appear for new employee assignments.
            </p>
          </div>

          {deactivatingDept && (
            <div className="text-sm bg-slate-50 p-3 rounded border border-slate-200">
              <p className="font-medium text-slate-900">{deactivatingDept.name}</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Code: {deactivatingDept.code}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeactivateDeptOpen(false);
                setDeactivatingDept(null);
              }}
              disabled={isDeactivatingDept}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivateDept} disabled={isDeactivatingDept}>
              {isDeactivatingDept ? "Deactivating..." : "Confirm Deactivation"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
