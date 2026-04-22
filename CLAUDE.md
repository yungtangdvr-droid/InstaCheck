# Creator Hub — Project Memory

## Source of truth

The canonical source of truth for this project is **`MASTER_PROMPT_CREATOR_HUB.md`** at the repository root. It defines the product scope, the 7 operator questions, the fixed stack, the data model, the scoring logic, the sprint ordering, and the non-negotiable rules (compliance, single-tenant, Meta API only).

## Required reading

Before making any change to this repository, Claude must read `MASTER_PROMPT_CREATOR_HUB.md` in full. This file (`CLAUDE.md`) is only a pointer — it does not restate the rules.

## Precedence

If `CLAUDE.md` and `MASTER_PROMPT_CREATOR_HUB.md` ever diverge, **`MASTER_PROMPT_CREATOR_HUB.md` wins**. Treat any conflicting guidance in `CLAUDE.md` as stale and defer to the master prompt.
