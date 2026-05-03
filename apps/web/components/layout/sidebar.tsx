'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  NAV_GROUPS,
  findActiveGroupId,
  isItemActive,
  type NavGroup,
} from './nav-schema'

type SidebarProps = {
  userEmail: string | null
}

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname() ?? ''
  const activeGroupId = useMemo(() => findActiveGroupId(pathname), [pathname])

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((g) => [g.id, g.id === activeGroupId])),
  )
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Keep the active group expanded when navigating between sections.
  useEffect(() => {
    if (!activeGroupId) return
    setExpanded((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }))
  }, [activeGroupId])

  // Close mobile drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Close mobile drawer on ESC.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const toggleGroup = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Primary">
      {NAV_GROUPS.map((group) => (
        <SidebarGroup
          key={group.id}
          group={group}
          pathname={pathname}
          isOpen={!!expanded[group.id]}
          onToggle={() => toggleGroup(group.id)}
        />
      ))}
    </nav>
  )

  const header = (
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
        <p className="truncate text-sm font-medium text-foreground">InstaCheck</p>
      </div>
    </div>
  )

  const footer = (
    <div className="mt-auto border-t border-border pt-4">
      <p className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        Compte
      </p>
      <p
        className="mt-1 truncate px-3 text-xs text-muted-foreground"
        title={userEmail ?? undefined}
      >
        {userEmail ?? 'Connecté'}
      </p>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card/80 px-4 py-3 backdrop-blur sm:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="mobile-sidebar"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-accent"
        >
          <Menu className="size-4" />
        </button>
        <span className="text-sm font-medium text-foreground">InstaCheck</span>
      </div>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card/40 px-3 py-6 sm:flex">
        {header}
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside
            id="mobile-sidebar"
            className="absolute inset-y-0 left-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-card px-3 py-6 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Navigation
              </span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            {header}
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  )
}

type SidebarGroupProps = {
  group: NavGroup
  pathname: string
  isOpen: boolean
  onToggle: () => void
}

function SidebarGroup({ group, pathname, isOpen, onToggle }: SidebarGroupProps) {
  const Icon = group.icon
  const groupActive = group.items.some((i) => isItemActive(pathname, i.href))

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={cn(
          'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
          groupActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            'size-4 shrink-0',
            groupActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
          )}
        />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            isOpen ? '' : '-rotate-90',
          )}
        />
      </button>

      {isOpen && (
        <ul className="mb-1 ml-6 flex flex-col gap-0.5 border-l border-border pl-2">
          {group.items.map((item) => {
            const active = isItemActive(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block truncate rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                    active
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
