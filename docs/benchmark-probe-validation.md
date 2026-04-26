# Benchmark probe validation — PR 2 follow-up

Date: 2026-04-26
Branch: `claude/benchmark-types-live-probe-sIYsA` (harness-pinned;
the requested name `chore/benchmark-types-and-live-probe` could not
be used because the harness rules pin this session to the branch
above)
Base: `origin/main` @ `4e3a0e8` (`feat: add benchmark discovery
foundation`) — already in sync, no rebase needed.

## TL;DR

The validation closing the PR 2 caveat could **not be completed
end-to-end inside this sandbox** because the two prerequisites that
make the validation meaningful are unreachable here:

1. The local Supabase stack (`pnpm supabase db reset` →
   `pnpm db:types`) requires a running Docker daemon. This sandbox
   has the `docker` client but the kernel lacks the netfilter / nft
   support `dockerd` needs to bring up its bridge network, so the
   daemon refuses to start.
2. The live Meta Graph probe requires `META_ACCESS_TOKEN` and
   `META_INSTAGRAM_ACCOUNT_ID`. Neither is set in this environment,
   and inventing credentials is forbidden by the master prompt
   ("API Meta officielle uniquement", règles d'or §5).

What **was** validated:

- The migration file `supabase/migrations/0007_benchmark_foundation.sql`
  is present and matches the PR 2 scope (additive only, reposts
  nullable, `benchmark_metric_status` enum, etc.).
- The probe CLI (`pnpm -F web probe:benchmark`) handles the no-credentials
  path cleanly: structured JSON, exit code 2, no stack trace.
- The same clean exit happens whether the username is plausible
  (`instagram`) or obviously fake (`this_user_should_not_exist_999999`),
  because the env check is the first gate.
- `pnpm type-check` and `pnpm build` both pass on the existing tree.

PR 3 (DB persistence) **cannot start yet** — the type regeneration
and the real-vs-fake live probes are still owed, and they need an
operator-side environment that has Docker + the Meta credentials.

---

## 1. Branch state

```text
$ git rev-parse HEAD
4e3a0e8cc354a723ebd55ad14d20e793f6ea9e78

$ git rev-parse origin/main
4e3a0e8cc354a723ebd55ad14d20e793f6ea9e78

$ git status
On branch claude/benchmark-types-live-probe-sIYsA
nothing to commit, working tree clean
```

Working branch is current with `main`; nothing to pull or rebase.

## 2. Migration confirmation

`supabase/migrations/0007_benchmark_foundation.sql` exists, 118
lines, declares:

- enums: `benchmark_cohort`, `benchmark_metric_status`
- tables: `benchmark_accounts`,
  `raw_benchmark_instagram_account_daily`,
  `raw_benchmark_instagram_media`,
  `benchmark_sync_runs`
- supporting indexes; reposts kept as a NULLABLE first-class column
  on `raw_benchmark_instagram_media`.

No change made to the schema.

## 3. Local Supabase prerequisites

| Requirement       | Status                                   |
|-------------------|------------------------------------------|
| `pnpm`            | OK (v10.33.0)                            |
| `docker` client   | OK (29.3.1)                              |
| `dockerd`         | **FAIL** — cannot bind nftables on this kernel |
| Supabase CLI      | **NOT INSTALLED** in this sandbox (no `supabase` binary on PATH and not declared as a dev dep) |
| `supabase/config.toml` | OK (Postgres 15, port 54322)        |

`dockerd` log excerpt (`/tmp/dockerd.log`):

```
failed to start daemon: Error initializing network controller:
error obtaining controller instance: failed to register "bridge" driver:
failed to create NAT chain DOCKER: iptables failed:
iptables --wait -t nat -N DOCKER:
iptables: Failed to initialize nft: Protocol not supported
```

Because dockerd cannot start, `pnpm supabase db reset` and
`pnpm supabase start` cannot run here.

## 4. `pnpm supabase db reset` — NOT EXECUTED

Blocked by §3. No migrations were applied in this session and no
local Postgres state was touched.

## 5. `pnpm db:types` — NOT EXECUTED

Blocked by §3 and §4 (the script generates from `--local`, which
requires the Supabase stack). `packages/types/supabase.ts` was
**not** regenerated. It is unchanged on disk.

## 6. `packages/types/supabase.ts` — current contents

The file is **hand-maintained** (it uses a custom `Row<…>` /
`Insert<…>` / `Update<…>` wrapper, not the format that
`supabase gen types typescript` would emit). At 790 lines today it
covers tables present up to `0006_post_content_analysis.sql` plus
prior modules.

Search for the PR 2 names returns 0 hits:

```text
$ grep -c 'benchmark_accounts\|raw_benchmark_instagram_account_daily\
|raw_benchmark_instagram_media\|benchmark_sync_runs\
|benchmark_cohort\|benchmark_metric_status' \
  packages/types/supabase.ts
0
```

So the file currently does **NOT** include the six PR 2 symbols:

- [ ] `benchmark_accounts`
- [ ] `raw_benchmark_instagram_account_daily`
- [ ] `raw_benchmark_instagram_media`
- [ ] `benchmark_sync_runs`
- [ ] `benchmark_cohort`
- [ ] `benchmark_metric_status`

I deliberately did **not** hand-edit the file to add them. The
caveat we are trying to close is "the regenerated types include the
benchmark symbols"; satisfying that with a manual edit would
fabricate the validation rather than perform it. The next operator
session that has Docker + Supabase CLI must run `pnpm db:types`.

(Note: PR 2 builds fine without those types because
`apps/web/lib/meta/benchmark-probe.ts` consumes
`@creator-hub/types` for benchmark-specific types, not the Supabase
`Database` interface — see `apps/web/lib/meta/benchmark-probe.ts:18`.
The DB-row types only matter once PR 3 starts wiring persistence.)

## 7. Live probe — real public IG username

Not executed against the live API. `META_ACCESS_TOKEN` and
`META_INSTAGRAM_ACCOUNT_ID` are unset in this sandbox. The probe
correctly refuses to run rather than silently fall back:

```bash
$ pnpm -F web probe:benchmark -- --username=instagram
{
  "ok": false,
  "error": "missing_env",
  "missing_env": [
    "META_ACCESS_TOKEN",
    "META_INSTAGRAM_ACCOUNT_ID"
  ],
  "hint": "export the required Meta Graph credentials before running"
}
# pnpm wraps the script's exit 2 as ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
```

What this validates:
- the env-gating in `scripts/benchmark/probe-benchmark.ts:96-110`
  reports both missing variables in one structured payload;
- exit code is `2`, distinct from `1` (unexpected) and `0` (ok),
  matching `failJson(..., 2)`;
- no real network call was attempted (the env check is the first
  gate after argument parsing).

What is **still unverified** (deferred to an environment with real
credentials):
- whether `business_discovery` returns `followers_count`,
  `media_count`, `like_count`, `comments_count`, `view_count` for an
  external public IG Business / Creator account;
- whether `reposts` is `available` / `unavailable_field` /
  `unavailable_400` / `unavailable_403` / `unavailable_other` on
  that account today;
- whether `sample_media_count` and `raw_response_excerpt` look sane
  in `redactExcerpt` output.

## 8. Live probe — fake username

Same env block as above; the probe never reached the API:

```bash
$ pnpm -F web probe:benchmark -- --username=this_user_should_not_exist_999999
{
  "ok": false,
  "error": "missing_env",
  "missing_env": [
    "META_ACCESS_TOKEN",
    "META_INSTAGRAM_ACCOUNT_ID"
  ],
  "hint": "export the required Meta Graph credentials before running"
}
```

What we cannot tell from this run alone (deferred):
- whether the API returns 400 with `(#100) ... no Instagram Business
  Account` or another error shape for an unknown handle;
- which of `unavailable_400` / `unavailable_403` / `unavailable_other`
  the probe ends up classifying it as.

`probeUsername` (`apps/web/lib/meta/benchmark-probe.ts:150-168`)
already has an explicit early-return branch when
`fetchBusinessDiscovery` fails, marking every account / media field
with the classified status and including the API error in `errors`.
That code path is the one that needs to be exercised with a real
404/400 from Meta.

## 9. Reposts availability — UNKNOWN this session

The doctrine in the migration header is the canonical statement:
reposts is **NULLABLE** in `raw_benchmark_instagram_media`, the
probe records availability per-metric in
`metric_availability` JSONB using `benchmark_metric_status`, and
`REPOST_FIELD_CANDIDATES` is currently `['reposts']` only
(`apps/web/lib/meta/benchmark-probe.ts:42`).

A real run is required to record the actual status today. Until
that run happens, the answer to "is `reposts` available via
Business Discovery?" is **unknown by validation, presumed
unavailable by design**.

## 10. Type-check and build

Both green on the current tree:

```bash
$ pnpm type-check
> tsc --noEmit
# (no output, exit 0)

$ pnpm build
✓ Compiled successfully in 5.4s
✓ Generating static pages using 15 workers (28/28)
```

Build emits one unrelated deprecation warning ("middleware" file
convention → "proxy"); not in scope of this PR.

## 11. Files changed in this commit

- `docs/benchmark-probe-validation.md` (new — this report)

No code changes, no schema changes, no type regeneration, no
persistence wiring, no UI, no HTTP route, no n8n, no dbt change, no
scoring change.

## 12. Can PR 3 start now?

**No.** The PR 2 caveat is not closed. Two things still need to
happen on a host with Docker + the Meta credentials:

1. `pnpm supabase db reset && pnpm db:types`, then a diff confirming
   that the six benchmark symbols listed in §6 now appear in
   `packages/types/supabase.ts`. Commit the regenerated file.
2. One real `--username=<operator-known-public-account>` probe and
   one `--username=this_user_should_not_exist_999999` probe, with
   their JSON outputs pasted back into §7 and §8 of this document
   (and the reposts answer recorded in §9).

Only once those two boxes are checked can PR 3 (DB persistence)
safely start, because PR 3 depends on the regenerated `Database`
types and on knowing whether `reposts` is currently writable from
the API or has to stay null on insert.
