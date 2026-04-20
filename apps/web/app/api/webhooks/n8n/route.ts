import { type NextRequest } from 'next/server'
import type { N8nSyncTriggerPayload } from '@creator-hub/types'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey     = process.env.N8N_API_KEY

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: N8nSyncTriggerPayload
  try {
    payload = await request.json() as N8nSyncTriggerPayload
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log(`[n8n webhook] automation=${payload.automation} triggeredAt=${payload.triggeredAt}`)

  return Response.json({ ok: true, received: payload.automation })
}
