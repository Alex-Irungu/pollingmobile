/**
 * Typed wrappers around the API.
 *
 * One function per endpoint, so no screen builds a URL or a request body by
 * hand. When the backend contract changes, it changes here and TypeScript
 * finds every affected call site.
 */

import { File } from 'expo-file-system';

import { API_BASE_URL } from './config';
import { apiRequest } from './client';
import type {
  AgentPosting,
  Attachment,
  ChatMessage,
  ConversationInfo,
  LoginResponse,
  MessageListResponse,
  SubmissionResponse,
  SubmitResultPayload,
} from './types';

// --------------------------------------------------------------------------- //
// Backend warm-up
// --------------------------------------------------------------------------- //

/**
 * Fire-and-forget GET to /health/ — wakes a sleeping Render free-tier instance
 * before the actual upload begins. Call it when the user starts to confirm;
 * by the time they tap Send, the backend has already started responding.
 *
 * Never throws: a failed ping is not itself an error, the upload will
 * still try with its own timeout.
 */
export function warmUp(): void {
  fetch(`${API_BASE_URL}/health/`, { method: 'GET' }).catch(() => undefined);
}

// --------------------------------------------------------------------------- //
// Authentication
// --------------------------------------------------------------------------- //

export function login(email: string, password: string) {
  return apiRequest<LoginResponse>('/auth/login/', {
    method: 'POST',
    // Emails get capitalised by mobile keyboards and padded by autocomplete.
    // Normalising here rather than at the server keeps the failure out of the
    // agent's way entirely.
    body: { email: email.trim().toLowerCase(), password },
    anonymous: true,
  });
}

export function logout(refresh: string) {
  return apiRequest<void>('/auth/logout/', {
    method: 'POST',
    body: { refresh },
  });
}

// --------------------------------------------------------------------------- //
// The agent's posting
// --------------------------------------------------------------------------- //

export function fetchPosting() {
  return apiRequest<AgentPosting>('/agents/me/');
}

/**
 * Field-safety ping, not a results endpoint: lets the command centre find an
 * agent who has gone silent. Failures are swallowed by the caller
 * (src/services/locationTracking.ts) rather than surfaced to the agent -- a
 * missed ping on bad signal is not something they need to act on.
 */
export function updateMyLocation(latitude: number, longitude: number) {
  return apiRequest<{ recorded_at: string }>('/agents/me/location/', {
    method: 'POST',
    body: { latitude, longitude },
  });
}

// --------------------------------------------------------------------------- //
// Uploads
// --------------------------------------------------------------------------- //

/**
 * Upload one file and get back an id and URL.
 *
 * Separate from submitting the result on purpose: once the photo is up, a
 * failed submission can be retried without re-sending the image. On a weak
 * connection that is the difference between one 300KB transfer and five.
 */
export function uploadFile(params: {
  uri: string;
  name: string;
  mimeType: string;
  purpose: 'RESULT_FORM' | 'CHAT';
  durationMs?: number;
}) {
  const form = new FormData();
  // Expo SDK 57's global fetch/FormData is WinterCG-compliant and only
  // accepts a string, a real Blob, or an expo-file-system File (which
  // implements the Blob interface). The classic React Native
  // {uri, name, type} object shape throws "Unsupported FormDataPart
  // implementation" under this runtime.
  const file = new File(params.uri);
  form.append('file', file, params.name);
  form.append('purpose', params.purpose);
  if (params.durationMs !== undefined) {
    form.append('duration_ms', String(Math.round(params.durationMs)));
  }

  return apiRequest<Attachment>('/uploads/', { method: 'POST', formData: form });
}

// --------------------------------------------------------------------------- //
// Results
// --------------------------------------------------------------------------- //

export function submitResult(payload: SubmitResultPayload) {
  return apiRequest<SubmissionResponse>('/results/submissions/submit/', {
    method: 'POST',
    body: payload,
  });
}

// --------------------------------------------------------------------------- //
// Chat
// --------------------------------------------------------------------------- //

export function fetchConversation() {
  return apiRequest<ConversationInfo>('/messages/conversation/');
}

/**
 * @param after ISO timestamp; returns only messages newer than it, so polling
 * does not re-download the thread on metered data.
 */
export function fetchMessages(after?: string) {
  const query = after ? `?after=${encodeURIComponent(after)}` : '';
  return apiRequest<MessageListResponse>(`/messages/${query}`);
}

export function sendMessage(payload: {
  kind: 'TEXT' | 'IMAGE' | 'AUDIO';
  body?: string;
  attachment_id?: string;
  client_uuid: string;
}) {
  return apiRequest<ChatMessage>('/messages/', { method: 'POST', body: payload });
}

export function markMessagesRead() {
  return apiRequest<{ marked_read: number }>('/messages/read/', { method: 'POST' });
}
