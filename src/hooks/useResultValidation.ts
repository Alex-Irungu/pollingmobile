/**
 * Live arithmetic checks on the result form.
 *
 * These duplicate the server's rules on purpose. The point is not to replace
 * server validation -- the server always re-checks, and it is the authority --
 * but to surface a problem WHILE THE AGENT IS STILL HOLDING THE FORM.
 *
 * That timing is the whole value. The same error caught by a verifier two
 * hours later means a correction request to an agent who has gone home, and a
 * result that sits unusable in the meantime. Caught here, it costs the agent
 * five seconds and a second look at the paper.
 *
 * Errors block submission. Warnings do not: an unusual turnout is not proof of
 * anything, and an app that refused to send a real-but-surprising result would
 * be suppressing exactly the evidence the platform exists to capture.
 */

import { useMemo } from 'react';

import type { BallotCandidate } from '../api/types';

export interface ValidationIssue {
  /** `error` blocks submission; `warning` is advisory. */
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  canSubmit: boolean;
  candidateTotal: number;
  turnoutPercent: number | null;
}

interface Input {
  candidates: BallotCandidate[];
  votes: Record<string, string>;
  validVotes: string;
  rejectedVotes: string;
  registeredVoters: number | null;
  hasPhoto: boolean;
}

const toInt = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function useResultValidation({
  candidates,
  votes,
  validVotes,
  rejectedVotes,
  registeredVoters,
  hasPhoto,
}: Input): ValidationResult {
  return useMemo(() => {
    const issues: ValidationIssue[] = [];

    const candidateTotal = candidates.reduce(
      (sum, candidate) => sum + toInt(votes[candidate.id] ?? ''),
      0,
    );
    const valid = toInt(validVotes);
    const rejected = toInt(rejectedVotes);
    const cast = valid + rejected;

    const allCandidatesEntered = candidates.every(
      (candidate) => (votes[candidate.id] ?? '').length > 0,
    );

    // --- Errors: these must be resolved before sending. ------------------- //

    if (!allCandidatesEntered) {
      issues.push({
        severity: 'error',
        message:
          'Enter a figure for every candidate. Put 0 where a candidate got no votes -- leaving it blank is not the same thing.',
      });
    }

    if (validVotes.length === 0) {
      issues.push({
        severity: 'error',
        message: 'Enter the total valid votes cast, as printed on the form.',
      });
    } else if (allCandidatesEntered && candidateTotal !== valid) {
      const difference = Math.abs(candidateTotal - valid);
      issues.push({
        severity: 'error',
        message:
          `Candidate votes add up to ${candidateTotal.toLocaleString('en-KE')}, but you entered ` +
          `${valid.toLocaleString('en-KE')} valid votes -- a difference of ${difference.toLocaleString('en-KE')}. ` +
          'Check the form again.',
      });
    }

    if (!hasPhoto) {
      issues.push({
        severity: 'error',
        message:
          'Attach a photo of the declaration form. The figures alone cannot be verified.',
      });
    }

    if (registeredVoters !== null && cast > registeredVoters) {
      // Physically impossible, so it is an error rather than a warning: more
      // ballots than registered voters means a transcription mistake, or
      // something that needs raising with the command centre directly.
      issues.push({
        severity: 'error',
        message:
          `Total votes cast (${cast.toLocaleString('en-KE')}) is more than the ` +
          `${registeredVoters.toLocaleString('en-KE')} voters registered at this stream. ` +
          'Re-check the figures, and report it in Messages if the form really says this.',
      });
    }

    // --- Warnings: unusual, but submit anyway. ---------------------------- //

    const turnoutPercent =
      registeredVoters && registeredVoters > 0 ? (cast / registeredVoters) * 100 : null;

    if (turnoutPercent !== null && cast > 0) {
      if (turnoutPercent > 95) {
        issues.push({
          severity: 'warning',
          message:
            `Turnout works out at ${turnoutPercent.toFixed(1)}%, which is unusually high. ` +
            'Worth a second look before you send.',
        });
      } else if (turnoutPercent < 20) {
        issues.push({
          severity: 'warning',
          message:
            `Turnout works out at ${turnoutPercent.toFixed(1)}%, which is unusually low. ` +
            'Check you have read the right line on the form.',
        });
      }
    }

    if (valid > 0 && rejected > valid * 0.15) {
      issues.push({
        severity: 'warning',
        message:
          'Rejected ballots are more than 15% of valid votes, which is high. ' +
          'Check you have not swapped the two figures.',
      });
    }

    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');

    return {
      issues,
      errors,
      warnings,
      canSubmit: errors.length === 0,
      candidateTotal,
      turnoutPercent,
    };
  }, [candidates, votes, validVotes, rejectedVotes, registeredVoters, hasPhoto]);
}
