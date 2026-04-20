import { NextRequest, NextResponse } from 'next/server'

// Sprint 8 — implémentation complète
export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = request.headers.get('authorization')?.replace('Bearer ', '')

  if (apiKey !== process.env.N8N_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ received: true })
}
