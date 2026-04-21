'use client'

import { useRef, useState, useTransition } from 'react'
import { addTag, removeTag } from './actions'

export function TagManager({
  postId,
  initialTags,
}: {
  postId: string
  initialTags: string[]
}) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleAdd() {
    const val = inputRef.current?.value.trim().toLowerCase() ?? ''
    if (!val || tags.includes(val)) {
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    const prev = tags
    setTags([...tags, val])
    if (inputRef.current) inputRef.current.value = ''
    setError(null)

    startTransition(async () => {
      const result = await addTag(postId, val)
      if (result.error) {
        setTags(prev)
        setError(result.error)
      }
    })
  }

  function handleRemove(tag: string) {
    const prev = tags
    setTags(tags.filter((t) => t !== tag))
    setError(null)

    startTransition(async () => {
      const result = await removeTag(postId, tag)
      if (result.error) {
        setTags(prev)
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-[1.5rem] flex-wrap gap-1">
        {tags.length === 0 ? (
          <span className="text-xs italic text-neutral-600">Aucun tag</span>
        ) : (
          tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
            >
              {tag}
              <button
                onClick={() => handleRemove(tag)}
                disabled={isPending}
                className="text-neutral-500 transition-colors hover:text-white disabled:opacity-50"
                aria-label={`Supprimer le tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          placeholder="Ajouter un tag…"
          disabled={isPending}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-white placeholder-neutral-600 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
        />
        <button
          onClick={handleAdd}
          disabled={isPending}
          className="rounded bg-neutral-700 px-2 py-1 text-xs text-white transition-colors hover:bg-neutral-600 disabled:opacity-50"
        >
          +
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
