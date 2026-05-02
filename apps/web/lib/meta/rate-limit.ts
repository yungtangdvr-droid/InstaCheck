// Small helpers for the archive backfill. Kept self-contained so we
// can tune the policy here without touching the live sync code.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type BackoffOptions = {
  retries?: number
  baseMs?:  number
  maxMs?:   number
  // Optional predicate. Returning false short-circuits retries (e.g.
  // for 4xx errors that won't recover from a retry).
  shouldRetry?: (err: unknown) => boolean
}

const DEFAULT_RETRIES = 4
const DEFAULT_BASE_MS = 1000
const DEFAULT_MAX_MS  = 8000

export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: BackoffOptions = {}
): Promise<T> {
  const retries     = opts.retries     ?? DEFAULT_RETRIES
  const baseMs      = opts.baseMs      ?? DEFAULT_BASE_MS
  const maxMs       = opts.maxMs       ?? DEFAULT_MAX_MS
  const shouldRetry = opts.shouldRetry ?? (() => true)

  let attempt = 0
  let lastErr: unknown

  while (attempt <= retries) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === retries || !shouldRetry(err)) throw err
      const delay = Math.min(maxMs, baseMs * 2 ** attempt)
      await sleep(delay)
      attempt++
    }
  }

  throw lastErr
}
