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
  AdminEvent,
  AdminEventInput,
  AgentListItem,
  AgentPosting,
  Attachment,
  ChatMessage,
  ConversationInfo,
  EventSaveResult,
  GeoUnit,
  GroupMemberItem,
  InboxConversation,
  LiveTally,
  LoginResponse,
  MessageListResponse,
  PeopleStats,
  Person,
  PollingCentreItem,
  RaceListItem,
  SpecialGroupItem,
  StructureResponse,
  SubmissionHistoryResponse,
  ThreadResponse,
  SubmissionResponse,
  SubmitResultPayload,
  UserMe,
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

/** The signed-in agent's own submission history, most recent first. */
export function fetchSubmissionHistory() {
  return apiRequest<SubmissionHistoryResponse>('/agents/me/submissions/');
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

/**
 * Live vote totals for a race, aggregated across every station that has
 * reported. The same numbers the command centre's dashboard shows, polled
 * rather than pushed -- see useLiveTally for the cadence.
 */
export function fetchLiveTally(raceId: string) {
  return apiRequest<LiveTally>(`/tally/race/${raceId}/`);
}

/**
 * Register (or, with an empty string, clear) this device's Expo push token,
 * so the backend can notify this phone when the command centre writes.
 */
export function registerPushToken(token: string) {
  return apiRequest<{ registered: boolean }>('/agents/me/push-token/', {
    method: 'POST',
    body: { token },
  });
}

/**
 * Latest app build the campaign has shipped, so an outdated APK can say so.
 * The backend reads these from environment variables; ops bump them when a
 * new build is distributed.
 */
export function fetchAppVersion() {
  return apiRequest<{
    android: { min_version: string; latest_version: string; download_url: string };
  }>('/app/version/');
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
  submission_id?: string;
}) {
  return apiRequest<ChatMessage>('/messages/', { method: 'POST', body: payload });
}

export function markMessagesRead() {
  return apiRequest<{ marked_read: number }>('/messages/read/', { method: 'POST' });
}

// --------------------------------------------------------------------------- //
// Admin mode
//
// Everything below is the command-centre surface, reachable from a phone.
// Authorization is the backend's: an agent token calling any of these gets a
// 403, so nothing here needs its own gate beyond not being rendered.
// --------------------------------------------------------------------------- //

/** Who am I, and therefore which navigator does this phone get. */
export function fetchMe() {
  return apiRequest<UserMe>('/auth/me/');
}

// ---- Events calendar ---- //

export function fetchAdminEvents(fromIso: string, toIso: string) {
  return apiRequest<{ count: number; results: AdminEvent[] }>(
    `/events/?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
  );
}

export function createAdminEvent(payload: AdminEventInput) {
  return apiRequest<EventSaveResult>('/events/', { method: 'POST', body: payload });
}

export function updateAdminEvent(id: string, payload: Partial<AdminEventInput>) {
  return apiRequest<EventSaveResult>(`/events/${id}/`, {
    method: 'PATCH',
    body: payload,
  });
}

export function deleteAdminEvent(id: string) {
  return apiRequest<void>(`/events/${id}/`, { method: 'DELETE' });
}

export function checkEventConflicts(startsAt: string, endsAt: string, excludeId?: string) {
  const exclude = excludeId ? `&exclude=${excludeId}` : '';
  return apiRequest<{ count: number; conflicts: AdminEvent[] }>(
    `/events/conflicts/?starts_at=${encodeURIComponent(startsAt)}&ends_at=${encodeURIComponent(endsAt)}${exclude}`,
  );
}

// ---- Races and tally ---- //

export function fetchRaces() {
  return apiRequest<RaceListItem[]>('/races/');
}

// ---- Geography (cascading pickers) ---- //

export function fetchCounties() {
  return apiRequest<GeoUnit[]>('/geography/counties/');
}

export function fetchConstituencies(countyId: string) {
  return apiRequest<GeoUnit[]>(`/geography/constituencies/?county=${countyId}`);
}

export function fetchWards(constituencyId: string) {
  return apiRequest<GeoUnit[]>(`/geography/wards/?constituency=${constituencyId}`);
}

/** Centres in a ward, optionally narrowed by a type-ahead search. Paginated
 * server-side; one ward has few enough centres that page one is the list. */
export async function fetchPollingCentres(wardId: string, search?: string) {
  const q = search ? `&search=${encodeURIComponent(search)}` : '';
  const data = await apiRequest<
    { results: PollingCentreItem[] } | PollingCentreItem[]
  >(`/geography/polling-centres/?ward=${wardId}${q}`);
  return Array.isArray(data) ? data : data.results;
}

export function fetchStructure(level: string, parent?: string) {
  const p = parent ? `&parent=${parent}` : '';
  return apiRequest<StructureResponse>(
    `/geography/polling-stations/structure/?level=${level}${p}`,
  );
}

// ---- My People ---- //

export function fetchPeople(search?: string) {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest<Person[]>(`/mypeople/${q}`);
}

export function fetchPeopleStats() {
  return apiRequest<PeopleStats>('/mypeople/stats/');
}

export function createPerson(payload: {
  full_name: string;
  phone_number: string;
  email: string;
  polling_centre: string | null;
  notes: string;
}) {
  return apiRequest<Person>('/mypeople/', { method: 'POST', body: payload });
}

export function updatePerson(
  id: string,
  payload: Partial<{
    full_name: string;
    phone_number: string;
    email: string;
    polling_centre: string | null;
    notes: string;
  }>,
) {
  return apiRequest<Person>(`/mypeople/${id}/`, { method: 'PATCH', body: payload });
}

export function deletePerson(id: string) {
  return apiRequest<void>(`/mypeople/${id}/`, { method: 'DELETE' });
}

// ---- Special groups ---- //

export function fetchGroups(search?: string) {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest<SpecialGroupItem[]>(`/special-groups/${q}`);
}

export function fetchGroupCategories() {
  return apiRequest<{ value: string; label: string }[]>('/special-groups/categories/');
}

export function createGroup(payload: { name: string; category: string; description: string }) {
  return apiRequest<SpecialGroupItem>('/special-groups/', {
    method: 'POST',
    body: payload,
  });
}

export function fetchGroupMembers(groupId: string) {
  return apiRequest<GroupMemberItem[]>(`/special-groups/${groupId}/members/`);
}

export function createGroupMember(payload: {
  group: string;
  full_name: string;
  phone_number: string;
  rank: string;
  polling_centre: string | null;
}) {
  return apiRequest<GroupMemberItem>('/group-members/', {
    method: 'POST',
    body: payload,
  });
}

export function deleteGroupMember(id: string) {
  return apiRequest<void>(`/group-members/${id}/`, { method: 'DELETE' });
}

// ---- Agents directory ---- //

/** Every agent, unpaginated. The server searches name/phone/email; location
 * and station search happens client-side over the `location` display string,
 * so one fetch serves every keystroke without a network round trip. */
export function fetchAgents() {
  return apiRequest<AgentListItem[]>('/agents/');
}

// ---- Command-centre messaging ---- //

export function fetchInbox() {
  return apiRequest<{ count: number; results: InboxConversation[] }>(
    '/messages/inbox/',
  );
}

/** Opening a thread also marks the agent's messages read, server-side. */
export function fetchThread(conversationId: string) {
  return apiRequest<ThreadResponse>(`/messages/inbox/${conversationId}/`);
}

export function sendThreadMessage(
  conversationId: string,
  payload: { body: string; client_uuid: string },
) {
  return apiRequest<ChatMessage>(`/messages/inbox/${conversationId}/`, {
    method: 'POST',
    body: { kind: 'TEXT', ...payload },
  });
}
