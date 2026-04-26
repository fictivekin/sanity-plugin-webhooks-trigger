import type {Webhook} from './types'

export const DEFAULT_GITHUB_EVENT_TYPE = 'webhook-trigger'

interface BuildWebhookRequestOptionsArgs {
  authToken?: string
  githubEventType?: string
  method?: Webhook['method']
  url?: Webhook['url']
}

export function isGithubWebhookUrl(url?: string): boolean {
  if (!url) return false

  try {
    const hostname = new URL(url).hostname
    return hostname === 'github.com' || hostname.endsWith('.github.com')
  } catch {
    return false
  }
}

export function buildWebhookRequestOptions({
  authToken,
  githubEventType,
  method,
  url,
}: BuildWebhookRequestOptionsArgs): RequestInit {
  const headers: Record<string, string> = {}

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  if (isGithubWebhookUrl(url)) {
    headers.Accept = 'application/vnd.github+json'
    headers['X-GitHub-Api-Version'] = '2022-11-28'

    return {
      method,
      headers,
      body: JSON.stringify({
        event_type: githubEventType || DEFAULT_GITHUB_EVENT_TYPE,
      }),
    }
  }

  return {
    method,
    ...(Object.keys(headers).length > 0 && {headers}),
  }
}
