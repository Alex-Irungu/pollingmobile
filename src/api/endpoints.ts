/**
 * Typed wrappers around the API.
 *
 * One function per endpoint, so no screen builds a URL or a request body by
 * hand. When the backend contract changes, it changes here and TypeScript
 * finds every affected call site.
 */

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
  // React Native's FormData accepts this {uri, name, type} shape; it is not
  // the browser File API.
  form.append('file', {
    uri: params.uri,
    name: params.name,
    type: params.mimeType,
  } as unknown as Blob);
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
