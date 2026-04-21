'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createContact } from '@/features/crm/actions'

type Props = {
  linkToBrandId?: string
  label?: string
  redirectOnCreate?: boolean
}

export function NewContactInline({
  linkToBrandId,
  label = '+ Nouveau contact',
  redirectOnCreate = true,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setFullName('')
    setEmail('')
    setTitle('')
    setError(null)
  }

  function submit() {
    if (!fullName.trim()) return
    startTransition(async () => {
      const res = await createContact(
        { fullName, email: email || undefined, title: title || undefined },
        linkToBrandId,
      )
      if (res.error || !res.data) {
        setError(res.error ?? 'Unknown error')
        return
      }
      reset()
      setOpen(false)
      if (redirectOnCreate) router.push(`/crm/contacts/${res.data.id}`)
      else router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <input
        autoFocus
        type="text"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Nom complet"
        disabled={isPending}
        className="min-w-[10rem] flex-1 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        disabled={isPending}
        className="min-w-[10rem] flex-1 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
      />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre / rôle"
        disabled={isPending}
        className="min-w-[8rem] flex-1 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
      />
      <button
        onClick={submit}
        disabled={isPending || !fullName.trim()}
        className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
      >
        Créer
      </button>
      <button
        onClick={() => { reset(); setOpen(false) }}
        disabled={isPending}
        className="rounded px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:text-white disabled:opacity-50"
      >
        Annuler
      </button>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </div>
  )
}
