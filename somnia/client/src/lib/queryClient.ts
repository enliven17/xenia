import { QueryClient, type QueryFunction } from "@tanstack/react-query";

type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export function setAuthTokenGetter(fn: TokenGetter | null): void {
  tokenGetter = fn;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (tokenGetter) {
    try {
      const token = await tokenGetter();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // ignore — request proceeds unauthenticated
    }
  }
  return headers;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const message =
      (isJson && body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ||
      (typeof body === "string" && body) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}

export async function apiRequest<T = unknown>(
  method: string,
  url: string,
  data?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(await getAuthHeaders()),
  };

  const init: RequestInit = {
    method,
    headers,
    credentials: "include",
  };

  if (data !== undefined && method.toUpperCase() !== "GET") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(data);
  }

  const res = await fetch(url, init);
  return parseResponse<T>(res);
}

const defaultQueryFn: QueryFunction = async ({ queryKey, signal }) => {
  const [first, ...rest] = queryKey as readonly unknown[];
  if (typeof first !== "string") {
    throw new Error("Default query function expects string queryKey[0]");
  }
  const url = rest.length === 0 ? first : `${first}${rest.map((p) => `/${String(p)}`).join("")}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(await getAuthHeaders()),
  };

  const res = await fetch(url, {
    method: "GET",
    headers,
    credentials: "include",
    signal,
  });
  return parseResponse(res);
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
