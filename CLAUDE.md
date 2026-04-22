# Creator Hub — Project Memory

## Current product focus (2026-04-22)

Creator Hub has been refocused as a **Creator Analytics Hub**. The product is now a decision-support tool for one Instagram operator, narrowed to:

**Primary scope (active development):**
- Instagram ingestion (Meta Graph API → `raw_instagram_*`, `posts`, `post_metrics_daily`)
- Analytics dashboard (`/analytics`, `/analytics/formats`, `/analytics/post/[id]`)
- Content lab (`/content-lab`, `/content-lab/hypothesis/[id]`)

**Frozen / secondary scope (do not extend, do not delete):**
- CRM (`/crm`)
- Deals (`/deals`)
- Assets / deck tracking (`/assets`, Papermark integration)
- Attribution (`/attribution`, Umami pipeline)
- Automations UI (`/automations`)
- Brand watch (`/brand-watch`, changedetection.io)
- Cal.com booking (`lib/calcom/`)

Frozen modules remain on disk and in the database, but their nav entries are hidden and no new features should be added to them in this phase. The 7-question framing in `MASTER_PROMPT_CREATOR_HUB.md` still applies, but only questions 1 ("what performs?") and 2 ("what to post next?") are in active scope.

## Source of truth

The canonical source of truth for this project is **`MASTER_PROMPT_CREATOR_HUB.md`** at the repository root. It defines the full original product scope, the fixed stack, the data model, the scoring logic, and the non-negotiable rules (compliance, single-tenant, Meta API only). The **REFOCUS NOTICE** at the top of that file lists which sections are paused.

## Required reading

Before making any change to this repository, Claude must read `MASTER_PROMPT_CREATOR_HUB.md` in full, including its REFOCUS NOTICE. This file (`CLAUDE.md`) is a pointer — it does not restate the rules.

## Precedence

If `CLAUDE.md` and `MASTER_PROMPT_CREATOR_HUB.md` ever diverge on **stack, data model, or compliance rules**, `MASTER_PROMPT_CREATOR_HUB.md` wins. On **current product scope and which modules are active**, this `CLAUDE.md` and the REFOCUS NOTICE in the master prompt are authoritative — the historical sprint plan in the master prompt is paused for frozen modules.
