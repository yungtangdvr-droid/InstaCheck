import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BarChart3, FlaskConical, Users } from 'lucide-react'

import { NavLink } from '@/components/ui/nav-link'

// Refocus 2026-04-22: only Analytics, Audience and Content Lab are surfaced
// in the nav. Audience is part of the Analytics scope (Meta-official audience
// behavior + demographics when synced). Frozen routes (crm, deals, assets,
// attribution, brand-watch, automations) still resolve by direct URL but are
// not advertised. See CLAUDE.md and MASTER_PROMPT_CREATOR_HUB.md.
const NAV: Array<{ href: string; label: string; icon: React.ReactNode }> = [
  { href: '/analytics',   label: 'Analytics',   icon: <BarChart3 className="size-4" /> },
  { href: '/audience',    label: 'Audience',    icon: <Users      className="size-4" /> },
  { href: '/content-lab', label: 'Content Lab', icon: <FlaskConical className="size-4" /> },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card/40 px-3 py-6 sm:flex">
        <div className="mb-6 flex items-center gap-2 px-3">
          <span
            aria-hidden
            className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-[11px] font-semibold"
          >
            CH
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Creator Hub
            </p>
            <p className="truncate text-sm font-medium text-foreground">
              Cockpit
            </p>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} />
          ))}
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <p className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            Compte
          </p>
          <p className="mt-1 truncate px-3 text-xs text-muted-foreground" title={user.email ?? undefined}>
            {user.email ?? 'Connecté'}
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  )
}
