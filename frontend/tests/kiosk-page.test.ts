import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildKioskPages, KIOSK_PAGE_SIZE, KIOSK_ROTATION_INTERVAL_MS } from '../src/kiosk.ts';
import type { EventTypeSummary } from '../src/types.ts';

const appUrl = new URL('../src/App.tsx', import.meta.url);
const layoutUrl = new URL('../src/components/Layout.tsx', import.meta.url);
const pageUrl = new URL('../src/pages/KioskPage.tsx', import.meta.url);
const panelUrl = new URL('../src/components/KioskEventTypePanel.tsx', import.meta.url);
const stylesUrl = new URL('../src/styles.css', import.meta.url);

function eventType(index: number): EventTypeSummary {
  return {
    id: String(index),
    key: `type_${index}`,
    name: `Type ${index}`,
    description: null,
    unitType: null,
    baseUnit: null,
    defaultUnit: null,
    unit: null,
    icon: null,
    color: null,
    isActive: true,
    archivedAt: null,
    totalEvents: 0,
    pointEvents: 0,
    durationEvents: 0,
    numericEvents: 0,
    ongoingEvents: 0,
    latestStartedAt: null,
    latestEndedAt: null,
    recentEvents: [],
    createdAt: '',
    updatedAt: ''
  };
}

test('kiosk groups active event types into pages of six and rotates every ten seconds', (): void => {
  const pages = buildKioskPages(Array.from({ length: 14 }, (_, index: number) => eventType(index)));

  assert.equal(KIOSK_PAGE_SIZE, 6);
  assert.equal(KIOSK_ROTATION_INTERVAL_MS, 10_000);
  assert.deepEqual(pages.map((page: EventTypeSummary[]) => page.length), [6, 6, 2]);
});

test('kiosk is routed and available from the shared navigation', async (): Promise<void> => {
  const [app, layout] = await Promise.all([readFile(appUrl, 'utf8'), readFile(layoutUrl, 'utf8')]);

  assert.match(app, /path="\/kiosk" element=\{<KioskPage \/>\}/);
  assert.match(layout, /to: '\/kiosk', label: 'Kiosk'/);
  assert.match(layout, /location\.pathname === '\/kiosk'/);
  assert.match(layout, /isKiosk && 'page-kiosk'/);
});

test('kiosk requests only the newest event and automatically advances pages', async (): Promise<void> => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /api\.listEventTypes\(1, false\)/);
  assert.match(page, /window\.setInterval/);
  assert.match(page, /KIOSK_ROTATION_INTERVAL_MS/);
  assert.match(page, /translate3d\(-\$\{pageIndex \* 100\}%/);
  assert.doesNotMatch(page, /page-heading/);
});

test('kiosk panels show only the newest event details with display units', async (): Promise<void> => {
  const panel = await readFile(panelUrl, 'utf8');

  assert.match(panel, /eventType\.recentEvents\?\.\[0\]/);
  assert.match(panel, /event\.displayValue !== null && event\.defaultUnit/);
  assert.match(panel, /formatMeasuredValue\(event\.displayValue, event\.defaultUnit\)/);
  assert.match(panel, /formatTimeSinceStart\(latestEvent\.startedAt, nowMs\)/);
  assert.match(panel, /className="kiosk-time-row"/);
  assert.match(panel, /formatTimeSinceFinish\(latestEvent\.endedAt, nowMs\)/);
  assert.match(panel, /className="kiosk-note" title=\{latestEvent\.note\}/);
  assert.doesNotMatch(panel, /formatDuration/);
  assert.doesNotMatch(panel, /getDisplayDurationSeconds/);
  assert.doesNotMatch(panel, />Duration</);
  assert.doesNotMatch(panel, /totalEvents/);
  assert.doesNotMatch(panel, /EventList/);
});

test('kiosk layout reserves six viewport-filling slots and adapts to fewer panels', async (): Promise<void> => {
  const styles = await readFile(stylesUrl, 'utf8');

  assert.match(styles, /\.kiosk-grid \{[^}]*grid-template-columns: repeat\(3/);
  assert.match(styles, /grid-template-rows: repeat\(2/);
  assert.match(styles, /\.kiosk-grid-count-1/);
  assert.match(styles, /\.kiosk-grid-count-4/);
  assert.match(styles, /@media \(orientation: portrait\)/);
  assert.match(styles, /\.kiosk-panel-header h2 \{ font-size: clamp/);
  assert.match(styles, /\.kiosk-value \{ font-size: clamp/);
  assert.match(styles, /\.kiosk-time-rows/);
  assert.match(styles, /\.kiosk-time-row strong \{ font-size: clamp/);
  assert.match(styles, /\.kiosk-note \{[^}]*@apply min-w-0 truncate/);
  assert.doesNotMatch(styles, /-webkit-line-clamp/);
  assert.doesNotMatch(styles, /\.kiosk-details/);
});
