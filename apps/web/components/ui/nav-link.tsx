'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

type NavLinkProps = {
  href: string
  label: React.ReactNode
  icon?: React.ReactNode
}

export function NavLink({ href, label, icon }: NavLinkProps) {
  const pathname = usePathname() ?? ''
  const isActive =
    pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            'flex size-4 shrink-0 items-center justify-center',
            isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </Link>
  )
}
