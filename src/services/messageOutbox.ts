/**
 * Persistent outbox for text messages: chat and emergency alerts.
 *
 * The submission queue's promise -- nothing you do on this phone can be lost
 * -- extended to the other things an agent sends. Before this, a chat
 * message or a panic alert composed with no signal was retried only in
 * memory; killing the app killed the message, silently, which for an
 * emergency is the cruellest possible failure.
 *
 * Every text send now lands here first (a list, unlike the submission
 * queue's single record, because several messages can stack up in a dead
 * zone), is written to storage, and is delivered in order whenever the
 * network allows. The client_uuid each entry carries makes redelivery safe:
 * the server deduplicates, so a retry after a lost response cannot double a
 * message.
 *
 * Scope: TEXT only. Voice notes and images have a file upload step whose
 * cache-lifetime problems the submission queue already solves for the one
 * attachment that is evidence; media chat is not worth that machinery.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

import { ApiError } from '../api/client';
import * as api from '../api/endpoints';
import { reportError } from './monitoring';
import { currentOwner, isForeign } from './queueOwner';

const STORE_KEY = 'sentinel.messageOutbox.v1';
const RETRY_INTERVAL_MS = 20_000;

export interface OutboxEntry {
  clientUuid: string;
  body: string;
  /** Emergency entries jump the queue and get reported if they fail. */
  tag: 'chat' | 'emergency';
  /** Where the agent was when they pressed the button, if known. */
  latitude?: number;
  longitude?: number;
  queuedAt: string;
  lastError: string | null;
  /** Who composed it; see queueOwner.ts. Absent on entries from older builds. */
  owner?: string | null;
}

export type OutboxEvent =
  | { type: 'sent'; entry: OutboxEntry }
  | { type: 'dropped'; entry: OutboxEntry; reason: string };

// ── State + subscriptions ────────────────────────────────────────────────── //

let entries: OutboxEntry[] = [];
let loaded = false;
let sending = false;

type Listener = () => void;
const listeners = new Set<Listener>();
const eventListeners = new Set<(event: OutboxEvent) => void>();

/** Stable snapshot for useSyncExternalStore. */
let snapshot: { entries: OutboxEntry[]; sending: boolean } = {
  entries: [],
  sending: false,
};

function notify(): void {
  snapshot = { entries: [...entries], sending };
  listeners.forEach((fn) => fn());
}

export function getOutboxState(): { entries: OutboxEntry[]; sending: boolean } {
  return snapshot;
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onOutboxEvent(listener: (event: OutboxEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

function emit(event: OutboxEvent): void {
  eventListeners.forEach((fn) => fn(event));
}

// ── Persistence ──────────────────────────────────────────────────────────── //

async function save(): Promise<void> {
  try {
    if (entries.length) {
      await AsyncStorage.setItem(STORE_KEY, JSON.stringify(entries));
    } else {
      await AsyncStorage.removeItem(STORE_KEY);
    }
  } catch {
    // The in-memory copy still drives this session.
  }
}

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) {
      entries = JSON.parse(raw) as OutboxEntry[];
      notify();
    }
  } catch {
    entries = [];
  }
  await dropForeignEntries();
}

/**
 * Discard entries composed by a different agent than the one now signed in.
 * An emergency alert sent under the wrong identity is worse than none.
 */
async function dropForeignEntries(): Promise<void> {
  if (!entries.length) return;
  const owner = await currentOwner();
  const kept = entries.filter((e) => !isForeign(e.owner, owner));
  if (kept.length === entries.length) return;
  reportError(new Error('Discarded queued messages from another agent'), {
    source: 'message_outbox_foreign',
    dropped: String(entries.length - kept.length),
  });
  entries = kept;
  await save();
  notify();
}

// ── API ──────────────────────────────────────────────────────────────────── //

function newUuid(): string {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Persist a message and immediately try to deliver it. Returns the entry's
 * client_uuid so callers can track it through onOutboxEvent.
 */
export async function enqueueMessage(input: {
  body: string;
  tag: OutboxEntry['tag'];
  clientUuid?: string;
  latitude?: number;
  longitude?: number;
}): Promise<string> {
  await load();

  const entry: OutboxEntry = {
    clientUuid: input.clientUuid ?? newUuid(),
    body: input.body,
    tag: input.tag,
    latitude: input.latitude,
    longitude: input.longitude,
    queuedAt: new Date().toISOString(),
    lastError: null,
    owner: await currentOwner(),
  };

  // An emergency must not wait behind small talk.
  if (entry.tag === 'emergency') {
    entries = [entry, ...entries];
  } else {
    entries = [...entries, entry];
  }
  await save();
  notify();

  void flushOutbox();
  return entry.clientUuid;
}

function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isNetworkError || error.status >= 500;
  }
  return true;
}

let flushInFlight: Promise<void> | null = null;

/** Deliver everything deliverable, oldest first, single-flight. */
export function flushOutbox(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlush().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function doFlush(): Promise<void> {
  await load();
  await dropForeignEntries();
  if (!entries.length) return;

  sending = true;
  notify();

  while (entries.length) {
    const entry = entries[0];
    try {
      await api.sendMessage({
        kind: 'TEXT',
        body: entry.body,
        client_uuid: entry.clientUuid,
        // Entries persisted by older builds carry no flag, but the tag still
        // says what they are.
        ...(entry.tag === 'emergency'
          ? { emergency: true, latitude: entry.latitude, longitude: entry.longitude }
          : {}),
      });
      entries = entries.slice(1);
      await save();
      notify();
      emit({ type: 'sent', entry });
    } catch (error) {
      if (isTransient(error)) {
        // Signal problem: stop, keep order, let the watcher try again.
        entry.lastError =
          error instanceof ApiError ? error.message : 'Could not reach the server.';
        await save();
        break;
      }
      // The server understood and refused. Retrying an identical request
      // cannot help, and one poisoned entry must not block the rest.
      const reason =
        error instanceof ApiError ? error.message : 'The server refused this message.';
      entries = entries.slice(1);
      await save();
      notify();
      emit({ type: 'dropped', entry, reason });
      reportError(error, { source: 'message_outbox', tag: entry.tag });
    }
  }

  sending = false;
  notify();
}

// ── Automatic retry ──────────────────────────────────────────────────────── //

let watcherStarted = false;

export function startOutboxWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;

  void load().then(() => {
    if (entries.length) void flushOutbox();
  });

  setInterval(() => {
    if (entries.length && !sending) void flushOutbox();
  }, RETRY_INTERVAL_MS);

  try {
    Network.addNetworkStateListener((state) => {
      if (state.isConnected && entries.length && !sending) void flushOutbox();
    });
  } catch {
    // Older runtime without the listener: the interval alone still delivers.
  }
}
