/**
 * Who a queued item belongs to.
 *
 * The submission queue and message outbox live in AsyncStorage, which survives
 * sign-out. Two agents can share one phone, and an item composed by the first
 * must never be delivered under the second's session: a panic alert would
 * carry the wrong person's identity, and a result would be filed as the wrong
 * agent's. Every item is stamped with its owner when it is created, and an
 * item whose owner is not the person now signed in is discarded rather than
 * sent.
 *
 * The owner is the remembered sign-in email. It only changes on a password
 * sign-in, which is the only way a different person can enter the app, and it
 * is readable offline without a network call.
 *
 * When either side is unknown (an item saved by an older build, or no
 * remembered email) nothing is discarded: failing to deliver a real emergency
 * is worse than the narrow case this guard exists for.
 */

import { getRememberedEmail } from '../api/tokens';

export async function currentOwner(): Promise<string | null> {
  return getRememberedEmail();
}

export function isForeign(
  itemOwner: string | null | undefined,
  signedInOwner: string | null,
): boolean {
  return !!itemOwner && !!signedInOwner && itemOwner !== signedInOwner;
}
