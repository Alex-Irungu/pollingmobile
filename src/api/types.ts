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

/**
 * Submission status.
 *
 * A plain string, NOT a closed union. The backend's vocabulary has already
 * changed once -- it was PENDING/VERIFIED/REJECTED/FLAGGED until the
 * verification workflow was removed, leaving only SUBMITTED. A deployed phone
 * cannot be updated mid-election, so the app must render a status it has never
 * seen rather than crash or show a blank. `KnownSubmissionStatus` exists only to
 * give autocomplete on the values that currently have specific copy.
 */
export type KnownSubmissionStatus =
  | 'SUBMITTED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'FLAGGED';

export type SubmissionStatus = KnownSubmissionStatus | (string & {});

export interface ExistingSubmission {
  id: string;
  status: SubmissionStatus;
  submitted_at: string;
  /** Absent since the verification fields were removed; kept optional. */
  rejection_reason?: string;
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
  /**
   * Null when the file cannot currently be reached -- the backend signs each
   * read against Supabase Storage, and rows survive whose underlying file does
   * not (anything stored before the move off the ephemeral local disk). Render
   * these as a missing-photo placeholder, never by passing null to an Image.
   */
  url: string | null;
  /**
   * Stable storage path. Persist this when referring to the file later (it is
   * what `form_34a_photo` carries); `url` above is signed and expires.
   */
  key: string;
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

export interface LiveTallyCandidate {
  id: string;
  full_name: string;
  party: string;
  votes: number;
  percentage: number;
  /** True for the campaign's own candidate in this race. */
  is_my_candidate: boolean;
}

export interface LiveTally {
  race: { id: string; title: string; race_type: string };
  candidates: LiveTallyCandidate[];
  summary: {
    total_votes: number;
    total_valid_votes: number;
    total_rejected_votes: number;
    total_registered_voters: number;
    turnout_percentage: number;
    stations_reporting: number;
    total_stations: number;
    reporting_percentage: number;
  };
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
  /** Set when this message is a command-centre question (or reply) about a specific submission. */
  submission: string | null;
  read_at: string | null;
  created_at: string;
}

export interface SubmissionHistoryItem {
  id: string;
  race_title: string;
  polling_station_name: string;
  iebc_code: string;
  status: SubmissionStatus;
  submitted_at: string;
  total_registered_voters: number;
  total_valid_votes: number;
  total_rejected_votes: number;
  total_votes_cast: number;
  turnout: number;
  /** Null when the evidence photo cannot currently be reached. */
  photo_url: string | null;
  rejection_reason: string;
  questions: ChatMessage[];
}

export interface SubmissionHistoryResponse {
  count: number;
  results: SubmissionHistoryItem[];
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

// --------------------------------------------------------------------------- //
// Admin mode
// --------------------------------------------------------------------------- //

/**
 * The authenticated user, from /auth/me/. Only the fields admin mode needs;
 * `role` is a plain string, not a closed union, for the same reason as
 * SubmissionStatus: the backend's role vocabulary can grow and a deployed
 * phone must render it rather than crash.
 */
export interface UserMe {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
  role: string;
  is_super_admin: boolean;
}

export interface AdminEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  priority: string;
  starts_at: string;
  ends_at: string;
  contact1_name: string;
  contact1_phone: string;
  contact2_name: string;
  contact2_phone: string;
  conflict_acknowledged: boolean;
  created_by_name: string;
  created_at: string;
}

export interface AdminEventInput {
  title: string;
  description: string;
  location: string;
  category: string;
  priority: string;
  starts_at: string;
  ends_at: string;
  contact1_name: string;
  contact1_phone: string;
  contact2_name: string;
  contact2_phone: string;
  conflict_acknowledged: boolean;
}

export interface EventSaveResult {
  event: AdminEvent;
  conflicts: AdminEvent[];
}

export interface RaceListItem {
  id: string;
  race_type: string;
  race_type_display: string;
  title: string;
  scope_level: string;
  geography_name: string;
  candidate_count: number;
  is_active: boolean;
  election_name: string;
}

/** One county/constituency/ward row from the geography dropdowns. */
export interface GeoUnit {
  id: string;
  name: string;
  iebc_code: string;
}

export interface PollingCentreItem {
  id: string;
  name: string;
  iebc_code: string;
  ward_name?: string | null;
  station_count?: number | null;
  registered_voters?: number | null;
}

export interface Person {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  polling_centre: string | null;
  polling_centre_name: string | null;
  polling_centre_code: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PeopleStats {
  total: number;
  assigned: number;
  unassigned: number;
}

export interface SpecialGroupItem {
  id: string;
  name: string;
  category: string;
  category_display: string;
  description: string;
  county_name?: string | null;
  constituency_name?: string | null;
  ward_name?: string | null;
  meeting_venue: string;
  is_active: boolean;
  member_count: number;
}

export interface GroupMemberItem {
  id: string;
  group: string;
  group_name: string;
  full_name: string;
  phone_number: string;
  email: string;
  rank: string;
  /** Server-computed: known office bearers are < 100, plain members 110. */
  rank_weight: number;
  polling_centre: string | null;
  polling_centre_name: string | null;
  polling_centre_code: string | null;
  notes: string;
}

export interface StructureItem {
  id: string;
  name: string;
  code: string;
  stations: number;
  centres: number;
  registered_voters: number;
  people: number;
}

export interface StructureResponse {
  level: string;
  dataset_version?: string;
  classification?: string;
  items: StructureItem[];
}

/** One row of the agents directory. `location` is the backend's display
 * string -- station, ward or constituency depending on the agent's level --
 * which is exactly what the directory searches over. */
export interface AgentListItem {
  id: string;
  full_name: string;
  phone_number: string;
  level: string;
  location: string | null;
  status: string;
  supervisor_name: string | null;
  user_email: string;
  created_at: string;
}

/** One agent thread in the command-centre inbox. */
export interface InboxConversation {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_phone: string;
  polling_station: string | null;
  last_message_at: string | null;
  last_message_preview: string;
  unread: number;
}

export interface ThreadResponse {
  agent_name: string;
  count: number;
  results: ChatMessage[];
}
