import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { ApiException } from "@/types/api";

import type { AuthSession, AuthUser } from "@/types/auth";
import type { RequestOptions } from "@/types/api";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe("useOrganization Hook", () => {
  const mockUser: AuthUser = { id: "user-uuid-1", email: "alice@officeos.local", createdAt: new Date().toISOString() };
  const mockSession: AuthSession = { accessToken: "valid-token-123", user: mockUser };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches organizations and selects the first one when authenticated", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      session: mockSession,
      user: mockUser,
      status: "authenticated",
      isLoading: false,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUserPassword: vi.fn(),
      refreshSession: vi.fn(),
    });

    const mockOrgs = [
      { id: "org-1", name: "Alpha Corp", slug: "alpha-corp" },
      { id: "org-2", name: "Beta LLC", slug: "beta-llc" },
    ];
    const mockPerms = [{ code: "org:read" }, { code: "employee:read" }];

    vi.mocked(apiClient.get).mockImplementation((path: string, options?: RequestOptions) => {
      if (path === "/me/organizations") {
        return Promise.resolve(mockOrgs as unknown);
      }
      if (path === "/me/permissions" && options?.organizationId === "org-1") {
        return Promise.resolve(mockPerms as unknown);
      }
      return Promise.resolve([] as unknown);
    });

    const { result } = renderHook(() => useOrganization());

    await waitFor(() => {
      expect(result.current.organizations).toEqual(mockOrgs);
      expect(result.current.currentOrganization).toEqual(mockOrgs[0]);
      expect(result.current.permissions).toEqual(["org:read", "employee:read"]);
      expect(result.current.membership?.organizationId).toBe("org-1");
    });
  });

  it("switches organization and loads permissions for the newly selected org", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      session: mockSession,
      user: mockUser,
      status: "authenticated",
      isLoading: false,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUserPassword: vi.fn(),
      refreshSession: vi.fn(),
    });

    const mockOrgs = [
      { id: "org-1", name: "Alpha Corp", slug: "alpha-corp" },
      { id: "org-2", name: "Beta LLC", slug: "beta-llc" },
    ];

    vi.mocked(apiClient.get).mockImplementation((path: string, options?: RequestOptions) => {
      if (path === "/me/organizations") return Promise.resolve(mockOrgs as unknown);
      if (path === "/me/permissions" && options?.organizationId === "org-1") {
        return Promise.resolve([{ code: "org:read" }] as unknown);
      }
      if (path === "/me/permissions" && options?.organizationId === "org-2") {
        return Promise.resolve([{ code: "org:read" }, { code: "finance:manage" }] as unknown);
      }
      return Promise.resolve([] as unknown);
    });

    const { result } = renderHook(() => useOrganization());

    await waitFor(() => {
      expect(result.current.currentOrganization?.id).toBe("org-1");
    });

    act(() => {
      result.current.selectOrganization("org-2");
    });

    await waitFor(() => {
      expect(result.current.currentOrganization?.id).toBe("org-2");
      expect(result.current.permissions).toEqual(["org:read", "finance:manage"]);
    });
  });

  it("handles 403 access denied gracefully without crashing", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      session: mockSession,
      user: mockUser,
      status: "authenticated",
      isLoading: false,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUserPassword: vi.fn(),
      refreshSession: vi.fn(),
    });

    const mockOrgs = [{ id: "org-locked", name: "Locked Corp", slug: "locked" }];

    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === "/me/organizations") return Promise.resolve(mockOrgs as unknown);
      if (path === "/me/permissions") {
        return Promise.reject(new ApiException("Organization access denied", 403, "FORBIDDEN"));
      }
      return Promise.resolve([] as unknown);
    });

    const { result } = renderHook(() => useOrganization());

    await waitFor(() => {
      expect(result.current.permissionError).toBe("Access denied for this organization");
      expect(result.current.permissions).toEqual([]);
    });
  });

  it("resets state when unauthenticated", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      session: null,
      user: null,
      status: "unauthenticated",
      isLoading: false,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUserPassword: vi.fn(),
      refreshSession: vi.fn(),
    });

    const { result } = renderHook(() => useOrganization());

    await waitFor(() => {
      expect(result.current.organizations).toEqual([]);
      expect(result.current.currentOrganization).toBeNull();
      expect(result.current.permissions).toEqual([]);
    });
  });
});
