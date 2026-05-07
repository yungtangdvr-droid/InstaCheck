import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Machine-to-machine endpoints that authenticate themselves with
// Authorization: Bearer N8N_API_KEY (or webhook signatures). They must
// NOT be redirected to /login by the supabase session check, otherwise
// n8n cron ticks see a 307 instead of reaching the route handler.
const MACHINE_API_ROUTES: ReadonlySet<string> = new Set([
  '/api/meta/sync',
  '/api/meta/sync-now',
  '/api/meta/archive/backfill',
  '/api/meta/archive/backfill-windowed',
  '/api/meta/archive/metrics-backfill',
])

function isMachineApiRoute(pathname: string): boolean {
  if (pathname.startsWith('/api/webhooks/')) return true
  return MACHINE_API_ROUTES.has(pathname)
}

export async function middleware(request: NextRequest) {
  if (isMachineApiRoute(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/analytics'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
