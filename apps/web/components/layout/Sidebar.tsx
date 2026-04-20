'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart2,
  FlaskConical,
  Users,
  Briefcase,
  FileText,
  Zap,
} from 'lucide-react'

const NAV = [
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/content-lab', label: 'Content Lab', icon: FlaskConical },
  { href: '/crm', label: 'Brand CRM', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/assets', label: 'Decks', icon: FileText },
  { href: '/automations', label: 'Automations', icon: Zap },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)] flex flex-col">
      <div className="px-4 py-5 border-b border-[var(--color-border)]">
        <span className="text-sm font-semibold text-[var(--color-foreground)]">Creator Hub</span>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]',
              ].join(' ')}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
