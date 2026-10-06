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
 * wait for a GPS fix if a recent position is already known, and it goes
 * through the persistent outbox -- written to storage before the first
 * network attempt, retried for as long as it takes, surviving an app kill.
 * The button reflects the state but never asks the agent to do anything
 * twice.
 */

import * as Location from 'expo-location';

import * as api from '../api/endpoints';
import { enqueueMessage, onOutboxEvent } from './messageOutbox';

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

/**
 * Send the alert. The message is on disk before this resolves; delivery is
 * the outbox's job and can outlive this call, this screen, and this process.
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

  const clientUuid = await enqueueMessage({
    body,
    tag: 'emergency',
    latitude: position?.lat,
    longitude: position?.lng,
  });

  // Track this entry until it leaves the outbox, one way or the other.
  const unsubscribe = onOutboxEvent((event) => {
    if (event.entry.clientUuid !== clientUuid) return;
    unsubscribe();
    setStatus(event.type === 'sent' ? 'sent' : 'failed');
  });
}

/** Return the button to its resting state after a sent/failed banner. */
export function resetEmergencyStatus(): void {
  if (status !== 'sending') setStatus('idle');
}
