/**
 * Offline submission queue.
 *
 * The worst hour of election night is the one where every agent in the
 * country submits at once, over the same congested cell towers, to a backend
 * that may be cold. Before this queue, the Submit button's success depended
 * on all of that cooperating in the next two minutes; if it did not, the
 * agent got an error and the responsibility to remember to try again.
 *
 * The queue inverts that. Tapping Send now saves everything -- figures and
 * the photographed form -- to this phone first, permanently, and only then
 * tries the network. From that moment the agent's job is done: the app
 * retries by itself whenever connectivity returns, and My Station shows the
 * truth of where the submission stands. The failure mode changes from "a
 * completed count that never reached the campaign" to "a delay".
 *
 * One record, not a list: an agent has one station and one race, and the
 * server accepts one submission per posting. The photo is copied out of the
 * cache directory (which Android may clear at any time) into the app's
 * document directory, and deleted again once the server has it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';

import { ApiError } from '../api/client';
import * as api from '../api/endpoints';
import type { SubmitResultPayload } from '../api/types';

const RECORD_KEY = 'sentinel.submissionQueue.v1';
const PHOTO_DIR = 'queued-submission';

/** How often to retry while a record is waiting. Frequent enough that a
 * short window of signal is not missed, cheap enough to run all night. */
const RETRY_INTERVAL_MS = 45_000;

export interface QueuedRecord {
  /** Photo location on this phone (document directory, survives restarts). */
  photoUri: string;
  photoName: string;
  /** Set once the photo has reached the server, so a retry after a failed
   * figures-send does not transfer the image a second time. */
  attachmentKey: string | null;
  payload: Omit<SubmitResultPayload, 'form_34a_photo'>;
  queuedAt: string;
  /** Human-readable reason the last attempt failed, transient or not. */
  lastError: string | null;
  /** True when the server looked at the submission and said no. The queue
   * stops retrying -- resending the same figures cannot change the answer. */
  rejected: boolean;
}

export type QueueState =
  | { kind: 'idle' }
  | { kind: 'pending'; record: QueuedRecord; sending: boolean }
  | { kind: 'rejected'; record: QueuedRecord };

export type FlushOutcome = 'sent' | 'waiting' | 'rejected' | 'nothing';

// ── State + subscriptions ────────────────────────────────────────────────── //

let record: QueuedRecord | null = null;
let sending = false;
let loaded = false;

type Listener = () => void;
const listeners = new Set<Listener>();
/** Fired once each time a queued submission reaches the server. */
const sentListeners = new Set<Listener>();

let cachedState: QueueState = { kind: 'idle' };

function recomputeState(): void {
  cachedState = !record
    ? { kind: 'idle' }
    : record.rejected
      ? { kind: 'rejected', record }
      : { kind: 'pending', record, sending };
}

function notify(): void {
  recomputeState();
  listeners.forEach((fn) => fn());
}

export function getQueueState(): QueueState {
  return cachedState;
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onQueueSent(listener: Listener): () => void {
  sentListeners.add(listener);
  return () => sentListeners.delete(listener);
}

// ── Persistence ──────────────────────────────────────────────────────────── //

async function saveRecord(): Promise<void> {
  try {
    if (record) {
      await AsyncStorage.setItem(RECORD_KEY, JSON.stringify(record));
    } else {
      await AsyncStorage.removeItem(RECORD_KEY);
    }
  } catch {
    // The in-memory copy still drives this session; worst case a process
    // death loses the queue, which is no worse than life before the queue.
  }
}

async function loadRecord(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(RECORD_KEY);
    if (raw) record = JSON.parse(raw) as QueuedRecord;
  } catch {
    record = null;
  }
  notify();
}

/**
 * Copy the photo out of the cache directory, which the OS owns and clears,
 * into the document directory, which survives until we delete it. Falls back
 * to the original URI rather than failing the queue -- a cache URI that
 * usually survives the night is better than refusing to save at all.
 */
function persistPhoto(uri: string, name: string): string {
  try {
    const dir = new Directory(Paths.document, PHOTO_DIR);
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, name);
    if (dest.exists) dest.delete();
    new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

function deletePersistedPhoto(): void {
  try {
    const dir = new Directory(Paths.document, PHOTO_DIR);
    if (dir.exists) dir.delete();
  } catch {
    // A stray photo in our own document directory is harmless.
  }
}

// ── Queueing ─────────────────────────────────────────────────────────────── //

/**
 * Save a submission locally. Never touches the network and never throws:
 * after this resolves, the result is safe on this phone regardless of what
 * happens next.
 */
export async function queueSubmission(input: {
  photoUri: string;
  photoName: string;
  payload: Omit<SubmitResultPayload, 'form_34a_photo'>;
}): Promise<void> {
  record = {
    photoUri: persistPhoto(input.photoUri, input.photoName),
    photoName: input.photoName,
    attachmentKey: null,
    payload: input.payload,
    queuedAt: new Date().toISOString(),
    lastError: null,
    rejected: false,
  };
  await saveRecord();
  notify();
}

/** Drop the queued record. Used after a server rejection, when the figures
 * must be corrected and re-entered rather than resent as they are. */
export async function discardQueued(): Promise<void> {
  record = null;
  deletePersistedPhoto();
  await saveRecord();
  notify();
}

// ── Sending ──────────────────────────────────────────────────────────────── //

/** True for failures worth retrying: offline, timeouts, server errors, and
 * auth hiccups the token refresh will heal. Only a 4xx that is not an auth
 * problem means the server understood the submission and refused it. */
function isTransient(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.isNetworkError) return true;
  if (error.status >= 500) return true;
  return error.status === 401 || error.status === 403;
}

let flushInFlight: Promise<FlushOutcome> | null = null;

/**
 * Try to send the queued submission now. Single-flight; safe to call from a
 * timer, a network-change event and a button in the same second.
 */
export function flushQueue(
  onProgress?: (message: string) => void,
): Promise<FlushOutcome> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlush(onProgress).finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function doFlush(
  onProgress?: (message: string) => void,
): Promise<FlushOutcome> {
  await loadRecord();
  const current = record;
  if (!current || current.rejected) return current ? 'rejected' : 'nothing';

  sending = true;
  notify();

  try {
    if (!current.attachmentKey) {
      onProgress?.('Uploading the form photo…');
      const attachment = await api.uploadFile({
        uri: current.photoUri,
        name: current.photoName,
        mimeType: 'image/jpeg',
        purpose: 'RESULT_FORM',
      });
      current.attachmentKey = attachment.key;
      await saveRecord();
    }

    onProgress?.('Sending the figures…');
    await api.submitResult({
      ...current.payload,
      form_34a_photo: current.attachmentKey,
    });

    record = null;
    deletePersistedPhoto();
    await saveRecord();
    sending = false;
    notify();
    sentListeners.forEach((fn) => fn());
    return 'sent';
  } catch (error) {
    // "Already submitted" means a previous attempt reached the server but its
    // answer never reached us. The submission exists; the queue is done.
    if (
      error instanceof ApiError &&
      !error.isNetworkError &&
      error.message.toLowerCase().includes('already')
    ) {
      record = null;
      deletePersistedPhoto();
      await saveRecord();
      sending = false;
      notify();
      sentListeners.forEach((fn) => fn());
      return 'sent';
    }

    sending = false;

    if (isTransient(error)) {
      current.lastError =
        error instanceof ApiError ? error.message : 'Could not reach the server.';
      await saveRecord();
      notify();
      return 'waiting';
    }

    current.rejected = true;
    current.lastError =
      error instanceof ApiError ? error.message : 'The server could not accept this result.';
    await saveRecord();
    notify();
    return 'rejected';
  }
}

// ── Automatic retry ──────────────────────────────────────────────────────── //

let watcherStarted = false;

/**
 * Start the background retry machinery: an interval, and a listener that
 * fires the moment the phone regains connectivity -- signal returning is
 * exactly the event the queue is waiting for. Idempotent; call it from the
 * signed-in layout's mount.
 */
export function startQueueWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;

  void loadRecord().then(() => {
    if (record && !record.rejected) void flushQueue();
  });

  setInterval(() => {
    if (record && !record.rejected && !sending) void flushQueue();
  }, RETRY_INTERVAL_MS);

  try {
    Network.addNetworkStateListener((state) => {
      if (state.isConnected && record && !record.rejected && !sending) {
        void flushQueue();
      }
    });
  } catch {
    // No network events on this platform: the interval alone still retries.
  }
}
