/**
 * API response shapes.
 *
 * These mirror the Django serializers exactly. Where a field is nullable in
 * the backend it is nullable here -- an agent may be registered before being
 * posted to a station, and the app has to render that state rather than crash
 * on it.
 */

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface AgentProfile {
  id: string;
  full_name: string;
  phone_number: string;
  level: 'POLLING_STATION' | 'WARD' | 'CONSTITUENCY';
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  email: string;
}

export interface PollingStationInfo {
  id: string;
  name: string;
  /** Name plus stream, e.g. "KOIMBI PRIMARY SCHOOL - Stream 1". */
  display_name: string;
  iebc_code: string;
  stream: number | null;
  registered_voters: number | null;
  centre_name: string | null;
  ward: string | null;
  constituency: string | null;
}

export interface RaceInfo {
  id: string;
  title: string;
  race_type: string;
  /** Statutory form code, e.g. "35A". Blank until legally confirmed. */
  result_form_code: string;
  election: string;
  election_date: string;
}

export interface BallotCandidate {
  id: string;
  full_name: string;
  party_abbreviation: string;
  ballot_number: number | null;
}

export type SubmissionStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'FLAGGED';

export interface ExistingSubmission {
  id: string;
  status: SubmissionStatus;
  submitted_at: string;
  rejection_reason: string;
}

/** The single bootstrap payload: everything needed for the whole day. */
export interface AgentPosting {
  agent: AgentProfile;
  polling_station: PollingStationInfo | null;
  race: RaceInfo | null;
  candidates: BallotCandidate[];
  existing_submission: ExistingSubmission | null;
}

export interface Attachment {
  id: string;
  url: string;
  kind: 'IMAGE' | 'AUDIO';
  purpose: 'RESULT_FORM' | 'CHAT';
  original_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  duration_ms: number | null;
  created_at: string;
}

export interface SubmitResultPayload {
  race: string;
  polling_station: string;
  total_registered_voters: number;
  total_valid_votes: number;
  total_rejected_votes: number;
  total_votes_cast: number;
  form_34a_photo?: string;
  additional_photos?: string[];
  notes?: string;
  candidate_votes: { candidate: string; votes: number }[];
}

export interface SubmissionResponse {
  id: string;
  status: SubmissionStatus;
  submitted_at: string;
  total_registered_voters: number;
  total_valid_votes: number;
  total_rejected_votes: number;
  total_votes_cast: number;
  turnout: number;
  form_34a_photo: string;
  rejection_reason: string;
  notes: string;
  candidate_votes: {
    id: string;
    candidate: string;
    candidate_name: string;
    candidate_party: string;
    votes: number;
  }[];
}

export type MessageKind = 'TEXT' | 'IMAGE' | 'AUDIO' | 'SYSTEM';

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  body: string;
  attachment: Attachment | null;
  from_agent: boolean;
  sender_name: string;
  client_uuid: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ConversationInfo {
  id: string;
  last_message_at: string | null;
  last_message_preview: string;
  unread: number;
}

export interface MessageListResponse {
  count: number;
  results: ChatMessage[];
}
