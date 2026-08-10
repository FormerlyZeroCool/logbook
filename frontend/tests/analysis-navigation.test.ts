import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
test('analysis routes are registered', () => { for (const route of ['/explore','/explore/new','/explore/:explorationId','/analysis-functions','/analysis-functions/:functionId']) assert.match(app, new RegExp(route.replaceAll('/','\\/'))); });
