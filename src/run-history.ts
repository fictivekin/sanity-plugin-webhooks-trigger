import type {RunHistoryEntry, Webhook} from './types'

/**
 * Attempt a fetch without CORS restrictions first. If the browser blocks it
 * (TypeError from CORS policy), retry with mode: 'no-cors', which always
 * reaches the server but returns an opaque response (status 0, body unreadable).
 *
 * Returns null if both attempts throw (genuine network failure).
 */
export async function fetchWithCorsRetry(
  url: string,
  options: RequestInit,
): Promise<{response: Response; opaque: boolean} | null> {
  try {
    const response = await fetch(url, options)
    return {response, opaque: false}
  } catch {
    try {
      const response = await fetch(url, {...options, mode: 'no-cors'})
      return {response, opaque: true}
    } catch {
      return null
    }
  }
}

/**
 * Parse a readable (non-opaque) fetch Response into RunHistoryEntry fields.
 */
export async function parseReadableResponse(
  response: Response,
): Promise<Pick<RunHistoryEntry, 'status' | 'statusCode' | 'responseText'>> {
  const statusCode = response.status
  const responseText = (await response.text()) || undefined
  const status: RunHistoryEntry['status'] = response.ok ? 'success' : 'failed'
  return {status, statusCode, responseText}
}

/**
 * Append a new entry to the existing history.
 */
export function mergeRunHistory(
  newEntry: RunHistoryEntry,
  existing: RunHistoryEntry[] | undefined,
): RunHistoryEntry[] {
  return [...(existing ?? []), newEntry]
}

/**
 * Sort history entries descending by triggeredAt and return the most recent maxEntries.
 */
export function getDisplayHistory(
  history: RunHistoryEntry[],
  maxEntries: number,
): RunHistoryEntry[] {
  return [...history]
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
    .slice(0, maxEntries)
}

/**
 * Resolve the display name for the user who triggered the webhook.
 */
export function resolveTriggeredBy(user: {name?: string | null; email?: string | null} | null): string {
  return user?.name || user?.email || 'Unknown user'
}

export type {Webhook}
