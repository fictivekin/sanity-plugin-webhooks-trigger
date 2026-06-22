import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWebhookRequestOptions,
  DEFAULT_GITHUB_EVENT_TYPE,
  isGithubWebhookUrl,
} from '../src/github-dispatch.ts'

test('detects GitHub webhook URLs', () => {
  assert.equal(isGithubWebhookUrl('https://api.github.com/repos/acme/repo/dispatches'), true)
  assert.equal(isGithubWebhookUrl('https://example.com/webhook'), false)
  assert.equal(isGithubWebhookUrl('not-a-url'), false)
})

test('uses the provided GitHub event type in the request body', () => {
  const requestOptions = buildWebhookRequestOptions({
    githubEventType: 'webhook-specific',
    method: 'POST',
    url: 'https://api.github.com/repos/acme/repo/dispatches',
  })

  assert.deepEqual(JSON.parse(String(requestOptions.body)), {
    event_type: 'webhook-specific',
  })
})

test('falls back to the built-in GitHub event type when no event type is provided', () => {
  const requestOptions = buildWebhookRequestOptions({
    method: 'POST',
    url: 'https://api.github.com/repos/acme/repo/dispatches',
  })

  assert.deepEqual(JSON.parse(String(requestOptions.body)), {
    event_type: DEFAULT_GITHUB_EVENT_TYPE,
  })
})

test('does not attach GitHub headers or body to non-GitHub webhooks', () => {
  const requestOptions = buildWebhookRequestOptions({
    authToken: 'secret-token',
    githubEventType: 'webhook-specific',
    method: 'POST',
    url: 'https://example.com/webhook',
  })

  assert.equal(requestOptions.body, undefined)
  assert.deepEqual(requestOptions.headers, {
    Authorization: 'Bearer secret-token',
  })
})

test('uses a custom payload as the body for GitHub webhooks when provided', () => {
  const payload = JSON.stringify({ref: 'main', inputs: {env: 'production'}})
  const requestOptions = buildWebhookRequestOptions({
    payload,
    method: 'POST',
    url: 'https://api.github.com/repos/acme/repo/dispatches',
  })

  assert.equal(requestOptions.body, payload)
})

test('uses a custom payload as the body for non-GitHub webhooks when provided', () => {
  const payload = JSON.stringify({key: 'value'})
  const requestOptions = buildWebhookRequestOptions({
    payload,
    method: 'POST',
    url: 'https://example.com/webhook',
  })

  assert.equal(requestOptions.body, payload)
})

test('payload takes precedence over the GitHub event type body', () => {
  const payload = JSON.stringify({custom: true})
  const requestOptions = buildWebhookRequestOptions({
    payload,
    githubEventType: 'webhook-specific',
    method: 'POST',
    url: 'https://api.github.com/repos/acme/repo/dispatches',
  })

  assert.equal(requestOptions.body, payload)
})
