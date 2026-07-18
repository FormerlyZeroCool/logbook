import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectory = path.resolve(process.cwd(), 'migrations');

describe('fresh database bootstrap', () => {
  it('contains the initialization and voice reliability migrations', async () => {
    const files = (await readdir(migrationDirectory))
      .filter((filename: string) => filename.endsWith('.sql'))
      .sort();

    expect(files).toEqual(['001_init.sql', '002_voice_reliability.sql']);
  });

  it('defines the final schema without legacy compatibility columns', async () => {
    const sql = await readFile(path.join(migrationDirectory, '001_init.sql'), 'utf8');
    const reliability = await readFile(path.join(migrationDirectory, '002_voice_reliability.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE unit_types');
    expect(sql).toContain('CREATE TABLE units');
    expect(sql).toContain('CREATE TABLE event_types');
    expect(sql).toContain('CREATE TABLE events');
    expect(sql).toContain("event_kind TEXT NOT NULL");
    expect(sql).toContain('ON events (event_type_id, started_at DESC, id DESC)');
    expect(sql).not.toContain('event_mode');
    expect(sql).toContain("('energy', 'Energy'");
    expect(sql).toContain("('power', 'Power'");
    expect(sql).toContain("('volume', 'tsp_us', 'US teaspoon'");
    expect(sql).toContain("('volume', 'tbsp_us', 'US tablespoon'");
    expect(sql).toContain('4.92892159375::numeric');
    expect(sql).toContain('14.78676478125::numeric');
    expect(sql).not.toContain('legacy_unit');
    expect(sql).not.toContain('normalize_event_value');
    expect(reliability).toContain('voice_aliases');
    expect(reliability).toContain('CREATE TABLE IF NOT EXISTS idempotency_requests');
  });
});
