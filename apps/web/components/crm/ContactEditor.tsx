'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Contact } from '@creator-hub/types'
import { deleteContact, updateContact } from '@/features/crm/actions'

function sanitize(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function toInputDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ContactEditor({ contact }: { contact: Contact }) {
  const router = useRouter()
  const [form, setForm] = useState({
    fullName:        contact.fullName,
    email:           contact.email ?? '',
    title:           contact.title ?? '',
    linkedinUrl:     contact.linkedinUrl ?? '',
    instagramHandle: contact.instagramHandle ?? '',
    warmness:        contact.warmness,
    nextFollowUpAt:  toInputDateTime(contact.nextFollowUpAt),
    notes:           contact.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await updateContact(contact.id, {
        fullName:        form.fullName,
        email:           form.email,
        title:           form.title,
        linkedinUrl:     form.linkedinUrl,
        instagramHandle: form.instagramHandle,
        warmness:        form.warmness,
        nextFollowUpAt:  form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : '',
        notes:           form.notes,
      })
      if (res.error) setError(res.error)
      else setSavedAt(new Date())
    })
  }

  function handleDelete() {
    if (!confirm(`Supprimer le contact « ${contact.fullName} » ?`)) return
    startTransition(async () => {
      await deleteContact(contact.id)
      router.push('/crm/contacts')
    })
  }

  return (
    <section className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="text-sm font-medium text-neutral-300">Détails</h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Nom complet">
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <Field label="Titre / rôle">
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Head of Partnerships…"
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <Field label="LinkedIn">
          <input
            type="url"
            value={form.linkedinUrl}
            onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
            placeholder="https://linkedin.com/in/…"
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <Field label="Instagram handle">
          <input
            type="text"
            value={form.instagramHandle}
            onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })}
            placeholder="@handle"
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <Field label="Warmness (0–100)">
          <input
            type="number"
            min={0}
            max={100}
            value={form.warmness}
            onChange={(e) => setForm({ ...form, warmness: sanitize(Number(e.target.value)) })}
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>

        <Field label="Prochaine relance">
          <input
            type="datetime-local"
            value={form.nextFollowUpAt}
            onChange={(e) => setForm({ ...form, nextFollowUpAt: e.target.value })}
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={4}
          className="w-full resize-y rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
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
