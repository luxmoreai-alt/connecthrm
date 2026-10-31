// Always call the API through the app's own origin. Next.js proxies /api to
// the backend, keeping refresh cookies first-party for iOS Home Screen apps.
export const API_BASE = "/api";

export const getAssetUrl = (assetPath?: string | null): string | undefined => {
  if (!assetPath) return undefined;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  return assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
};

/**
 * Lightweight fetch wrapper for the HRMS backend.
 *
 * - Automatically attaches the access token from localStorage.
 * - On 401, attempts a silent refresh and retries once.
 * - Returns typed JSON or throws an `ApiError`.
 */

// ─── Types ───────────────────────────────────────────────────────────
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errorCode: string;
}

export type ApiResult<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export class ApiError extends Error {
  constructor(
    public message: string,
    public errorCode: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Token helpers ───────────────────────────────────────────────────
const TOKEN_KEY = "hrms_access_token";

export const getAccessToken = (): string | null =>
  typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

export const setAccessToken = (token: string): void =>
  localStorage.setItem(TOKEN_KEY, token);

export const clearAccessToken = (): void =>
  localStorage.removeItem(TOKEN_KEY);

// ─── Core request function ───────────────────────────────────────────
async function request<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set Content-Type for non-FormData bodies
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    // HR data changes frequently (for example when an admin overrides an
    // attendance day). Never let the browser reuse an older GET response.
    cache: options.cache ?? (options.method === "GET" ? "no-store" : undefined),
    credentials: "include", // send httpOnly cookies (refresh token)
  });

  const body = await res.json().catch(() => null);

  // Successful response
  if (res.ok && body?.success) {
    return body.data as T;
  }

  // 401 — attempt silent token refresh, then retry once
  const canAttemptRefresh = retry && endpoint !== "/auth/login" && endpoint !== "/auth/refresh";
  if (res.status === 401 && canAttemptRefresh) {
    const refreshed = await silentRefresh();
    if (refreshed) {
      return request<T>(endpoint, options, false);
    }
    // Refresh failed — notify app to redirect to login
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
  }

  // Error
  const msg = body?.message || res.statusText || "Request failed";
  const code = body?.errorCode || "UNKNOWN_ERROR";
  throw new ApiError(msg, code, res.status);
}

// ─── Silent refresh ──────────────────────────────────────────────────
let refreshPromise: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh calls
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const body = await res.json().catch(() => null);

      if (res.ok && body?.success && body?.data?.accessToken) {
        setAccessToken(body.data.accessToken);
        return true;
      }

      // Refresh failed — clear everything
      clearAccessToken();
      return false;
    } catch {
      clearAccessToken();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ─── Public helpers ──────────────────────────────────────────────────
export const api = {
  get: <T = unknown>(endpoint: string) =>
    request<T>(endpoint, { method: "GET" }),

  post: <T = unknown>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T = unknown>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T = unknown>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T = unknown>(endpoint: string) =>
    request<T>(endpoint, { method: "DELETE" }),

  postFormData: <T = unknown>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, {
      method: "POST",
      body: formData,
    }),

  downloadBlob: async (endpoint: string, fallbackFileName = 'download') => {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.message || 'Download failed', body?.errorCode || 'DOWNLOAD_ERROR', res.status);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition');
    let fileName = fallbackFileName;
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match?.[1]) fileName = match[1];
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
