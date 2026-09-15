import { env } from "@/lib/config/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ApiException, type ApiResponse, type RequestOptions } from "@/types/api";

export class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number;

  constructor(baseUrl: string = env.apiUrl, defaultTimeout: number = 30000) {
    // Ensure baseUrl does not have a trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Resolves the current auth token from the Supabase session if available.
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Builds the complete URL with search query parameters.
   */
  private buildUrl(path: string, params?: RequestOptions["params"]): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Internal request executor handling headers, timeouts, response envelopes, and error mapping.
   */
  private async request<T>(
    path: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const token = await this.getAuthToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (options?.organizationId) {
      headers["X-Organization-Id"] = options.organizationId;
    }

    const controller = new AbortController();
    const timeout = options?.timeout ?? this.defaultTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (!response.ok) {
        if (isJson) {
          const errorBody = (await response.json()) as Partial<ApiResponse<never>>;
          if (errorBody && "error" in errorBody && errorBody.error) {
            throw new ApiException(
              errorBody.error.message || `HTTP ${response.status}`,
              response.status,
              errorBody.error.code || `HTTP_${response.status}`,
              errorBody.error.details,
              errorBody.error.field
            );
          }
          // FastAPI default error format: { detail: ... }
          const fastApiError = errorBody as { detail?: string | { msg: string; loc: string[] }[] };
          if (fastApiError.detail) {
            const detailMsg =
              typeof fastApiError.detail === "string"
                ? fastApiError.detail
                : Array.isArray(fastApiError.detail)
                  ? fastApiError.detail.map((d) => d.msg).join(", ")
                  : "Validation Error";
            throw new ApiException(detailMsg, response.status, `HTTP_${response.status}`);
          }
        }

        const rawText = await response.text().catch(() => "");
        throw new ApiException(
          rawText || `Request failed with status ${response.status}`,
          response.status,
          `HTTP_${response.status}`
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      if (isJson) {
        const json = (await response.json()) as ApiResponse<T> | T;
        // Unwrap standard OfficeOS envelope if present
        if (json && typeof json === "object" && "success" in json) {
          const apiResponse = json as ApiResponse<T>;
          if (apiResponse.success === true) {
            return apiResponse.data;
          } else if (apiResponse.success === false) {
            throw new ApiException(
              apiResponse.error.message,
              response.status,
              apiResponse.error.code,
              apiResponse.error.details,
              apiResponse.error.field
            );
          }
        }
        return json as T;
      }

      return (await response.text()) as unknown as T;
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        throw err;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiException(`Request timeout after ${timeout}ms`, 408, "REQUEST_TIMEOUT");
      }
      if (err instanceof Error) {
        throw new ApiException(err.message, 0, "NETWORK_ERROR");
      }
      throw new ApiException("An unknown network error occurred", 0, "UNKNOWN_ERROR");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, "GET", undefined, options);
  }

  public post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, "POST", body, options);
  }

  public put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, "PUT", body, options);
  }

  public patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, "PATCH", body, options);
  }

  public delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, "DELETE", undefined, options);
  }
}

export const apiClient = new ApiClient();
