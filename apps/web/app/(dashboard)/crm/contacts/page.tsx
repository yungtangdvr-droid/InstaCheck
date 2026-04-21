import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listContacts } from '@/features/crm/queries'
import { NewContactInline } from '@/components/crm/NewContactInline'
import { formatDate } from '@/features/crm/utils'

export default async function ContactsPage() {
  const supabase = await createServerSupabaseClient()
  const contacts = await listContacts(supabase)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/crm"
            className="text-sm text-neutral-500 transition-colors hover:text-white"
          >
            ← CRM
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white">Contacts</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Tous les contacts du CRM
          </p>
        </div>
        <NewContactInline />
      </div>

      {contacts.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-800 text-sm text-neutral-500">
          Aucun contact enregistré.
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900">
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">Nom</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">Rôle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">Email</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Warmness</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Prochaine relance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {contacts.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-neutral-900/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/crm/contacts/${c.id}`}
                      className="font-medium text-white hover:underline"
                    >
                      {c.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{c.title ?? '—'}</td>
                  <td className="px-4 py-3 text-neutral-400">
                    {c.brandName && c.companyId ? (
                      <Link
                        href={`/crm/brands/${c.companyId}`}
                        className="hover:text-white"
                      >
                        {c.brandName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                    {c.warmness}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-500">
                    {formatDate(c.nextFollowUpAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
