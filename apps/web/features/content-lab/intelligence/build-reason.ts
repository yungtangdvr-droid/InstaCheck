import type { TReasonCode } from './reason-codes'

// Context the SQL candidate view exposes to the TS reason builder. Numerics
// arrive from Supabase as `number | null` (Postgres numeric → JS number when
// the column type is numeric(8,3) or int). Theme / format / pattern strings
// are taken straight from post_content_analysis without any UI-side mapping.
export type TReasonContext = {
  reasonCode:               TReasonCode
  mediaType:                string
  performanceScore:         number | null
  scoreDelta:               number | null
  savesMultiplier:          number | null
  sharesMultiplier:         number | null
  eraIndexSaves:            number | null
  eraIndexShares:           number | null
  primaryTheme:             string | null
  formatPattern:            string | null
  daysSincePosted:          number | null
}

// Format a multiplier (1.7 → "×1,7"). Returns null when the value is missing
// or not a finite number, so the caller can omit the segment entirely.
function fmtMultiplier(x: number | null): string | null {
  if (x == null || !Number.isFinite(x)) return null
  return `×${x.toFixed(1).replace('.', ',')}`
}

function fmtMediaType(mt: string): string {
  const norm = mt.toUpperCase()
  if (norm === 'VIDEO' || norm === 'REEL')   return 'Reel'
  if (norm === 'CAROUSEL_ALBUM')             return 'carrousel'
  if (norm === 'IMAGE')                      return 'image'
  return 'post'
}

function fmtTheme(theme: string | null): string | null {
  if (!theme) return null
  if (theme.trim().length === 0) return null
  if (theme === 'unknown')      return null
  return theme
}

// Pick the best multiplier to cite in a sentence. Prefer shares (the strongest
// signal in this account's scoring), then saves. Returns the rendered string
// or null when neither is usable.
function bestMultiplier(ctx: TReasonContext): { label: 'partages' | 'saves'; rendered: string } | null {
  const sharesStr = fmtMultiplier(ctx.sharesMultiplier)
  if (sharesStr) return { label: 'partages', rendered: sharesStr }
  const savesStr = fmtMultiplier(ctx.savesMultiplier)
  if (savesStr) return { label: 'saves', rendered: savesStr }
  return null
}

// Same idea for the era index — used in 'adapt' sentences to tie the recent
// post back to a historical archive comparable.
function bestEraIndex(ctx: TReasonContext): { label: 'partages' | 'saves'; rendered: string } | null {
  const sharesStr = fmtMultiplier(ctx.eraIndexShares)
  if (sharesStr) return { label: 'partages', rendered: sharesStr }
  const savesStr = fmtMultiplier(ctx.eraIndexSaves)
  if (savesStr) return { label: 'saves', rendered: savesStr }
  return null
}

const MAX_REASON_LENGTH = 220

function clampReason(s: string): string {
  if (s.length <= MAX_REASON_LENGTH) return s
  return `${s.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…`
}

type TBuilder = (ctx: TReasonContext) => string

// One builder per reason code. Sentences are short, French, action-oriented.
// They never expose technical reason codes, "ML", "model", "cluster", etc.
const REASON_BUILDERS: Record<TReasonCode, TBuilder> = {
  recent_strong_performer: (ctx) => {
    const mt    = fmtMediaType(ctx.mediaType)
    const mult  = bestMultiplier(ctx)
    const theme = fmtTheme(ctx.primaryTheme)
    const head  = mult
      ? `Ce ${mt} a circulé ${mult.rendered} la moyenne du format en ${mult.label} sur 30 jours.`
      : `Ce ${mt} sur-performe nettement la moyenne du format sur 30 jours.`
    const tail  = theme
      ? ` Re-décliner cet angle « ${theme} » sur les 2 prochains posts.`
      : ` Re-décliner ce format sur les 2 prochains posts.`
    return clampReason(head + tail)
  },

  era_format_match: (ctx) => {
    const mt    = fmtMediaType(ctx.mediaType)
    const era   = bestEraIndex(ctx)
    const theme = fmtTheme(ctx.primaryTheme)
    const head  = era
      ? `Ce ${mt} dépasse ${era.rendered} la moyenne historique du format en ${era.label}.`
      : `Ce ${mt} se cale sur un schéma qui marchait dans l'archive.`
    const tail  = theme
      ? ` Adapter le format actuel à l'angle « ${theme} » plutôt que de le répliquer tel quel.`
      : ` Adapter le format plutôt que de le répliquer tel quel.`
    return clampReason(head + tail)
  },

  recent_underperform: (ctx) => {
    const mt   = fmtMediaType(ctx.mediaType)
    const days = ctx.daysSincePosted == null ? null : Math.max(0, Math.round(ctx.daysSincePosted))
    const head = days != null
      ? `Ce ${mt} (il y a ${days} j) reste largement en dessous de la moyenne du format.`
      : `Ce ${mt} reste largement en dessous de la moyenne du format.`
    const tail = ` Ne pas le re-décliner tel quel — soit changer d'angle, soit changer de format.`
    return clampReason(head + tail)
  },
}

/**
 * Produce the French sentence stored in `content_recommendations.reason`.
 * Pure function — same input always yields the same output. The dedupe key
 * downstream is `(post_id, type, reason)`, so determinism is required.
 */
export function buildReason(ctx: TReasonContext): string {
  return REASON_BUILDERS[ctx.reasonCode](ctx)
}
