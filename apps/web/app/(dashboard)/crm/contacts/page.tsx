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
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← CRM
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tous les contacts du CRM
          </p>
        </div>
        <NewContactInline />
      </div>

      {contacts.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          Aucun contact enregistré.
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nom</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Rôle</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Brand</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Warmness</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prochaine relance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/crm/contacts/${c.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {c.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.title ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.brandName && c.companyId ? (
                      <Link
                        href={`/crm/brands/${c.companyId}`}
                        className="hover:text-foreground"
                      >
                        {c.brandName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {c.warmness}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
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
