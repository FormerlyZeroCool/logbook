import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('event write contract', () => {
  it('exposes only log, start, and end POST operations for events', async () => {
    const source = await readFile(path.join(root, 'src/routes/events.ts'), 'utf8');
    expect(source).toContain("app.post('/events/log'");
    expect(source).toContain("app.post('/events/start'");
    expect(source).toContain("app.post('/events/end'");
    expect(source).not.toContain("app.post('/events',");
    expect(source).not.toContain('/events/end-latest');
    expect(source).not.toContain('/events/:id/end');
  });

  it('does not expose event mode on event-type requests', async () => {
    const validation = await readFile(path.join(root, 'src/validation.ts'), 'utf8');
    const schema = await readFile(path.join(root, 'migrations/001_init.sql'), 'utf8');
    expect(validation).not.toContain('eventMode:');
    expect(schema).not.toContain('event_mode');
    expect(schema).toContain('event_kind TEXT NOT NULL');
  });

  it('keeps OpenAPI and Home Assistant on the same three-operation contract', async () => {
    const openapi = await readFile(path.join(root, 'openapi.yaml'), 'utf8');
    const restCommands = await readFile(path.join(root, 'home-assistant/rest_commands.yaml'), 'utf8');
    expect(openapi).toContain('/events/log:');
    expect(openapi).toContain('/events/start:');
    expect(openapi).toContain('/events/end:');
    expect(openapi).toContain('Optional original input value to store while ending');
    expect(openapi).not.toContain('/events/end-latest:');
    expect(openapi).not.toContain('Generic event creation');
    expect(restCommands).toContain('/api/v1/events/end');
    expect(restCommands).not.toContain('/api/v1/events/end-latest');
    expect(restCommands).not.toContain('"eventMode"');
  });
});
