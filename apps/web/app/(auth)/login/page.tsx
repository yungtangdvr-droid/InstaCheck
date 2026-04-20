import { login } from './actions'

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm space-y-6 p-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          Creator Hub
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Connecte-toi pour accéder au hub
        </p>
      </div>
      <form className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-[var(--color-foreground)]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            placeholder="toi@example.com"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-[var(--color-foreground)]">
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            placeholder="••••••••"
          />
        </div>
        <button
          formAction={login}
          className="w-full py-2 px-4 rounded-md bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Se connecter
        </button>
      </form>
    </div>
  )
}
