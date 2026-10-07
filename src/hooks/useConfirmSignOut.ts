/**
 * One sign-out confirmation for every screen that offers it.
 *
 * Signing out does not delete what is waiting to be sent, but nothing is sent
 * while signed out, and a result, panic alert or message the agent believes is
 * "done" would sit on the phone unseen by the command centre. So when anything
 * is unsent the dialog says exactly what, and makes staying signed in the
 * default choice.
 */

import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '../store/auth';
import { useOutbox } from './useOutbox';
import { useSubmissionQueue } from './useSubmissionQueue';

interface Options {
  title: string;
  cancelText: string;
  confirmText: string;
  /** Runs when the user confirms, just before sign-out begins. */
  onStart?: () => void;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function useConfirmSignOut({ title, cancelText, confirmText, onStart }: Options) {
  const { signOut } = useAuth();
  const queue = useSubmissionQueue();
  const { entries } = useOutbox();

  return useCallback(() => {
    const unsent: string[] = [];
    if (queue.kind === 'pending') unsent.push('a result submission that has not reached the server');
    if (queue.kind === 'rejected') unsent.push('a result submission the server rejected');

    const alerts = entries.filter((e) => e.tag === 'emergency').length;
    const chats = entries.length - alerts;
    if (alerts > 0) unsent.push(plural(alerts, 'emergency alert') + ' not yet sent');
    if (chats > 0) unsent.push(plural(chats, 'message') + ' not yet sent');

    const message = unsent.length
      ? `You still have ${unsent.join(' and ')}. ` +
        'Nothing is sent while you are signed out, and if someone else signs in on this phone it is discarded. ' +
        'Stay signed in with a signal until it is delivered.'
      : 'You will need your email and password to sign in again.';

    Alert.alert(unsent.length ? 'Unsent items' : title, message, [
      { text: unsent.length ? 'Stay signed in' : cancelText, style: 'cancel' },
      {
        text: unsent.length ? 'Sign out anyway' : confirmText,
        style: 'destructive',
        onPress: () => {
          onStart?.();
          void signOut();
        },
      },
    ]);
  }, [queue, entries, signOut, title, cancelText, confirmText, onStart]);
}
