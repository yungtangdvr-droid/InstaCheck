'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart2,
  Beaker,
  Building2,
  Briefcase,
  FileText,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/content-lab', label: 'Content Lab', icon: Beaker },
  { href: '/crm', label: 'Brand CRM', icon: Building2 },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/assets', label: 'Decks', icon: FileText },
  { href: '/automations', label: 'Automations', icon: Zap },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-zinc-200 bg-white px-3 py-5">
      <div className="mb-8 px-2">
        <span className="text-sm font-semibold tracking-tight text-zinc-900">Creator Hub</span>
        <span className="ml-1 text-xs text-zinc-400">by Tanguy</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700',
              )}
            >
              <Icon size={15} strokeWidth={1.8} />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
