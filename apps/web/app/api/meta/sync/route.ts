import { NextRequest, NextResponse } from 'next/server'

// Sprint 1 — implémentation complète dans lib/meta/sync-media.ts
export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = request.headers.get('authorization')?.replace('Bearer ', '')

  if (apiKey !== process.env.N8N_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ message: 'Sync endpoint — Sprint 1' })
}
