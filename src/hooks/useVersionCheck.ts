/**
 * Am-I-outdated check.
 *
 * On election day the fleet must be on one build. The backend advertises the
 * latest shipped version (set by ops as environment variables, no deploy
 * needed); this hook compares it with the version compiled into this binary
 * and reports one of three verdicts:
 *
 *   current  -- nothing to say, and nothing is shown
 *   behind   -- a newer build exists; nudge, but do not nag
 *   too_old  -- below the minimum the campaign will support; warn loudly
 *
 * Checked once an hour, quietly. A version check must never get in the way
 * of the work -- if the endpoint is unreachable the verdict is 'current',
 * because "maybe outdated" is not actionable and a false warning teaches
 * agents to ignore the real one.
 */

import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';

import * as api from '../api/endpoints';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type VersionVerdict = 'current' | 'behind' | 'too_old';

/** "1.2.10" vs "1.3.0" → negative when a is older. Missing parts are 0. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function useVersionCheck(): {
  verdict: VersionVerdict;
  latestVersion: string | null;
  downloadUrl: string | null;
} {
  const installed = Constants.expoConfig?.version ?? '0.0.0';

  const { data } = useQuery({
    queryKey: ['appVersion'],
    queryFn: api.fetchAppVersion,
    staleTime: CHECK_INTERVAL_MS,
    refetchInterval: CHECK_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });

  if (!data) return { verdict: 'current', latestVersion: null, downloadUrl: null };

  const { min_version, latest_version, download_url } = data.android;
  const verdict: VersionVerdict =
    compareVersions(installed, min_version) < 0
      ? 'too_old'
      : compareVersions(installed, latest_version) < 0
        ? 'behind'
        : 'current';

  return {
    verdict,
    latestVersion: latest_version,
    downloadUrl: download_url || null,
  };
}
