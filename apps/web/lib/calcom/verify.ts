import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verify the X-Cal-Signature-256 header against the raw request body.
 * Cal.com signs with HMAC-SHA256 (hex digest) using the webhook secret.
 * Mirrors the Papermark verifier pattern used elsewhere in this repo.
 */
export function verifyCalcomSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}
