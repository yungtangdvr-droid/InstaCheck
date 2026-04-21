import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  listAssetOptions,
  listBrandOptions,
  listOpportunityOptions,
  listRules,
} from '@/features/attribution/queries'
import { AttributionRuleRow } from '@/components/attribution/AttributionRuleRow'
import { NewAttributionRuleInline } from '@/components/attribution/NewAttributionRuleInline'

export default async function AttributionRulesPage() {
  const supabase = await createServerSupabaseClient()
  const [rules, opportunityOptions, brandOptions, assetOptions] = await Promise.all([
    listRules(supabase),
    listOpportunityOptions(supabase),
    listBrandOptions(supabase),
    listAssetOptions(supabase),
  ])

  const nameByTarget = new Map<string, string>()
  for (const o of opportunityOptions) nameByTarget.set(`opportunity:${o.id}`, o.name)
  for (const b of brandOptions)       nameByTarget.set(`brand:${b.id}`,       b.name)
  for (const a of assetOptions)       nameByTarget.set(`asset:${a.id}`,       a.name)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/attribution"
            className="text-sm text-neutral-500 transition-colors hover:text-white"
          >
            ← Attribution
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white">Règles d&apos;attribution</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Les règles explicites gagnent toujours sur le match implicite via URL d&apos;asset.
          </p>
        </div>
        <NewAttributionRuleInline
          opportunityOptions={opportunityOptions}
          brandOptions={brandOptions}
          assetOptions={assetOptions}
        />
      </div>

      {rules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">
          Aucune règle. Le hub n&apos;attribue que les clics vers des URLs d&apos;assets connus.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li key={rule.id}>
              <AttributionRuleRow
                rule={rule}
                targetName={nameByTarget.get(`${rule.targetType}:${rule.targetId}`) ?? null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
