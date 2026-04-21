'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Brand, BrandStatus } from '@creator-hub/types'
import { deleteBrand, updateBrand } from '@/features/crm/actions'
import { BRAND_STATUSES, BRAND_STATUS_LABEL } from '@/features/crm/utils'

function sanitize(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function BrandEditor({ brand }: { brand: Brand }) {
  const router = useRouter()
  const [form, setForm] = useState({
    name:              brand.name,
    website:           brand.website ?? '',
    country:           brand.country ?? '',
    category:          brand.category ?? '',
    status:            brand.status,
    aestheticFitScore: brand.aestheticFitScore,
    businessFitScore:  brand.businessFitScore,
    notes:             brand.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await updateBrand(brand.id, {
        name:              form.name,
        website:           form.website,
        country:           form.country,
        category:          form.category,
        status:            form.status,
        aestheticFitScore: form.aestheticFitScore,
        businessFitScore:  form.businessFitScore,
        notes:             form.notes,
      })
      if (res.error) setError(res.error)
      else setSavedAt(new Date())
    })
  }

  function handleDelete() {
    if (!confirm(`Supprimer la brand « ${brand.name} » ?`)) return
    startTransition(async () => {
      await deleteBrand(brand.id)
      router.push('/crm')
    })
  }

  return (
    <section className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="text-sm font-medium text-neutral-300">Détails</h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Nom">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <Field label="Statut">
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as BrandStatus })}
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
          >
            {BRAND_STATUSES.map((s) => (
              <option key={s} value={s}>{BRAND_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>

        <Field label="Catégorie">
          <input
            type="text"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="ex. luxury eyewear"
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <Field label="Pays">
          <input
            type="text"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
            placeholder="FR, US…"
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <Field label="Site web">
          <input
            type="url"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://…"
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Aesthetic fit (0–100)">
            <input
              type="number"
              min={0}
              max={100}
              value={form.aestheticFitScore}
              onChange={(e) =>
                setForm({ ...form, aestheticFitScore: sanitize(Number(e.target.value)) })
              }
              className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
            />
          </Field>
          <Field label="Business fit (0–100)">
            <input
              type="number"
              min={0}
              max={100}
              value={form.businessFitScore}
              onChange={(e) =>
                setForm({ ...form, businessFitScore: sanitize(Number(e.target.value)) })
              }
              className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
            />
          </Field>
        </div>
      </div>

      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={4}
          className="w-full resize-y rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
          placeholder="Angle éditorial, contexte deal, remarques…"
        />
      </Field>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={isPending}
            className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
          >
            {isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {savedAt && !error && (
            <span className="text-xs text-neutral-500">
              Sauvé à {savedAt.toLocaleTimeString('fr-FR')}
            </span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="rounded border border-red-500/30 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          Supprimer
        </button>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  )
}
