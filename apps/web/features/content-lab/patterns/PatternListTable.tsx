import Link from 'next/link'
import type {
  TCreativePattern,
  TPatternRecommendation,
  TPatternSignalStrength,
} from '@creator-hub/types'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import {
  formatPatternLabel,
  humorTypeLabel,
  primaryThemeLabel,
} from '../content-analysis-labels'

const RECO_TONE: Record<TPatternRecommendation, NonNullable<VerdictBadgeProps['tone']>> = {
  replicate: 'success',
  adapt:     'warning',
  drop:      'danger',
}
const RECO_LABEL: Record<TPatternRecommendation, string> = {
  replicate: 'Répliquer',
  adapt:     'Adapter',
  drop:      'Abandonner',
}

const STRENGTH_TONE: Record<TPatternSignalStrength, NonNullable<VerdictBadgeProps['tone']>> = {
  strong:   'success',
  moderate: 'info',
  weak:     'neutral',
}
const STRENGTH_LABEL: Record<TPatternSignalStrength, string> = {
  strong:   'Fort',
  moderate: 'Modéré',
  weak:     'Faible',
}

const MEDIA_LABEL: Record<string, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carousel',
}

function fmtMultiplier(value: number | null): string {
  if (value == null) return '–'
  return `×${value.toFixed(2)}`
}

export function PatternListTable({ patterns }: { patterns: TCreativePattern[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Pattern
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Format
            </th>
            <th
              className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title="Échantillon — nombre de posts assignés à cette famille."
            >
              n
            </th>
            <th
              className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title="Score moyen pondéré (Bayesian shrinkage, prior k = 10)."
            >
              Score ajusté
            </th>
            <th
              className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title="Multiplicateur moyen saves vs baseline du format."
            >
              Saves ×
            </th>
            <th
              className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title="Multiplicateur moyen shares vs baseline du format."
            >
              Shares ×
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Signal
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Reco
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {patterns.map((p) => {
            const reco = p.recommendation
            const recoTone  = reco ? RECO_TONE[reco] : 'neutral'
            const recoLabel = reco ? RECO_LABEL[reco] : 'À évaluer'
            const strengthTone  = STRENGTH_TONE[p.signalStrength]
            const strengthLabel = STRENGTH_LABEL[p.signalStrength]
            return (
              <tr key={p.patternKey} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 text-foreground">
                  <Link
                    href={`/content-lab/patterns/${p.patternKey}`}
                    className="block hover:text-foreground/80"
                  >
                    <div className="font-medium">{primaryThemeLabel(p.primaryTheme)}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatPatternLabel(p.formatPattern)} · {humorTypeLabel(p.humorType)}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {MEDIA_LABEL[p.mediaType] ?? p.mediaType}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {p.sampleSize}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {p.bayesAdjustedScore.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {fmtMultiplier(p.meanSavesMultiplier)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {fmtMultiplier(p.meanSharesMultiplier)}
                </td>
                <td className="px-4 py-3">
                  <VerdictBadge tone={strengthTone}>{strengthLabel}</VerdictBadge>
                </td>
                <td className="px-4 py-3">
                  <VerdictBadge tone={recoTone}>{recoLabel}</VerdictBadge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
