import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getThemeIndex,
  THEME_MIN_SAMPLE_SIZE,
} from '@/features/content-lab/get-content-analysis'
import { primaryThemeLabel } from '@/features/content-lab/content-analysis-labels'

// Read-only directory of every theme detected by the v2 content analysis.
// Clicking a tile opens the per-theme grid at /content-lab/themes/[theme].
// Themes with `unknown` or null primary_theme are excluded upstream.
export default async function ThemesIndexPage() {
  const supabase = await createServerSupabaseClient()
  const themes = await getThemeIndex(supabase)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/content-lab" className="hover:text-foreground">
              Content Lab
            </Link>
            <span>/</span>
            <span>Thèmes</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Thèmes éditoriaux</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vue d&apos;ensemble visuelle de tes posts, classée par thème détecté
            (vocabulaire v2 du content analysis).
          </p>
        </div>
      </div>

      {themes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucune analyse de contenu disponible. Lance d&apos;abord le batch{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
            pnpm content:analyze
          </code>
          .
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((t) => {
            const lowSample = t.postCount < THEME_MIN_SAMPLE_SIZE
            return (
              <li key={t.primaryTheme}>
                <Link
                  href={`/content-lab/themes/${encodeURIComponent(t.primaryTheme)}`}
                  className="block rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {primaryThemeLabel(t.primaryTheme)}
                    </p>
                    {lowSample && (
                      <span
                        className="rounded border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning"
                        title={`Moins de ${THEME_MIN_SAMPLE_SIZE} posts dans ce thème : le score est pondéré vers la moyenne globale.`}
                      >
                        Signal à confirmer
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    {t.postCount} post{t.postCount > 1 ? 's' : ''} analysé
                    {t.postCount > 1 ? 's' : ''}
                    {t.lastPostedAt && (
                      <>
                        {' · '}
                        dernier le{' '}
                        {new Date(t.lastPostedAt).toLocaleDateString('fr-FR', {
                          day:   '2-digit',
                          month: 'short',
                        })}
                      </>
                    )}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
