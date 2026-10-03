"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Edit2,
  Mail,
  MapPin,
  Phone,
  PowerOff,
  ShieldAlert,
  Users,
  AlertCircle,
  Briefcase,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { ErrorState } from "@/components/feedback/error-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ROUTES } from "@/constants/routes";
import { ApiException } from "@/types/api";
import type { BranchResponse } from "@/types/organization";
import type {
  Department,
  Employee,
  EmployeeUpdate,
  ManagerOption,
} from "@/types/employee";

export default function EmployeeDetailPage() {
  const params = useParams();
  const employeeId = params?.id as string;

  const { currentOrganization, permissions, isLoading: isOrgLoading } = useOrganization();

  const canView = permissions.includes("employees.view");
  const canUpdate = permissions.includes("employees.update");
  const canDelete = permissions.includes("employees.delete");

  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Reference lists for Edit modal
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [branches, setBranches] = React.useState<BranchResponse[]>([]);
  const [managers, setManagers] = React.useState<ManagerOption[]>([]);

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Form Fields
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

  // Terminate Modal State
  const [isTerminateOpen, setIsTerminateOpen] = React.useState(false);
  const [isTerminating, setIsTerminating] = React.useState(false);

  // Fetch Employee Details
  const fetchEmployee = React.useCallback(async () => {
    if (!currentOrganization || !employeeId || !canView) return;
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiClient.get<Employee>(API_ENDPOINTS.employees.detail(employeeId), {
        organizationId: currentOrganization.id,
      });
      if (data) {
        setEmployee(data);
      }
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to load employee details";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, employeeId, canView]);

  // Fetch Reference Data for Edit Modal
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
      // Best effort
    }
  }, [currentOrganization]);

  React.useEffect(() => {
    void fetchEmployee();
    void fetchReferenceData();
  }, [fetchEmployee, fetchReferenceData]);

  const openEditModal = () => {
    if (!employee) return;
    setEmpCode(employee.employee_code);
    setEmpFirstName(employee.first_name);
    setEmpLastName(employee.last_name);
    setEmpDesignation(employee.designation);
    setEmpType(employee.employment_type);
    setEmpStatus(employee.status);
    setEmpJoiningDate(employee.date_of_joining ? employee.date_of_joining.split("T")[0] || "" : "");
    setEmpExitDate(employee.date_of_exit ? employee.date_of_exit.split("T")[0] || "" : "");
    setEmpDepartmentId(employee.department_id || "");
    setEmpBranchId(employee.branch_id || "");
    setEmpManagerId(employee.reporting_manager_id || "");
    setEmpWorkEmail(employee.work_email || "");
    setEmpPersonalEmail(employee.personal_email || "");
    setEmpPhone(employee.phone_number || "");
    setEmpAddress(employee.current_address || "");
    setEmpEmergencyName(employee.emergency_contact_name || "");
    setEmpEmergencyRel(employee.emergency_contact_relationship || "");
    setEmpEmergencyPhone(employee.emergency_contact_phone || "");
    setFormError(null);
    setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !employee) return;

    setIsSubmitting(true);
    setFormError(null);

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
      const updated = await apiClient.patch<Employee>(
        API_ENDPOINTS.employees.detail(employee.id),
        payload,
        {
          organizationId: currentOrganization.id,
        }
      );
      if (updated) {
        setEmployee(updated);
      }
      setIsEditOpen(false);
      setSuccessMessage("Employee record updated successfully.");
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to update employee.";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTerminate = async () => {
    if (!currentOrganization || !employee) return;
    setIsTerminating(true);

    try {
      const deactivated = await apiClient.delete<Employee>(
        API_ENDPOINTS.employees.detail(employee.id),
        {
          organizationId: currentOrganization.id,
        }
      );
      if (deactivated) {
        setEmployee(deactivated);
      }
      setIsTerminateOpen(false);
      setSuccessMessage(`Employee ${employee.first_name} ${employee.last_name} has been terminated.`);
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : "Failed to terminate employee.";
      setError(msg);
    } finally {
      setIsTerminating(false);
    }
  };

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
    return <LoadingState message="Loading employee details..." fullPage />;
  }

  if (!canView) {
    return (
      <ErrorState
        title="Access Denied"
        message="You do not have permission to view employee details."
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Loading employee details..." fullPage />;
  }

  if (error || !employee) {
    return (
      <ErrorState
        title="Employee Not Found"
        message={error || "The requested employee record could not be found."}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href={ROUTES.EMPLOYEES} className="hover:text-primary-600 transition-colors flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Employee Directory
        </Link>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <span className="font-medium text-slate-900">
          {employee.first_name} {employee.last_name}
        </span>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center justify-between">
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-medium text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Profile Header Card */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xl flex-shrink-0">
                {employee.first_name[0]}
                {employee.last_name[0]}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900">
                    {employee.first_name} {employee.last_name}
                  </h1>
                  {getStatusBadge(employee.status, employee.is_active)}
                </div>
                <p className="text-sm font-medium text-slate-600">{employee.designation}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1 font-mono">
                  <span>Code: {employee.employee_code}</span>
                  {employee.department && (
                    <>
                      <span>•</span>
                      <span className="font-sans">Dept: {employee.department.name}</span>
                    </>
                  )}
                  {employee.branch && (
                    <>
                      <span>•</span>
                      <span className="font-sans">Branch: {employee.branch.name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 pt-2 sm:pt-0">
              {canUpdate && (
                <Button onClick={openEditModal} variant="outline" className="flex items-center gap-1.5">
                  <Edit2 className="h-4 w-4" />
                  Edit Profile
                </Button>
              )}
              {canDelete && employee.is_active && employee.status !== "terminated" && (
                <Button
                  onClick={() => setIsTerminateOpen(true)}
                  variant="destructive"
                  className="flex items-center gap-1.5"
                >
                  <PowerOff className="h-4 w-4" />
                  Terminate
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid: Profile Detail Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Employment Details */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary-600" />
              Employment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Employment Type</span>
              <span className="font-medium text-slate-900">
                {formatEmploymentType(employee.employment_type)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Date of Joining</span>
              <span className="font-medium text-slate-900">
                {employee.date_of_joining ? employee.date_of_joining.split("T")[0] : "—"}
              </span>
            </div>
            {employee.date_of_exit && (
              <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Date of Exit</span>
                <span className="font-medium text-rose-700">
                  {employee.date_of_exit.split("T")[0]}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Department</span>
              <span className="font-medium text-slate-900">
                {employee.department ? `${employee.department.name} (${employee.department.code})` : "Unassigned"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 py-1.5">
              <span className="text-slate-500">Branch Office</span>
              <span className="font-medium text-slate-900">
                {employee.branch ? `${employee.branch.name} (${employee.branch.code})` : "Unassigned"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Reporting & Hierarchy */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-600" />
              Organizational Hierarchy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <span className="text-xs font-semibold uppercase text-slate-500 block mb-1.5">
                Reporting Manager
              </span>
              {employee.reporting_manager ? (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <div className="font-medium text-slate-900">
                      {employee.reporting_manager.first_name} {employee.reporting_manager.last_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {employee.reporting_manager.designation} • {employee.reporting_manager.employee_code}
                    </div>
                  </div>
                  <Link
                    href={`/employees/${employee.reporting_manager.id}`}
                    className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                  >
                    View Manager
                  </Link>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">No reporting manager assigned (Top-Level).</div>
              )}
            </div>

            <div>
              <span className="text-xs font-semibold uppercase text-slate-500 block mb-1.5">
                Direct Reports ({employee.direct_reports?.length || 0})
              </span>
              {employee.direct_reports && employee.direct_reports.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {employee.direct_reports.map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200 text-xs"
                    >
                      <span className="font-medium text-slate-800">
                        {report.first_name} {report.last_name} ({report.designation})
                      </span>
                      <Link
                        href={`/employees/${report.id}`}
                        className="text-primary-600 hover:text-primary-800 font-medium"
                      >
                        Profile
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">No direct reports.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Contact Information */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary-600" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Work Email
              </span>
              <span className="font-medium text-slate-900 truncate">
                {employee.work_email || "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Personal Email
              </span>
              <span className="font-medium text-slate-900 truncate">
                {employee.personal_email || "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Phone Number
              </span>
              <span className="font-medium text-slate-900">
                {employee.phone_number || "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 py-1.5">
              <span className="text-slate-500 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Current Address
              </span>
              <span className="font-medium text-slate-900">
                {employee.current_address || "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Emergency Contact */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary-600" />
              Emergency Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Contact Name</span>
              <span className="font-medium text-slate-900">
                {employee.emergency_contact_name || "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Relationship</span>
              <span className="font-medium text-slate-900">
                {employee.emergency_contact_relationship || "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 py-1.5">
              <span className="text-slate-500">Emergency Phone</span>
              <span className="font-medium text-slate-900">
                {employee.emergency_contact_phone || "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: EDIT EMPLOYEE */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setFormError(null);
        }}
        title="Edit Employee Profile"
        description="Update personal details, organizational hierarchy, or employment status."
        size="lg"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          {formError && (
            <div role="alert" className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Basic Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="detail_emp_code">
                  Employee Code <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="detail_emp_code"
                  value={empCode}
                  onChange={(e) => setEmpCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div>
                <Label htmlFor="detail_emp_fn">
                  First Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="detail_emp_fn"
                  value={empFirstName}
                  onChange={(e) => setEmpFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="detail_emp_ln">
                  Last Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="detail_emp_ln"
                  value={empLastName}
                  onChange={(e) => setEmpLastName(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Employment Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="detail_emp_desig">
                  Designation <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="detail_emp_desig"
                  value={empDesignation}
                  onChange={(e) => setEmpDesignation(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="detail_emp_type">Employment Type</Label>
                <select
                  id="detail_emp_type"
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
                <Label htmlFor="detail_emp_status">Status</Label>
                <select
                  id="detail_emp_status"
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
                <Label htmlFor="detail_emp_join">
                  Date of Joining <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="detail_emp_join"
                  type="date"
                  value={empJoiningDate}
                  onChange={(e) => setEmpJoiningDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="detail_emp_exit">Date of Exit</Label>
                <Input
                  id="detail_emp_exit"
                  type="date"
                  value={empExitDate}
                  onChange={(e) => setEmpExitDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="detail_emp_dept">Department</Label>
                <select
                  id="detail_emp_dept"
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
                <Label htmlFor="detail_emp_br">Branch</Label>
                <select
                  id="detail_emp_br"
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
                <Label htmlFor="detail_emp_mgr">Reporting Manager</Label>
                <select
                  id="detail_emp_mgr"
                  value={empManagerId}
                  onChange={(e) => setEmpManagerId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">None (Top Level)</option>
                  {managers
                    .filter((m) => m.id !== employee.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} ({m.designation})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Contact Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="detail_emp_we">Work Email</Label>
                <Input
                  id="detail_emp_we"
                  type="email"
                  value={empWorkEmail}
                  onChange={(e) => setEmpWorkEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="detail_emp_pe">Personal Email</Label>
                <Input
                  id="detail_emp_pe"
                  type="email"
                  value={empPersonalEmail}
                  onChange={(e) => setEmpPersonalEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="detail_emp_ph">Phone Number</Label>
                <Input
                  id="detail_emp_ph"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="detail_emp_addr">Current Address</Label>
              <Input
                id="detail_emp_addr"
                value={empAddress}
                onChange={(e) => setEmpAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Emergency Contact
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="detail_em_name">Contact Name</Label>
                <Input
                  id="detail_em_name"
                  value={empEmergencyName}
                  onChange={(e) => setEmpEmergencyName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="detail_em_rel">Relationship</Label>
                <Input
                  id="detail_em_rel"
                  value={empEmergencyRel}
                  onChange={(e) => setEmpEmergencyRel(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="detail_em_ph">Emergency Phone</Label>
                <Input
                  id="detail_em_ph"
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
                setIsEditOpen(false);
                setFormError(null);
              }}
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

      {/* ========================================================================= */}
      {/* MODAL: TERMINATE CONFIRMATION */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isTerminateOpen}
        onClose={() => setIsTerminateOpen(false)}
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
              Terminating this employee will set status to <strong>Terminated</strong> and deactivate their active record (<code>is_active = false</code>). Their historical records and associations remain preserved.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsTerminateOpen(false)}
              disabled={isTerminating}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleTerminate} disabled={isTerminating}>
              {isTerminating ? "Terminating..." : "Confirm Termination"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
