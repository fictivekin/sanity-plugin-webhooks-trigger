import assert from 'node:assert/strict'
import test from 'node:test'

import {fetchWithCorsRetry, getDisplayHistory, mergeRunHistory, parseReadableResponse, resolveTriggeredBy} from '../src/run-history.ts'
import type {RunHistoryEntry} from '../src/types/index.ts'

// ---------------------------------------------------------------------------
// resolveTriggeredBy
// ---------------------------------------------------------------------------

test('resolveTriggeredBy: prefers name over email', () => {
  assert.equal(resolveTriggeredBy({name: 'Alice', email: 'alice@example.com'}), 'Alice')
})

test('resolveTriggeredBy: falls back to email when name is absent', () => {
  assert.equal(resolveTriggeredBy({name: null, email: 'alice@example.com'}), 'alice@example.com')
})

test('resolveTriggeredBy: falls back to "Unknown user" when both are absent', () => {
  assert.equal(resolveTriggeredBy(null), 'Unknown user')
  assert.equal(resolveTriggeredBy({name: null, email: null}), 'Unknown user')
})

// ---------------------------------------------------------------------------
// mergeRunHistory
// ---------------------------------------------------------------------------

test('mergeRunHistory: appends the new entry after existing ones', () => {
  const existing: RunHistoryEntry[] = [
    {triggeredAt: '2024-01-01T00:00:00Z', triggeredBy: 'Alice', status: 'success'},
  ]
  const newEntry: RunHistoryEntry = {
    triggeredAt: '2024-01-02T00:00:00Z',
    triggeredBy: 'Bob',
    status: 'failed',
  }
  const result = mergeRunHistory(newEntry, existing)
  assert.equal(result[0], existing[0])
  assert.equal(result[1], newEntry)
})

test('mergeRunHistory: does not cap the stored history', () => {
  const existing: RunHistoryEntry[] = Array.from({length: 10}, (_, i) => ({
    triggeredAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    triggeredBy: 'Alice',
    status: 'success' as const,
  }))
  const newEntry: RunHistoryEntry = {
    triggeredAt: '2024-01-11T00:00:00Z',
    triggeredBy: 'Bob',
    status: 'triggered',
  }
  const result = mergeRunHistory(newEntry, existing)
  assert.equal(result.length, 11)
})

test('mergeRunHistory: handles undefined existing history', () => {
  const newEntry: RunHistoryEntry = {
    triggeredAt: '2024-01-01T00:00:00Z',
    triggeredBy: 'Alice',
    status: 'success',
  }
  const result = mergeRunHistory(newEntry, undefined)
  assert.deepEqual(result, [newEntry])
})

// ---------------------------------------------------------------------------
// getDisplayHistory
// ---------------------------------------------------------------------------

test('getDisplayHistory: sorts entries descending by triggeredAt', () => {
  const history: RunHistoryEntry[] = [
    {triggeredAt: '2024-01-01T00:00:00Z', triggeredBy: 'Alice', status: 'success'},
    {triggeredAt: '2024-01-03T00:00:00Z', triggeredBy: 'Carol', status: 'triggered'},
    {triggeredAt: '2024-01-02T00:00:00Z', triggeredBy: 'Bob', status: 'failed'},
  ]
  const result = getDisplayHistory(history, 10)
  assert.equal(result[0].triggeredAt, '2024-01-03T00:00:00Z')
  assert.equal(result[1].triggeredAt, '2024-01-02T00:00:00Z')
  assert.equal(result[2].triggeredAt, '2024-01-01T00:00:00Z')
})

test('getDisplayHistory: caps results at maxEntries', () => {
  const history: RunHistoryEntry[] = Array.from({length: 10}, (_, i) => ({
    triggeredAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    triggeredBy: 'Alice',
    status: 'success' as const,
  }))
  const result = getDisplayHistory(history, 5)
  assert.equal(result.length, 5)
})

test('getDisplayHistory: returns the most recent entries when capping', () => {
  const history: RunHistoryEntry[] = Array.from({length: 10}, (_, i) => ({
    triggeredAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    triggeredBy: 'Alice',
    status: 'success' as const,
  }))
  const result = getDisplayHistory(history, 3)
  assert.equal(result[0].triggeredAt, '2024-01-10T00:00:00Z')
  assert.equal(result[1].triggeredAt, '2024-01-09T00:00:00Z')
  assert.equal(result[2].triggeredAt, '2024-01-08T00:00:00Z')
})

test('getDisplayHistory: does not mutate the original array', () => {
  const history: RunHistoryEntry[] = [
    {triggeredAt: '2024-01-02T00:00:00Z', triggeredBy: 'Bob', status: 'failed'},
    {triggeredAt: '2024-01-01T00:00:00Z', triggeredBy: 'Alice', status: 'success'},
  ]
  getDisplayHistory(history, 5)
  assert.equal(history[0].triggeredAt, '2024-01-02T00:00:00Z')
})

// ---------------------------------------------------------------------------
// parseReadableResponse
// ---------------------------------------------------------------------------

// Status codes with null bodies (per spec) cannot be constructed with a body string
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

function makeMockResponse(status: number, body: string): Response {
  return new Response(NULL_BODY_STATUSES.has(status) ? null : body, {status})
}

test('parseReadableResponse: returns success for 2xx responses', async () => {
  const result = await parseReadableResponse(makeMockResponse(200, 'ok'))
  assert.equal(result.status, 'success')
  assert.equal(result.statusCode, 200)
})

test('parseReadableResponse: returns success and no responseText for 204 No Content', async () => {
  const result = await parseReadableResponse(makeMockResponse(204, ''))
  assert.equal(result.status, 'success')
  assert.equal(result.statusCode, 204)
  assert.equal(result.responseText, undefined)
})

test('parseReadableResponse: returns failed for non-2xx responses', async () => {
  const result = await parseReadableResponse(makeMockResponse(422, 'Unprocessable Entity'))
  assert.equal(result.status, 'failed')
  assert.equal(result.statusCode, 422)
  assert.equal(result.responseText, 'Unprocessable Entity')
})

test('parseReadableResponse: captures response body text', async () => {
  const body = JSON.stringify({message: 'Not Found'})
  const result = await parseReadableResponse(makeMockResponse(404, body))
  assert.equal(result.responseText, body)
})

test('parseReadableResponse: sets responseText to undefined for empty body', async () => {
  const result = await parseReadableResponse(makeMockResponse(200, ''))
  assert.equal(result.responseText, undefined)
})

// ---------------------------------------------------------------------------
// fetchWithCorsRetry
// ---------------------------------------------------------------------------

test('fetchWithCorsRetry: returns readable response when first attempt succeeds', async (t) => {
  t.mock.method(global, 'fetch', async () => new Response('ok', {status: 200}))
  const result = await fetchWithCorsRetry('https://example.com/webhook', {method: 'POST'})
  assert.ok(result)
  assert.equal(result.opaque, false)
  assert.equal(result.response.status, 200)
})

test('fetchWithCorsRetry: retries with no-cors when first attempt throws', async (t) => {
  let callCount = 0
  t.mock.method(global, 'fetch', async (_url: string, options: RequestInit) => {
    callCount++
    if (callCount === 1) throw new TypeError('Failed to fetch')
    // Second call should have mode: 'no-cors'
    assert.equal(options.mode, 'no-cors')
    return new Response(null, {status: 200})
  })
  const result = await fetchWithCorsRetry('https://example.com/webhook', {method: 'POST'})
  assert.ok(result)
  assert.equal(result.opaque, true)
  assert.equal(callCount, 2)
})

test('fetchWithCorsRetry: returns null when both attempts throw', async (t) => {
  t.mock.method(global, 'fetch', async () => {
    throw new TypeError('Failed to fetch')
  })
  const result = await fetchWithCorsRetry('https://example.com/webhook', {method: 'POST'})
  assert.equal(result, null)
})

test('fetchWithCorsRetry: does not override an explicit mode on the no-cors retry', async (t) => {
  let callCount = 0
  let retryOptions: RequestInit = {}
  t.mock.method(global, 'fetch', async (_url: string, options: RequestInit) => {
    callCount++
    if (callCount === 1) throw new TypeError('Failed to fetch')
    retryOptions = options
    return new Response(null, {status: 0})
  })
  await fetchWithCorsRetry('https://example.com/webhook', {method: 'GET'})
  assert.equal(retryOptions.mode, 'no-cors')
})
