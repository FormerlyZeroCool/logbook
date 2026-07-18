import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const homeAssistantDirectory = path.resolve(process.cwd(), 'home-assistant');

describe('Home Assistant latest-event voice tool', () => {
  it('calls the latest-event endpoint using the exact event type key', async () => {
    const commands = await readFile(path.join(homeAssistantDirectory, 'rest_commands.yaml'), 'utf8');

    expect(commands).toContain('logbook_get_latest_event:');
    expect(commands).toContain('/api/v1/event-types/{{ event_type_key }}/latest-event');
    expect(commands).toContain('method: GET');
    expect(commands).toContain('accept: application/json');
  });

  it('can optionally set a final value while finishing without clearing an omitted value', async () => {
    const commands = await readFile(path.join(homeAssistantDirectory, 'rest_commands.yaml'), 'utf8');
    const scripts = await readFile(path.join(homeAssistantDirectory, 'scripts.yaml'), 'utf8');

    expect(commands).toContain('logbook_end_event:');
    expect(commands).toContain("{% if value is defined and value is not none and is_number(value) %}");
    expect(commands).toContain('"value": value | float');
    expect(commands).toContain('"unitKey": unit_key if unit_key is defined');
    expect(commands).not.toContain('dict2items');
    expect(commands).not.toContain('items2dict');
    expect(scripts).toContain('name: Final value');
    expect(scripts).toContain('value: "{{ value | default(none) }}"');
    expect(scripts).toContain('unit_key: "{{ unit_key | default(none) }}"');
  });

  it('can update the latest event start time, value, or note through Assist', async () => {
    const commands = await readFile(path.join(homeAssistantDirectory, 'rest_commands.yaml'), 'utf8');
    const scripts = await readFile(path.join(homeAssistantDirectory, 'scripts.yaml'), 'utf8');
    expect(commands).toContain('logbook_update_latest_event:');
    expect(commands).toContain('method: PATCH');
    expect(commands).toContain('payload | combine');
    expect(commands).toContain('"startedAt": started_at');
    expect(commands).toContain('"unitKey": unit_key');
    expect(scripts).toContain('alias: Update Latest Logbook Event');
    expect(scripts).toContain('name: Corrected start time');
    expect(scripts).toContain('started_at: "{{ started_at | default(none) }}"');
    expect(scripts).toContain('action: rest_command.logbook_update_latest_event');
    expect(scripts).toContain('response_variable: updated_event_result');
    expect(scripts).toContain('"note": event.note');
    expect(scripts).toContain('"value": event.displayValue');
  });

  it('returns structured start, end, ongoing, and note data to the conversation agent', async () => {
    const scripts = await readFile(path.join(homeAssistantDirectory, 'scripts.yaml'), 'utf8');

    expect(scripts).toContain('alias: Get Latest Logbook Event');
    expect(scripts).toContain('response_variable: latest_event_response');
    expect(scripts).toContain('"startedAt": event.startedAt');
    expect(scripts).toContain('"endedAt": event.endedAt');
    expect(scripts).toContain('"ongoing": event.ongoing');
    expect(scripts).toContain('"note": event.note');
    expect(scripts).toContain('started and ended on');
    expect(scripts).toContain('and is still ongoing');
    expect(scripts).toContain('and ended on');
    expect(scripts).toContain('Note: ');
    expect(scripts).toContain('response_variable: latest_event_result');
  });
});
