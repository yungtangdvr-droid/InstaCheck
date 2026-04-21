'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Contact } from '@creator-hub/types'
import { linkContactToBrand, unlinkContactFromBrand } from '@/features/crm/actions'

type Props = {
  brandId:           string
  linkedContacts:    Contact[]
  availableContacts: Contact[]
}

export function ContactLinkPicker({ brandId, linkedContacts, availableContacts }: Props) {
  const router = useRouter()
  const [picker, setPicker] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const options = useMemo(
    () => availableContacts.filter((c) => !linkedContacts.some((l) => l.id === c.id)),
    [availableContacts, linkedContacts],
  )

  function link() {
    if (!picker) return
    setError(null)
    startTransition(async () => {
      const res = await linkContactToBrand(brandId, picker)
      if (res.error) {
        setError(res.error)
        return
      }
      setPicker('')
      router.refresh()
    })
  }

  function unlink(contactId: string) {
    setError(null)
    startTransition(async () => {
      const res = await unlinkContactFromBrand(brandId, contactId)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {linkedContacts.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun contact lié.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {linkedContacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/crm/contacts/${c.id}`}
                  className="block truncate text-sm text-neutral-200 hover:text-white"
                >
                  {c.fullName}
                </Link>
                {(c.title || c.email) && (
                  <p className="truncate text-xs text-neutral-500">
                    {c.title}
                    {c.title && c.email ? ' · ' : ''}
                    {c.email}
                  </p>
                )}
              </div>
              <button
                onClick={() => unlink(c.id)}
                disabled={isPending}
                className="rounded px-2 py-1 text-xs text-neutral-500 transition-colors hover:text-red-400 disabled:opacity-50"
              >
                Détacher
              </button>
            </li>
          ))}
        </ul>
      )}

      {options.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <select
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            disabled={isPending}
            className="flex-1 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
          >
            <option value="">Lier un contact existant…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}{c.title ? ` — ${c.title}` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={link}
            disabled={isPending || !picker}
            className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
          >
            Lier
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
