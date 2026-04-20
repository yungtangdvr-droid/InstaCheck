import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const NAV = [
  { href: '/analytics',   label: 'Analytics' },
  { href: '/content-lab', label: 'Content Lab' },
  { href: '/crm',         label: 'CRM' },
  { href: '/deals',       label: 'Deals' },
  { href: '/assets',      label: 'Decks' },
  { href: '/automations', label: 'Automations' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 flex-col gap-1 border-r border-neutral-800 bg-neutral-950 px-3 py-6">
        <span className="mb-4 px-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Creator Hub
        </span>
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded-md px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            {label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
