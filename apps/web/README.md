# Creator Hub — `apps/web`

Next.js app for **INSTACHECK / Creator Hub**, the single-tenant Creator
Analytics Hub for one Instagram operator.

The canonical product scope, stack, data model, and compliance rules live in
the repo-root files — this README intentionally does not restate them:

- `../../CLAUDE.md` — current product focus and active vs frozen modules.
- `../../MASTER_PROMPT_CREATOR_HUB.md` — full doctrine (source of truth).
- `./AGENTS.md` — agent rules for editing this app.

## Local development

Run from the **repo root** (pnpm workspace):

```bash
pnpm install
pnpm dev          # next dev (this app)
```

## Validation

```bash
pnpm type-check   # tsc --noEmit on apps/web
pnpm build        # next build
```

There is no `lint` script and no test runner configured at this time.
