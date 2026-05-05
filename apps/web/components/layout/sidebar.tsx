'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  VISIBLE_NAV_GROUPS,
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
    Object.fromEntries(VISIBLE_NAV_GROUPS.map((g) => [g.id, g.id === activeGroupId])),
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
      {VISIBLE_NAV_GROUPS.map((group) => (
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
    <div className="mb-6 flex items-center gap-3 px-2">
      <span
        aria-hidden
        className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold shadow-[0_1px_0_oklch(1_0_0_/_0.18)_inset,0_8px_20px_-12px_oklch(0_0_0_/_0.5)]"
      >
        CH
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Creator Hub
        </p>
        <p className="truncate text-[15px] font-medium text-foreground">InstaCheck</p>
      </div>
    </div>
  )

  const footer = (
    <div className="mt-auto border-t border-[color:var(--surface-border)] pt-4">
      <p className="px-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Compte
      </p>
      <p
        className="mt-1 truncate px-2 text-[13px] text-muted-foreground"
        title={userEmail ?? undefined}
      >
        {userEmail ?? 'Connecté'}
      </p>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--surface-border)] bg-[color:var(--surface-glass-strong)] px-4 py-3 backdrop-blur-xl sm:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="mobile-sidebar"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-xl border border-[color:var(--surface-border)] bg-[color:var(--surface-glass)] text-foreground backdrop-blur-md hover:bg-[color:var(--surface-highlight)]"
        >
          <Menu className="size-4" />
        </button>
        <span className="text-[15px] font-medium text-foreground">InstaCheck</span>
      </div>

      {/* Desktop sidebar — floating glass panel */}
      <aside className="sticky top-3 hidden h-[calc(100vh-1.5rem)] w-64 shrink-0 flex-col rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-glass-strong)] px-4 py-6 shadow-[var(--shadow-float)] backdrop-blur-2xl sm:ml-3 sm:flex">
        {header}
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-md"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside
            id="mobile-sidebar"
            className="absolute inset-y-3 left-3 flex w-72 max-w-[85vw] flex-col rounded-3xl border border-[color:var(--surface-border)] bg-[color:var(--surface-glass-strong)] px-4 py-6 shadow-[var(--shadow-float)] backdrop-blur-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Navigation
              </span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-[color:var(--surface-highlight)] hover:text-foreground"
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
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium tracking-[-0.005em] transition-colors',
          groupActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-[color:var(--surface-highlight)] hover:text-foreground',
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            'size-[18px] shrink-0',
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
        <ul className="mt-0.5 mb-1 ml-[22px] flex flex-col gap-0.5 border-l border-[color:var(--surface-border)] pl-2">
          {group.items.map((item) => {
            const active = isItemActive(pathname, item.href)
            return (
              <li key={item.href} className="relative">
                {active ? (
                  <span
                    aria-hidden
                    className="absolute -left-[9px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-foreground/80"
                  />
                ) : null}
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block truncate rounded-lg px-3 py-2 text-[13.5px] transition-colors',
                    active
                      ? 'bg-[color:var(--surface-highlight)] font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-[color:var(--surface-highlight)]/60 hover:text-foreground',
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
