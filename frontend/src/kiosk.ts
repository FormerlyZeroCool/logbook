import type { EventTypeSummary } from './types';

export const KIOSK_PAGE_SIZE = 6;
export const KIOSK_ROTATION_INTERVAL_MS = 10_000;

export function buildKioskPages(eventTypes: readonly EventTypeSummary[]): EventTypeSummary[][] {
  const pages: EventTypeSummary[][] = [];
  for (let index = 0; index < eventTypes.length; index += KIOSK_PAGE_SIZE) {
    pages.push(eventTypes.slice(index, index + KIOSK_PAGE_SIZE));
  }
  return pages;
}
