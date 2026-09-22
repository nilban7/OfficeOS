import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient } from "@/lib/api/client";

// Mock Supabase client
vi.mock("@/lib/supabase/client", () => {
  const mockGetSession = vi.fn().mockResolvedValue({
    data: { session: { access_token: "mock-jwt-token-123" } },
  });
  const mockRefreshSession = vi.fn().mockResolvedValue({
    data: { session: { access_token: "refreshed-jwt-token-456" } },
    error: null,
  });

  return {
    getSupabaseBrowserClient: () => ({
      auth: {
        getSession: mockGetSession,
        refreshSession: mockRefreshSession,
      },
    }),
  };
});

describe("ApiClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("successfully makes a GET request, attaches Bearer token, and unwraps standard OfficeOS success envelope", async () => {
    const mockMe = { id: "user-123", email: "user@officeos.local", first_name: "Jane", last_name: "Doe" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({
        success: true,
        data: mockMe,
        message: "Retrieved successfully",
      }),
    });

    const client = new ApiClient("http://localhost:8000/api/v1");
    const result = await client.get<typeof mockMe>("/me");

    expect(result).toEqual(mockMe);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer mock-jwt-token-123",
        }),
      })
    );
  });

  it("correctly fetches /me/organizations", async () => {
    const mockOrgs = [
      { id: "org-1", name: "Acme Corp", slug: "acme-corp" },
      { id: "org-2", name: "Stark Labs", slug: "stark-labs" },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({
        success: true,
        data: mockOrgs,
      }),
    });

    const client = new ApiClient("http://localhost:8000/api/v1");
    const result = await client.get<typeof mockOrgs>("/me/organizations");

    expect(result).toEqual(mockOrgs);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/me/organizations",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-jwt-token-123",
        }),
      })
    );
  });

  it("attaches X-Organization-Id header for tenant-scoped /me/permissions", async () => {
    const mockPermissions = [{ code: "org:read" }, { code: "employee:read" }];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({
        success: true,
        data: mockPermissions,
      }),
    });

    const client = new ApiClient("http://localhost:8000/api/v1");
    const result = await client.get<typeof mockPermissions>("/me/permissions", {
      organizationId: "11111111-1111-1111-1111-111111111111",
    });

    expect(result).toEqual(mockPermissions);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/me/permissions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-jwt-token-123",
          "X-Organization-Id": "11111111-1111-1111-1111-111111111111",
        }),
      })
    );
  });

  it("retries request once on 401 when refresh succeeds", async () => {
    const mockData = { id: "emp-1" };

    // First call returns 401, second call returns 200
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {
          get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
        },
        json: async () => ({ detail: "Invalid access token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
        },
        json: async () => ({ success: true, data: mockData }),
      });

    const client = new ApiClient("http://localhost:8000/api/v1");
    const result = await client.get("/me");

    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("propagates 403 Forbidden without entering a retry loop", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({ detail: "Organization access denied" }),
    });

    const client = new ApiClient("http://localhost:8000/api/v1");

    await expect(
      client.get("/me/permissions", { organizationId: "forbidden-org" })
    ).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "Organization access denied",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("propagates 400 Bad Request for missing organization context", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({ detail: "Organization context is required" }),
    });

    const client = new ApiClient("http://localhost:8000/api/v1");

    await expect(client.get("/me/permissions")).rejects.toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
      message: "Organization context is required",
    });
  });

  it("correctly handles POST requests with payload", async () => {
    const payload = { title: "Frontend Foundation", budget: 5000 };
    const mockResponse = { id: "proj-1", ...payload };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({
        success: true,
        data: mockResponse,
      }),
    });

    const client = new ApiClient("http://localhost:8000/api/v1");
    const result = await client.post("/projects", payload);

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });
});
