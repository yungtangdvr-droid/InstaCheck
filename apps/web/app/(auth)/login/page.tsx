'use client'

import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=/analytics` },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="w-full max-w-sm px-4">
      <div className="mb-6 flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold"
        >
          CH
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Creator Hub
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Connexion</CardTitle>
          <CardDescription>
            Pas de mot de passe — un lien magique te sera envoyé par e-mail.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {sent ? (
            <div className="rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
              Lien envoyé à <strong className="font-semibold">{email}</strong>. Vérifie ta boîte mail.
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Adresse e-mail
                </span>
                <input
                  type="email"
                  required
                  placeholder="ton@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </label>
              {error && (
                <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Envoi…' : 'Recevoir le lien'}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="text-[11px] text-muted-foreground">
          Cockpit single-tenant — accès réservé à l’opérateur du compte.
        </CardFooter>
      </Card>
    </div>
  )
}
