"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, RefreshCw } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { PlatformAnnouncementBanner } from "@/components/admin/announcement-banner";
import { useAuth } from "@/hooks/use-auth";
import { LoadingState } from "@/components/feedback/loading-state";
import { OrganizationProvider, useOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-context";

function ProtectedLayoutContent({ children }: { children: React.ReactNode }) {
  const { currentOrganization, isLoadingOrgs, orgError, organizations } = useOrganization();
  const { isCollapsed } = useSidebar();

  // If user has no active organization yet and it is currently loading:
  if (!currentOrganization && isLoadingOrgs) {
    return <LoadingState fullPage message="Connecting to organization workspace..." />;
  }

  // If there was an error loading organizations and no active organization could be loaded:
  if (!currentOrganization && orgError && organizations.length === 0) {
    return (
      <div className="flex min-h-[60vh] w-full flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="rounded-full bg-amber-50 p-4 text-amber-600">
          <Building2 className="h-8 w-8" />
        </div>
        <div className="space-y-1 max-w-md">
          <h2 className="text-lg font-semibold text-slate-900">Workspace Connecting...</h2>
          <p className="text-sm text-slate-500">
            {orgError}. The backend service may be waking up from sleep.
          </p>
        </div>
        <Button onClick={() => window.location.reload()} size="sm" className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>Retry Connection</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Desktop Sidebar */}
      <AppSidebar />

      {/* Main Content Area */}
      <div
        className={cn(
          "flex flex-col min-h-screen min-w-0 overflow-x-hidden transition-[padding] duration-200 ease-out",
          isCollapsed ? "md:pl-16" : "md:pl-64"
        )}
      >
        <AppHeader />
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0">
          <PlatformAnnouncementBanner />
          {children}
        </main>
      </div>
    </div>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(ROUTES.LOGIN);
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return <LoadingState fullPage message="Authenticating session..." />;
  }

  return (
    <OrganizationProvider>
      <SidebarProvider>
        <ProtectedLayoutContent>{children}</ProtectedLayoutContent>
      </SidebarProvider>
    </OrganizationProvider>
  );
}
