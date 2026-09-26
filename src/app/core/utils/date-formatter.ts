/** Formatting helpers shared by the backlog, sprint and activity surfaces. */

/** Renders an ISO-8601 date as `12 Jan 2026`, or an em dash when absent. */
export function formatDate(isoDate: string | null | undefined): string {
  if (isoDate === null || isoDate === undefined || isoDate.trim().length === 0) {
    return '—';
  }

  const parsed = new Date(isoDate);

  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

/** Renders an inclusive day count between two ISO dates, or `null` if unknown. */
export function daysBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  if (
    startIso === null ||
    startIso === undefined ||
    endIso === null ||
    endIso === undefined
  ) {
    return null;
  }

  const start = Date.parse(startIso);
  const end = Date.parse(endIso);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }

  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Formats a past timestamp as a short relative phrase such as `3h ago`.
 *
 * Future timestamps are handled too, so a sprint end date that is still ahead
 * reads naturally instead of falling through to a negative duration.
 */
export function formatRelativeTime(
  isoTimestamp: string | null | undefined,
  now: number = Date.now(),
): string {
  if (isoTimestamp === null || isoTimestamp === undefined || isoTimestamp.trim().length === 0) {
    return '—';
  }

  const then = Date.parse(isoTimestamp);

  if (Number.isNaN(then)) {
    return '—';
  }

  const deltaSeconds = Math.round((then - now) / 1000);
  const magnitude = Math.abs(deltaSeconds);
  const suffix = deltaSeconds < 0 ? ' ago' : ' from now';

  if (magnitude < 45) {
    return 'just now';
  }

  const minutes = Math.round(magnitude / 60);

  if (minutes < 60) {
    return `${minutes}m${suffix}`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h${suffix}`;
  }

  const days = Math.round(hours / 24);

  if (days < 7) {
    return `${days}d${suffix}`;
  }

  const weeks = Math.round(days / 7);

  if (weeks < 5) {
    return `${weeks}w${suffix}`;
  }

  const months = Math.round(days / 30);

  if (months < 12) {
    return `${months}mo${suffix}`;
  }

  return `${Math.round(days / 365)}y${suffix}`;
}
