/**
 * HTTP client.
 *
 * Built on fetch rather than axios: the surface needed here is small, and one
 * fewer dependency is one fewer thing to break in a release that has to work
 * on a specific day.
 *
 * Three behaviours are the reason this file exists rather than calling fetch
 * directly at each site:
 *
 * 1. A 401 triggers exactly one refresh attempt, and concurrent 401s share it.
 *    Without that, the six requests a screen fires on mount would each try to
 *    refresh, and five of them would fail against refresh-token rotation.
 * 2. Errors are normalised into one shape with a message fit to show an agent.
 *    "Request failed with status code 400" is useless at a polling station.
 * 3. Network failure is distinguished from server rejection. The first means
 *    "queue it and retry"; the second means "the server looked at this and
 *    said no", and conflating them would make the app retry forever.
 */

import { API_URL, REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from './config';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from './tokens';

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  /** Field-level errors from DRF, when present. */
  readonly fieldErrors: Record<string, string[]> | null;
  /** True when the request failed offline or timed out -- safe to retry. */
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string[]> | null = null,
    isNetworkError = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.isNetworkError = isNetworkError;
  }
}

/** Called when refreshing fails, so the app can return to the login screen. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => undefined;

export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler;
}

/**
 * Turn a DRF error body into one readable sentence.
 *
 * DRF returns at least four shapes: {detail}, {error: {message}},
 * {field: [msg]} and a bare list. Rather than making every screen handle all
 * of them, they are flattened once here.
 */
function extractMessage(body: unknown, status: number): string {
  if (typeof body === 'string' && body.trim()) return body;

  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;

    if (typeof record.detail === 'string') return record.detail;

    if (record.error && typeof record.error === 'object') {
      const message = (record.error as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }

    if (Array.isArray(record.non_field_errors) && record.non_field_errors.length) {
      return String(record.non_field_errors[0]);
    }

    // First field error, prefixed with the field unless it is the generic
    // catch-all, so "Total votes cast must equal..." reads naturally.
    for (const [key, value] of Object.entries(record)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string' && first.trim()) {
        return key === 'detail' || /^\d+$/.test(key) ? first : first;
      }
    }
  }

  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'Not found.';
  if (status >= 500) return 'The server had a problem. Please try again.';
  return 'Something went wrong.';
}

function extractFieldErrors(body: unknown): Record<string, string[]> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      out[key] = value as string[];
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Single-flight token refresh.
 *
 * Every caller that hits a 401 awaits the same promise, so N concurrent
 * failures cause one refresh rather than N.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = await getRefreshToken();
    if (!refresh) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_URL}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        // The refresh token is genuinely dead (expired, or the agent was
        // deactivated from the command centre). Sign out.
        await clearTokens();
        onSessionExpired();
        return false;
      }

      const data = (await response.json()) as { access?: string };
      if (!data.access) return false;
      setAccessToken(data.access);
      return true;
    } catch {
      clearTimeout(timer);
      // Offline or timed out. The token may well still be valid, so do NOT
      // sign out -- doing so would lock an agent out of their queued work.
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Multipart body for uploads. Set instead of `body`. */
  formData?: FormData;
  /** Skip the Authorization header (login only). */
  anonymous?: boolean;
  timeoutMs?: number;
  /** Internal: prevents a refresh loop. */
  _isRetry?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    formData,
    anonymous = false,
    timeoutMs = formData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    _isRetry = false,
  } = options;

  const headers: Record<string, string> = {};

  if (!anonymous) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Content-Type is deliberately NOT set for FormData: the runtime must add it
  // itself so the multipart boundary matches the body it generates.
  if (body !== undefined && !formData) {
    headers['Content-Type'] = 'application/json';
  }

  // AbortController rather than Promise.race, so an abandoned request actually
  // stops consuming the radio instead of completing unobserved.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'The request timed out. Check your signal and try again.'
        : 'No connection. Your work is saved and will be sent when you have signal.',
      0,
      null,
      true,
    );
  }
  clearTimeout(timeout);

  if (response.status === 401 && !anonymous && !_isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, _isRetry: true });
    }
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      extractMessage(parsed, response.status),
      response.status,
      extractFieldErrors(parsed),
    );
  }

  return parsed as T;
}

/**
 * Exchange any refresh token for a new access token without touching the
 * shared in-flight state. Used by biometric sign-in, which holds a separate
 * credential from the main session refresh.
 */
export async function refreshAccessTokenWith(token: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_URL}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: token }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { access?: string };
    return data.access ?? null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}
