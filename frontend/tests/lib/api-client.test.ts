import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient } from "@/lib/api/client";
import { ApiException } from "@/types/api";

describe("ApiClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("successfully makes a GET request and unwraps standard OfficeOS success envelope", async () => {
    const mockData = { id: "emp-1", name: "Alice" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({
        success: true,
        data: mockData,
        message: "Retrieved successfully",
      }),
    });

    const client = new ApiClient("http://localhost:8000/api/v1");
    const result = await client.get<typeof mockData>("/employees/emp-1");

    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/employees/emp-1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("attaches organization ID header when provided in options", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({ success: true, data: [] }),
    });

    const client = new ApiClient("http://localhost:8000/api/v1");
    await client.get("/projects", { organizationId: "org-123" });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/projects",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Organization-Id": "org-123",
        }),
      })
    );
  });

  it("throws ApiException on standard OfficeOS error envelope", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({
        success: false,
        error: {
          code: "EMPLOYEE_NOT_FOUND",
          message: "Employee with specified ID does not exist.",
        },
      }),
    });

    const client = new ApiClient("http://localhost:8000/api/v1");

    await expect(client.get("/employees/non-existent")).rejects.toThrow(ApiException);
    await expect(client.get("/employees/non-existent")).rejects.toMatchObject({
      status: 404,
      code: "EMPLOYEE_NOT_FOUND",
      message: "Employee with specified ID does not exist.",
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
