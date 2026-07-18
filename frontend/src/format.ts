export function formatDateTime(value: string | number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatCompactDateTime(value: string | number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function toDateTimeLocal(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

function formatElapsedParts(totalSeconds: number): string {
  if (totalSeconds < 60) return 'just now';

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ago`;

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m ago` : `${totalHours}h ago`;
  }

  const totalDays = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  if (totalDays < 30) {
    return remainingHours > 0 ? `${totalDays}d ${remainingHours}h ago` : `${totalDays}d ago`;
  }

  const totalMonths = Math.floor(totalDays / 30);
  const remainingDays = totalDays % 30;
  if (totalMonths < 12) {
    return remainingDays > 0 ? `${totalMonths}mo ${remainingDays}d ago` : `${totalMonths}mo ago`;
  }

  const totalYears = Math.floor(totalDays / 365);
  const remainingMonths = Math.floor((totalDays % 365) / 30);
  return remainingMonths > 0 ? `${totalYears}y ${remainingMonths}mo ago` : `${totalYears}y ago`;
}

function formatElapsedCompact(totalSeconds: number): string {
  if (totalSeconds < 60) return 'just now';

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remainingMinutes > 0 ? `${totalHours} hr ${remainingMinutes} min` : `${totalHours} hr`;
  }

  const totalDays = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  if (totalDays < 30) {
    return remainingHours > 0 ? `${totalDays} day ${remainingHours} hr` : `${totalDays} day`;
  }

  const totalMonths = Math.floor(totalDays / 30);
  const remainingDays = totalDays % 30;
  if (totalMonths < 12) {
    return remainingDays > 0 ? `${totalMonths} mo ${remainingDays} day` : `${totalMonths} mo`;
  }

  const totalYears = Math.floor(totalDays / 365);
  const remainingMonths = Math.floor((totalDays % 365) / 30);
  return remainingMonths > 0 ? `${totalYears} yr ${remainingMonths} mo` : `${totalYears} yr`;
}

export function formatTimeSinceCompact(
  timestamp: string | null,
  emptyLabel: string = '—',
  nowMs: number = Date.now()
): string {
  if (timestamp === null) return emptyLabel;

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return 'Unknown';

  return formatElapsedCompact(Math.max(0, Math.floor((nowMs - timestampMs) / 1000)));
}

function formatTimeSince(timestamp: string | null, emptyLabel: string, nowMs: number): string {
  if (timestamp === null) return emptyLabel;

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return 'Unknown';

  return formatElapsedParts(Math.max(0, Math.floor((nowMs - timestampMs) / 1000)));
}

export function formatTimeSinceStart(startedAt: string | null, nowMs: number = Date.now()): string {
  return formatTimeSince(startedAt, 'No events yet', nowMs);
}

export function formatTimeSinceFinish(endedAt: string | null, nowMs: number = Date.now()): string {
  return formatTimeSince(endedAt, 'No finished events yet', nowMs);
}
