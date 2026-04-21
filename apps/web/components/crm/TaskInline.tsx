'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Task, TaskStatus } from '@creator-hub/types'
import { createTask, deleteTask, setTaskStatus } from '@/features/crm/actions'
import { formatDate } from '@/features/crm/utils'

type Props = {
  tasks: Task[]
  linkedBrandId?: string
  linkedContactId?: string
}

export function TaskInline({ tasks, linkedBrandId, linkedContactId }: Props) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function add() {
    if (!label.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await createTask({
        label,
        dueAt:           dueAt ? new Date(dueAt).toISOString() : undefined,
        linkedBrandId,
        linkedContactId,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      setLabel('')
      setDueAt('')
      router.refresh()
    })
  }

  function toggle(task: Task) {
    const next: TaskStatus = task.status === 'todo' ? 'done' : 'todo'
    startTransition(async () => {
      const res = await setTaskStatus(task.id, next)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function snooze(task: Task) {
    const next: TaskStatus = task.status === 'snoozed' ? 'todo' : 'snoozed'
    startTransition(async () => {
      const res = await setTaskStatus(task.id, next)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function remove(task: Task) {
    startTransition(async () => {
      const res = await deleteTask(task.id)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <span className="text-xs text-neutral-500">Nouvelle tâche</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Relancer par email…"
            disabled={isPending}
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Échéance</span>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            disabled={isPending}
            className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-50"
          />
        </label>
        <button
          onClick={add}
          disabled={isPending || !label.trim()}
          className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune tâche ouverte.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => {
            const isSnoozed = task.status === 'snoozed'
            return (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={() => toggle(task)}
                  disabled={isPending}
                  className="h-4 w-4 cursor-pointer accent-white"
                  aria-label="Marquer comme fait"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${
                      isSnoozed ? 'text-neutral-500 italic' : 'text-neutral-200'
                    }`}
                  >
                    {task.label}
                  </p>
                  {task.dueAt && (
                    <p className="text-xs text-neutral-500">
                      Échéance {formatDate(task.dueAt)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => snooze(task)}
                  disabled={isPending}
                  className="rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:text-white disabled:opacity-50"
                >
                  {isSnoozed ? 'Réactiver' : 'Snooze'}
                </button>
                <button
                  onClick={() => remove(task)}
                  disabled={isPending}
                  className="rounded px-2 py-1 text-xs text-neutral-500 transition-colors hover:text-red-400 disabled:opacity-50"
                  aria-label="Supprimer"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
