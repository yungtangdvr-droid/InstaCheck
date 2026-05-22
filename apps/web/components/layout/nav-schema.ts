import {
  BarChart3,
  Briefcase,
  FlaskConical,
  Layers,
  LineChart,
  Radio,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  href: string
}

export type NavGroup = {
  id: string
  label: string
  icon: LucideIcon
  items: NavItem[]
  // Routes remain reachable by URL when hidden; they are simply not rendered
  // in the sidebar. Used to conceal frozen modules during the refocus phase.
  hidden?: boolean
}

// Routes here are kept in sync with apps/web/app/(dashboard)/. Dynamic routes
// (e.g. /analytics/post/[id]) are intentionally excluded — they are reached
// from tables/cards inside their parent pages.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LineChart,
    items: [
      { label: 'Analytics', href: '/analytics' },
    ],
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: BarChart3,
    items: [
      { label: 'Posts', href: '/analytics/posts' },
      { label: 'Formats', href: '/analytics/formats' },
      { label: 'Benchmark', href: '/analytics/benchmark' },
      { label: 'Audience', href: '/audience' },
    ],
  },
  {
    id: 'content-lab',
    label: 'Content Lab',
    icon: FlaskConical,
    // Only daily decision surfaces here. Back-office routes
    // (taxonomy, archive, archive/review, archive/coverage, themes index)
    // stay reachable by URL and are linked from the cockpit footer.
    items: [
      { label: 'Content Lab', href: '/content-lab' },
      { label: 'À tester',    href: '/content-lab/ideas' },
      { label: 'Patterns',    href: '/content-lab/patterns' },
      { label: 'Meme Radar',  href: '/content-lab/radar' },
      { label: 'Briefs',      href: '/content-lab/briefs' },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    icon: Briefcase,
    hidden: true,
    items: [
      { label: 'CRM', href: '/crm' },
      { label: 'Contacts', href: '/crm/contacts' },
      { label: 'Deals', href: '/deals' },
    ],
  },
  {
    id: 'tracking',
    label: 'Tracking',
    icon: Layers,
    hidden: true,
    items: [
      { label: 'Assets / Decks', href: '/assets' },
      { label: 'Attribution', href: '/attribution' },
      { label: 'Attribution Rules', href: '/attribution/rules' },
    ],
  },
  {
    id: 'signals-ops',
    label: 'Signals & Ops',
    icon: Radio,
    hidden: true,
    items: [
      { label: 'Brand Watch', href: '/brand-watch' },
      { label: 'Automations', href: '/automations' },
    ],
  },
]

export const VISIBLE_NAV_GROUPS: NavGroup[] = NAV_GROUPS.filter((g) => !g.hidden)

export function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function findActiveGroupId(pathname: string): string | null {
  let bestId: string | null = null
  let bestLen = -1
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isItemActive(pathname, item.href) && item.href.length > bestLen) {
        bestId = group.id
        bestLen = item.href.length
      }
    }
  }
  return bestId
}
