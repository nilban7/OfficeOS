"use client";

import * as React from "react";
import {
  Users,
  Clock,
  CalendarDays,
  Layers,
  CheckCircle2,
  Plus,
  ShieldCheck,
  Server,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { env } from "@/lib/config/env";

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentOrganization, membership } = useOrganization();

  const greetingName = user?.fullName || user?.email?.split("@")[0] || "Team Member";

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Welcome back, {greetingName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Here is the current overview for{" "}
            <span className="font-semibold text-slate-700">
              {currentOrganization?.name || "Your Organization"}
            </span>
            .
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Button size="sm" variant="outline">
            View Reports
          </Button>
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Quick Action
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card hover>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Employees</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">42</div>
            <p className="text-xs text-slate-500 mt-1 flex items-center">
              <span className="text-emerald-600 font-medium inline-flex items-center mr-1">
                +3
              </span>{" "}
              joined this month
            </p>
          </CardContent>
        </Card>

        <Card hover>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Today</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">38 / 42</div>
            <p className="text-xs text-slate-500 mt-1">
              90.4% attendance rate
            </p>
          </CardContent>
        </Card>

        <Card hover>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending Leaves</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CalendarDays className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">4</div>
            <p className="text-xs text-amber-600 font-medium mt-1">
              Requires review
            </p>
          </CardContent>
        </Card>

        <Card hover>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Projects</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">8</div>
            <p className="text-xs text-slate-500 mt-1">
              2 milestones due this week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grid: System Status & Foundation Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Foundation Architecture Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Architecture & Integration Status</CardTitle>
                <CardDescription>
                  Status of frontend connectivity and platform boundaries.
                </CardDescription>
              </div>
              <Badge variant="success">Foundation Ready</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-md bg-white border border-slate-200 text-slate-700">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">FastAPI Business API</p>
                    <p className="text-xs text-slate-500">Base URL: {env.apiUrl}</p>
                  </div>
                </div>
                <Badge variant="info">v1 Convention</Badge>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Centralized typed API client with automatic Supabase Bearer token injection and standardized envelope handling.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-md bg-white border border-slate-200 text-slate-700">
                    <ShieldCheck className="h-4 w-4 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Multi-Tenant Isolation</p>
                    <p className="text-xs text-slate-500">
                      Active Org: {currentOrganization?.id || "None selected"}
                    </p>
                  </div>
                </div>
                <Badge variant="default">Tenant Isolated</Badge>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tenant authorization is authoritative on the backend. Frontend permissions are UX-only helpers.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Right Col: Active Session & Role */}
        <Card>
          <CardHeader>
            <CardTitle>Current Session</CardTitle>
            <CardDescription>Authenticated user context</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                <span className="text-slate-500">User Email</span>
                <span className="font-medium text-slate-800 truncate max-w-[160px]">
                  {user?.email || "demo@officeos.local"}
                </span>
              </div>
              <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                <span className="text-slate-500">Active Role</span>
                <span className="font-medium capitalize text-slate-800">
                  {membership?.role?.replace("_", " ") || "Admin"}
                </span>
              </div>
              <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                <span className="text-slate-500">Organization</span>
                <span className="font-medium text-slate-800">
                  {currentOrganization?.name || "Demo Org"}
                </span>
              </div>
              <div className="flex justify-between text-xs py-1">
                <span className="text-slate-500">Auth Status</span>
                <span className="inline-flex items-center text-emerald-600 font-medium">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Connected
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => window.location.reload()}>
                Refresh Session State
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
