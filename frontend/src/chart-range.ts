const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const chartRangePresets = [
  { key: '24h', label: '24h', milliseconds: DAY_MS },
  { key: '2d', label: '2d', milliseconds: 2 * DAY_MS },
  { key: '3d', label: '3d', milliseconds: 3 * DAY_MS },
  { key: '7d', label: '7d', milliseconds: 7 * DAY_MS },
  { key: '14d', label: '2w', milliseconds: 14 * DAY_MS },
  { key: '30d', label: '30d', milliseconds: 30 * DAY_MS },
  { key: '90d', label: '90d', milliseconds: 90 * DAY_MS }
] as const;

export type ChartRangePresetKey = typeof chartRangePresets[number]['key'];

export type ChartTimeWindow = {
  fromMs: number;
  toMs: number;
  bucket: string;
};

export function getDefaultSeriesBucket(fromMs: number, toMs: number): string {
  const durationMs = Math.max(0, toMs - fromMs);
  if (durationMs <= 2 * DAY_MS) return '15 minutes';
  if (durationMs <= 14 * DAY_MS) return '1 hour';
  if (durationMs <= 45 * DAY_MS) return '6 hours';
  return '1 day';
}

export function buildPresetTimeWindow(key: ChartRangePresetKey, nowMs: number = Date.now()): ChartTimeWindow {
  const preset = chartRangePresets.find((item: typeof chartRangePresets[number]) => item.key === key);
  if (!preset) throw new Error(`Unknown chart range preset: ${key}`);
  const fromMs = nowMs - preset.milliseconds;
  return { fromMs, toMs: nowMs, bucket: getDefaultSeriesBucket(fromMs, nowMs) };
}

export function buildCustomTimeWindow(fromMs: number, toMs: number): ChartTimeWindow | null {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return null;
  return { fromMs, toMs, bucket: getDefaultSeriesBucket(fromMs, toMs) };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateTimeLocal(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
