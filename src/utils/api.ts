/**
 * Small fetch wrapper used for every call to the Node/C++ backend.
 * - sends the admin session cookie automatically (same origin)
 * - throws ApiError for any non-2xx answer, carrying the server's message
 */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON answer */
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || data?.message || `Request failed (${res.status})`, data?.code);
  }
  return data as T;
}
