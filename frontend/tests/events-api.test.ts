import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { buildEventListSearchParams } from '../src/event-list-query.ts';

test('paginated event queries include page size and note search', (context: TestContext): void => {
  void context;
  const params = buildEventListSearchParams({
    page: 2,
    pageSize: 25,
    note: 'night feeding',
    eventTypeKey: 'feeding'
  });

  assert.equal(params.toString(), 'page=2&pageSize=25&note=night+feeding&eventTypeKey=feeding');
});

test('event query builder omits filters that were not supplied', (context: TestContext): void => {
  void context;
  const params = buildEventListSearchParams({
    page: 1,
    pageSize: 50,
    note: undefined
  });

  assert.equal(params.toString(), 'page=1&pageSize=50');
});
