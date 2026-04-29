import type { TPostContentAnalysis } from './get-content-analysis'
import {
  formatPatternLabel,
  humorTypeLabel,
  languageLabel,
  nicheLevelLabel,
  primaryThemeLabel,
  replicationLevelClass,
  replicationLevelLabel,
} from './content-analysis-labels'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// Read-only display of the v2 Gemini analysis row attached to a post.
// Renders nothing visual but the empty state when no completed row exists.
// The card sits below the performance / circulation blocks on the post
// detail page; it is purely informative — no actions, no links into batch
// debugging.
export function ContentAnalysisCard({
  analysis,
}: {
  analysis: TPostContentAnalysis | null
}) {
  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analyse du contenu</CardTitle>
          <CardDescription>
            Analyse du contenu non disponible pour ce post.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const confidencePct =
    analysis.confidence == null ? null : Math.round(analysis.confidence * 100)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle>Analyse du contenu</CardTitle>
          <span className="text-xs text-muted-foreground">
            Classification automatique (Gemini, vocab contrôlé v2)
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Visible text */}
        <div className="mb-4 rounded-md border border-border bg-muted/30 p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Texte visible
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {analysis.visibleText && analysis.visibleText.trim().length > 0 ? (
              analysis.visibleText
            ) : (
              <span className="italic text-muted-foreground">Aucun texte visible détecté</span>
            )}
          </p>
        </div>

        {/* Theme + secondary themes */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ClassificationTile
            label="Thème principal"
            value={primaryThemeLabel(analysis.primaryTheme)}
            tone="primary"
          />
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Thèmes secondaires
            </p>
            {analysis.secondaryThemes.length === 0 ? (
              <p className="mt-1 text-sm italic text-muted-foreground">Aucun</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {analysis.secondaryThemes.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Format / humor / niche / replication */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ClassificationTile
            label="Type d'humour"
            value={humorTypeLabel(analysis.humorType)}
          />
          <ClassificationTile
            label="Format / template"
            value={formatPatternLabel(analysis.formatPattern)}
          />
          <ClassificationTile
            label="Niveau de niche"
            value={nicheLevelLabel(analysis.nicheLevel)}
          />
          <div
            className={`rounded-md border p-3 ${replicationLevelClass(analysis.replicationPotential)}`}
          >
            <p className="text-[11px] uppercase tracking-wide opacity-70">
              Potentiel de réplication
            </p>
            <p className="mt-1 text-sm font-medium">
              {replicationLevelLabel(analysis.replicationPotential)}
            </p>
          </div>
        </div>

        {/* Cultural reference + reason */}
        {(analysis.culturalReference && analysis.culturalReference.trim().length > 0) && (
          <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Référence culturelle
            </p>
            <p className="mt-1 text-sm text-foreground">{analysis.culturalReference}</p>
          </div>
        )}

        {analysis.shortReason && analysis.shortReason.trim().length > 0 && (
          <p className="mt-3 text-sm italic text-muted-foreground">
            « {analysis.shortReason} »
          </p>
        )}

        {/* Technical metadata */}
        <p className="mt-4 text-[11px] text-muted-foreground">
          Prompt {analysis.promptVersion}
          {confidencePct != null && ` · confiance ${confidencePct}%`}
          {analysis.language && ` · langue : ${languageLabel(analysis.language)}`}
          {analysis.analyzedAt &&
            ` · analysé le ${new Date(analysis.analyzedAt).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}`}
        </p>
      </CardContent>
    </Card>
  )
}

function ClassificationTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'primary'
}) {
  const valueClass =
    tone === 'primary' ? 'text-base font-semibold text-foreground' : 'text-sm text-foreground'
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 ${valueClass}`}>{value}</p>
    </div>
  )
}
