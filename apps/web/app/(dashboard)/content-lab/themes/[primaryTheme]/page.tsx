import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  PRIMARY_THEME_LABEL_FR,
  primaryThemeLabel,
} from '@/features/content-lab/content-analysis-labels'
import {
  getThemePosts,
  THEME_POST_SORTS,
  type TThemePostSort,
} from '@/features/content-lab/get-content-analysis'
import { ThemeFilters } from '@/features/content-lab/ThemeFilters'
import { ThemePostCard } from '@/features/content-lab/ThemePostCard'
import { parsePeriod } from '@/features/analytics/utils'

const KNOWN_FORMATS = ['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'REEL'] as const

function parseSort(raw: string | undefined): TThemePostSort {
  return (THEME_POST_SORTS as readonly string[]).includes(raw ?? '')
    ? (raw as TThemePostSort)
    : 'shares'
}

function parseFormat(raw: string | undefined): string {
  if (!raw) return 'ALL'
  if (raw === 'ALL') return 'ALL'
  return (KNOWN_FORMATS as readonly string[]).includes(raw) ? raw : 'ALL'
}

export default async function ThemeDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ primaryTheme: string }>
  searchParams: Promise<{ period?: string; format?: string; sort?: string }>
}) {
  const { primaryTheme: rawTheme } = await params
  const primaryTheme = decodeURIComponent(rawTheme)

  // Reject themes outside the controlled vocabulary so a typo'd URL doesn't
  // surface an empty grid silently. Unknown / null are filtered upstream too.
  if (!(primaryTheme in PRIMARY_THEME_LABEL_FR) || primaryTheme === 'unknown') {
    notFound()
  }

  const sp        = await searchParams
  const period    = parsePeriod(sp.period)
  const mediaType = parseFormat(sp.format)
  const sort      = parseSort(sp.sort)

  const supabase = await createServerSupabaseClient()
  const posts = await getThemePosts(supabase, primaryTheme, {
    period,
    mediaType: mediaType === 'ALL' ? null : mediaType,
    sort,
  })

  // Only surface formats that actually exist within this theme's filtered set,
  // so the dropdown never shows formats the operator can't pick from.
  const formatsAvailable = Array.from(
    new Set(posts.map(p => p.mediaType).filter(Boolean)),
  ).sort()

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs text-neutral-500">
          <Link href="/content-lab" className="hover:text-neutral-300">
            Content Lab
          </Link>
          <span>/</span>
          <Link href="/content-lab/themes" className="hover:text-neutral-300">
            Thèmes
          </Link>
          <span>/</span>
          <span>{primaryThemeLabel(primaryTheme)}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {primaryThemeLabel(primaryTheme)}
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              {posts.length} post{posts.length > 1 ? 's' : ''} dans ce thème sur{' '}
              {period} j {mediaType !== 'ALL' && (
                <>· filtré sur {mediaType.toLowerCase()}</>
              )}.
            </p>
          </div>
          <ThemeFilters
            period={period}
            mediaType={mediaType}
            sort={sort}
            formats={formatsAvailable}
          />
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/40 p-8 text-center text-sm text-neutral-500">
          Aucun post dans ce thème sur la période sélectionnée.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {posts.map((p) => (
            <li key={p.postId}>
              <ThemePostCard post={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
