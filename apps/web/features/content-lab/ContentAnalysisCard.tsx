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
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-1 text-sm font-medium text-neutral-300">
          Analyse du contenu
        </h2>
        <p className="text-sm text-neutral-500">
          Analyse du contenu non disponible pour ce post.
        </p>
      </div>
    )
  }

  const confidencePct =
    analysis.confidence == null ? null : Math.round(analysis.confidence * 100)

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-neutral-300">
          Analyse du contenu
        </h2>
        <span className="text-xs text-neutral-500">
          Classification automatique (Gemini, vocab contrôlé v2)
        </span>
      </div>

      {/* Visible text */}
      <div className="mb-4 rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">
          Texte visible
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">
          {analysis.visibleText && analysis.visibleText.trim().length > 0 ? (
            analysis.visibleText
          ) : (
            <span className="italic text-neutral-600">Aucun texte visible détecté</span>
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
        <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">
            Thèmes secondaires
          </p>
          {analysis.secondaryThemes.length === 0 ? (
            <p className="mt-1 text-sm text-neutral-600 italic">Aucun</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {analysis.secondaryThemes.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300"
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
        <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">
            Référence culturelle
          </p>
          <p className="mt-1 text-sm text-neutral-200">{analysis.culturalReference}</p>
        </div>
      )}

      {analysis.shortReason && analysis.shortReason.trim().length > 0 && (
        <p className="mt-3 text-sm text-neutral-400 italic">
          « {analysis.shortReason} »
        </p>
      )}

      {/* Technical metadata */}
      <p className="mt-4 text-[11px] text-neutral-600">
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
    </div>
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
    tone === 'primary' ? 'text-base font-semibold text-white' : 'text-sm text-neutral-200'
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 ${valueClass}`}>{value}</p>
    </div>
  )
}
