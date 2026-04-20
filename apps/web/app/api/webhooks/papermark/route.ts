import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

// Sprint 6 — implémentation complète
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text()
  const signature = request.headers.get('x-papermark-signature') ?? ''
  const secret = process.env.PAPERMARK_WEBHOOK_SECRET ?? ''

  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const isValid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected))

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  return NextResponse.json({ received: true })
}
