/**
 * Emergency alert.
 *
 * When an agent holds the panic button, one message must reach the command
 * centre: who needs help, and where they are. Everything here is built
 * around the situation being bad -- the agent may have seconds, the signal
 * may be poor, and a spinner they have to babysit is worthless.
 *
 * So the alert is fire-and-hard-to-kill: it sends through the existing chat
 * (which the command centre already watches, with an unread badge and a
 * dashboard) rather than a new channel nobody is looking at, it does not
 * wait for a GPS fix if a recent position is already known, and it retries
 * by itself for several minutes before giving up. The button reflects the
 * state but never asks the agent to do anything twice.
 */

import * as Location from 'expo-location';

import { ApiError } from '../api/client';
import * as api from '../api/endpoints';

const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 15_000;

export type EmergencyStatus = 'idle' | 'sending' | 'sent' | 'failed';

type Listener = (status: EmergencyStatus) => void;
const listeners = new Set<Listener>();
let status: EmergencyStatus = 'idle';

export function getEmergencyStatus(): EmergencyStatus {
  return status;
}

export function subscribeEmergency(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setStatus(next: EmergencyStatus): void {
  status = next;
  listeners.forEach((fn) => fn(next));
}

function newUuid(): string {
  // RFC4122 v4 -- the server validates client_uuid as a real UUID and
  // rejects anything else with a 400. Same generator as chat.tsx.
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Best position available *right now*. A last-known fix from a few minutes
 * ago beats waiting thirty seconds for a fresh one -- the message must go
 * out. A fresh read is attempted only briefly, then abandoned.
 */
async function getPositionFast(): Promise<{ lat: number; lng: number } | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({
      maxAge: 10 * 60 * 1000,
    });
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
  } catch {
    // fall through to a fresh read
  }
  try {
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (fresh) return { lat: fresh.coords.latitude, lng: fresh.coords.longitude };
  } catch {
    // no position; the alert still goes out
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send the alert. Resolves as soon as the outcome is known ('sent') or the
 * first attempt fails and background retries begin -- the caller should show
 * the returned status but never block on it.
 */
export async function sendEmergencyAlert(station: {
  displayName: string | null;
  iebcCode: string | null;
}): Promise<void> {
  if (status === 'sending') return;
  setStatus('sending');

  const position = await getPositionFast();

  const where = station.displayName
    ? `${station.displayName}${station.iebcCode ? ` (IEBC ${station.iebcCode})` : ''}`
    : 'station unknown';
  const mapLink = position
    ? `https://maps.google.com/?q=${position.lat.toFixed(6)},${position.lng.toFixed(6)}`
    : 'location unavailable';

  const body =
    `🚨 EMERGENCY — I need help.\n` +
    `Station: ${where}\n` +
    `My location: ${mapLink}`;

  // The location ping is a separate best-effort channel; the chat message is
  // the one that must land.
  if (position) {
    api.updateMyLocation(position.lat, position.lng).catch(() => undefined);
  }

  const clientUuid = newUuid();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await api.sendMessage({ kind: 'TEXT', body, client_uuid: clientUuid });
      setStatus('sent');
      return;
    } catch (error) {
      // A duplicate means an earlier attempt landed and the response was
      // lost. The command centre has the alert.
      if (
        error instanceof ApiError &&
        !error.isNetworkError &&
        error.status < 500
      ) {
        // The server understood and refused (or already has it). Retrying an
        // identical request cannot help; surface what we know.
        setStatus(error.message.toLowerCase().includes('exist') ? 'sent' : 'failed');
        return;
      }
      if (attempt < MAX_ATTEMPTS) await delay(RETRY_DELAY_MS);
    }
  }

  setStatus('failed');
}

/** Return the button to its resting state after a sent/failed banner. */
export function resetEmergencyStatus(): void {
  if (status !== 'sending') setStatus('idle');
}
