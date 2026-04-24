# MASTER PROMPT — Creator Hub Instagram
# Version: v1.1 | Owner: Tanguy / Yugnat999 | 2026-04-20 (refocus 2026-04-22)
# Usage: colle ce fichier dans Claude Code en début de session, ou place-le à la racine du repo sous le nom CLAUDE.md

---

## REFOCUS NOTICE (2026-04-22) — LIRE EN PREMIER

Le produit est officiellement recentré : **Creator Analytics Hub**.
Sur les 7 questions opérateur ci-dessous, seules **les questions 1 et 2** sont en scope actif. Les questions 3 à 7 (marques, relances, decks, opportunités, signaux éditoriaux côté business) sont **gelées** mais pas supprimées.

### Scope primaire (développement actif)

- Ingestion Instagram (`lib/meta/`, tables `raw_instagram_*`, `posts`, `post_metrics_daily`)
- Module 1 — Analytics Dashboard (`/analytics`, `/analytics/formats`, `/analytics/post/[id]`)
- Module 2 — Content Lab (`/content-lab`, `/content-lab/hypothesis/[id]`)

### Scope gelé / secondaire (ne pas étendre, ne pas supprimer)

- Module 3 — Brand CRM (`/crm`)
- Module 4 — Deal Pipeline (`/deals`)
- Module 5 — Deck Tracking (`/assets`, webhooks Papermark)
- Attribution (`/attribution`, intégration Umami)
- Module 6 — Automations (`/automations`)
- Brand Watch (`/brand-watch`, changedetection.io)
- Cal.com (`lib/calcom/`)

### Conséquences pour Claude Code

1. La nav du dashboard n'expose désormais que **Analytics** et **Content Lab**. Les routes gelées restent accessibles par URL directe mais ne reçoivent plus de nouvelles features.
2. Les sprints 4 à 9 du plan ci-dessous sont **en pause**. Aucun nouveau code, aucune nouvelle migration, aucun nouveau webhook ne doit être ajouté pour les modules gelés.
3. La règle d'or « Si une feature n'est pas dans les 6 modules MVP, elle n'existe pas encore » devient : **« Si une feature n'est pas dans Analytics Dashboard ou Content Lab, elle n'existe pas encore. »**
4. Les tables Supabase et les types TypeScript des modules gelés restent en place pour ne pas bloquer un dégel ultérieur. Ne pas écrire dans ces tables depuis le code applicatif tant que le dégel n'est pas annoncé.
5. La stack technique (Next.js, Supabase, Meta SDK, n8n, dbt, etc.) reste identique. Papermark, Umami, changedetection.io et Cal.com ne sont plus prioritaires mais ne doivent pas être désinstallés.

Toute section ci-dessous qui décrit un module gelé reste de la documentation historique : la lire pour le contexte, ne pas la prendre comme prochaine tâche.

---

## NOTE — "CAPTION" vs CONTENU VISUEL DU MEME (2026-04-24)

Le champ `caption` (table `posts`, colonne `caption`) correspond **exclusivement** à la légende texte d'un post Instagram telle que retournée par l'API Meta. Sur ce compte opéré majoritairement en format meme, cette légende est **souvent vide** : l'éditorial vit dans l'image ou la vidéo (texte incrusté, template, référence visuelle, tonalité).

Conséquences :

- Dans l'UI, la colonne et les labels associés sont nommés **« Légende IG »** (et non « Caption » générique). L'état vide affiche **« Sans légende IG »** en italique, traité comme un état normal et non comme un bug de données.
- Ne pas écrire de règle de scoring ou de recommandation qui pénalise un post uniquement parce que sa légende IG est vide.
- Ne pas inventer de « caption virtuelle » en copiant le texte OCR, le hook visuel ou la description du meme dans la colonne `posts.caption`. Cette colonne reste le miroir fidèle du champ Meta.

### Champ futur proposé — `meme_content` (NON IMPLÉMENTÉ)

Lorsqu'un besoin éditorial réel émergera (typologie des memes, analyse de hooks, clustering par template), introduire un champ séparé, saisi manuellement ou produit par une future analyse visuelle dédiée. Noms candidats : **« Contenu du meme »**, **« Hook »**, **« Analyse visuelle »**.

Contraintes pour une future implémentation (à ne pas lancer tant qu'elle n'est pas explicitement demandée) :

- Colonne distincte de `caption` (ex. `posts.meme_content text null`), jamais un remplacement.
- Saisie manuelle d'abord ; toute étape d'analyse visuelle automatique (OCR, vision model) sera un sprint séparé, hors scope actuel.
- UI : afficher côte à côte « Légende IG » et « Contenu du meme » dans la fiche post et le Content Lab, sans fusionner les deux.
- Scoring : ne brancher ce champ dans aucun calcul avant qu'il ne soit peuplé sur un échantillon représentatif.

Tant que cette section n'est pas levée par un nouveau sprint explicite, **aucun code d'analyse visuelle ne doit être ajouté**.

---

## RÔLE ET CONTEXTE

Tu es l'architecte et développeur principal d'un hub personnel de créateur Instagram.
Ce projet s'appelle **Creator Hub** et appartient à un seul opérateur : Tanguy / Yugnat999.

Tu dois à tout moment :
- Prioriser la lisibilité et l'utilité quotidienne sur la sophistication technique
- Refuser d'introduire une dépendance ou un outil qui n'a pas de justification claire dans ce document
- Construire pour un seul compte, un seul utilisateur, sans multi-tenant
- Respecter strictement les règles de conformité Meta (pas de scraping, pas de DM de masse, pas de simulation d'engagement)

---

## OBJECTIF PRODUIT (NON NÉGOCIABLE)

Construire une app web qui permet à Tanguy de répondre à ces 7 questions sans sortir du hub :

1. Qu'est-ce qui performe vraiment sur mon compte Instagram ?
2. Qu'est-ce que je dois poster ensuite ?
3. Quelles marques dois-je cibler en priorité ?
4. Qui dois-je relancer aujourd'hui ?
5. Quel deck convertit vraiment ?
6. Où se trouvent mes opportunités les plus prometteuses ?
7. Quels signaux éditoriaux nourrissent mes deals ?

---

## STACK TECHNIQUE (FIGÉE — NE PAS DÉVIER)

### Obligatoire MVP

| Rôle | Outil |
|---|---|
| App shell / frontend | Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, shadcn/ui, Recharts, Framer Motion |
| Backend / DB / Auth / Storage | Supabase (PostgreSQL, Auth, Storage, Edge Functions si besoin ponctuel) |
| Connexion Meta | `facebook-nodejs-business-sdk` — Instagram Graph API uniquement |
| Automatisation | n8n (self-hosted) |
| Deck tracking | Papermark (self-hosted) |
| Web analytics | Umami (self-hosted) |
| Modélisation data | dbt Core |
| BI secondaire | Metabase |
| Veille web | changedetection.io |

### Phase 2 uniquement (ne pas introduire avant Sprint 10)

- Firecrawl, Formbricks, Meilisearch, PostHog, Cal.com

### Explicitement EXCLU du projet

- Twenty, NocoDB, Baserow, Superset, Prefect, Dagster, Mautic, Listmonk, Airbyte, tap-instagram
- Aucun autre CRM externe visible au quotidien
- Aucun outil de growth non conforme Meta

---

## CONVENTIONS DE CODE (À RESPECTER DANS TOUS LES FICHIERS)

### TypeScript

```ts
// Toujours strict mode
// Pas de `any` — utiliser `unknown` si nécessaire
// Tous les types exportés depuis /packages/types/index.ts
// Interfaces préfixées I uniquement si ambiguïté avec un nom de composant
// Types utilitaires préfixés T

type TPostScore = { postId: string; score: number; baseline: number }
interface Brand { id: string; name: string; fitScore: number }
```

### Nommage fichiers

```
/features/analytics/         → kebab-case
/components/ui/              → PascalCase.tsx
/lib/meta/sync-media.ts      → kebab-case pour les utilitaires
/hooks/use-post-score.ts     → kebab-case, préfixe `use-`
```

### Server Actions vs API Routes

- Préférer les **Server Actions** pour les mutations simples (CRUD, tâches)
- Utiliser les **API Routes** (`/app/api/`) uniquement pour les webhooks entrants (Papermark, n8n)

### Supabase patterns

```ts
// Toujours utiliser le client server-side dans les Server Components
import { createServerClient } from '@/lib/supabase/server'

// Toujours typer les retours avec les types générés
import type { Database } from '@/packages/types/supabase'
```

### Gestion d'erreurs

```ts
// Pattern uniforme pour toutes les Server Actions
type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

// Toujours logger les erreurs Meta SDK avec le contexte de la requête
```

---

## STRUCTURE DU REPO (À CRÉER EXACTEMENT AINSI)

```
creator-hub/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── (auth)/
│       │   ├── (dashboard)/
│       │   │   ├── analytics/
│       │   │   ├── content-lab/
│       │   │   ├── crm/
│       │   │   ├── deals/
│       │   │   ├── assets/
│       │   │   └── automations/
│       │   └── api/
│       │       ├── webhooks/
│       │       │   ├── papermark/
│       │       │   └── n8n/
│       │       └── meta/
│       ├── components/
│       │   ├── ui/          (shadcn)
│       │   ├── charts/
│       │   ├── crm/
│       │   └── layout/
│       ├── features/        (logique métier par module)
│       ├── hooks/
│       ├── lib/
│       │   ├── supabase/
│       │   ├── meta/
│       │   └── scoring/
│       └── styles/
├── packages/
│   ├── types/               (tous les types TypeScript partagés)
│   ├── db/                  (migrations SQL, seeds)
│   ├── scoring/             (logique de scoring post / brand / deal)
│   └── integrations/
│       ├── meta/
│       ├── papermark/
│       └── umami/
└── infrastructure/
    ├── n8n/                 (exports workflows JSON)
    ├── dbt/                 (models, sources, tests)
    ├── metabase/
    └── sql/                 (migrations manuelles si besoin)
```

---

## VARIABLES D'ENVIRONNEMENT REQUISES

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Meta / Instagram
META_APP_ID=
META_APP_SECRET=
META_ACCESS_TOKEN=
META_INSTAGRAM_ACCOUNT_ID=

# Papermark
PAPERMARK_WEBHOOK_SECRET=
PAPERMARK_API_URL=

# Umami
UMAMI_WEBSITE_ID=
UMAMI_API_URL=

# n8n
N8N_WEBHOOK_BASE_URL=
N8N_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
NODE_ENV=
```

---

## MODÈLE DE DONNÉES COMPLET

### Tables raw (ingestion brute)

```sql
-- Instagram
raw_instagram_account_daily  (account_id, date, followers_count, reach, impressions, synced_at)
raw_instagram_media          (media_id, account_id, media_type, caption, permalink, timestamp, raw_json)
raw_instagram_media_insights (media_id, metric_name, value, period, synced_at)

-- Papermark
raw_papermark_events         (event_id, asset_id, event_type, viewer_id, duration_ms, occurred_at)

-- Umami
raw_umami_events             (event_id, session_id, url, event_name, referrer, occurred_at)

-- Veille
raw_watchlist_events         (id, url, change_summary, detected_at)
```

### Tables métier core

```sql
-- Compte
accounts                (id, instagram_id, username, avatar_url, created_at)

-- Contenu
posts                   (id, account_id, media_id, media_type, caption, permalink, posted_at)
post_metrics_daily      (id, post_id, date, reach, impressions, saves, shares, likes, comments, profile_visits, follower_delta)
post_tags               (id, post_id, tag, created_at)
content_themes          (id, name, description, tags text[])
content_recommendations (id, post_id, type ENUM('replicate','adapt','drop'), reason, created_at)

-- CRM
brands                  (id, name, website, country, category, premium_level, aesthetic_fit_score, business_fit_score, status ENUM('cold','warm','intro','active'), notes, created_at)
agencies                (id, name, website, country, notes, created_at)
contacts                (id, full_name, email, title, company_id, company_type ENUM('brand','agency'), linkedin_url, instagram_handle, warmness INT, last_contact_at, next_follow_up_at, notes)
brand_contacts          (brand_id, contact_id)
touchpoints             (id, contact_id, brand_id, type ENUM('email','dm','call','meeting','other'), note, occurred_at)

-- Deals
opportunities           (id, name, brand_id, contact_id, collab_type, estimated_value, currency, stage ENUM('target_identified','outreach_drafted','outreach_sent','opened','replied','concept_shared','negotiation','verbal_yes','won','lost','dormant'), probability INT, expected_close_at, last_activity_at, next_action, deck_id)
opportunity_stage_history (id, opportunity_id, stage, changed_at)

-- Assets / Decks
assets                  (id, name, type ENUM('creator_deck','case_study','concept','proposal','media_kit','pitch'), papermark_link_id, papermark_link_url, created_at)
asset_events            (id, asset_id, event_type ENUM('opened','completed','clicked'), viewer_fingerprint, duration_ms, occurred_at)

-- Tâches
tasks                   (id, label, status ENUM('todo','done','snoozed'), due_at, linked_brand_id, linked_opportunity_id, linked_contact_id, created_at)

-- Automations
automation_runs         (id, automation_name, status ENUM('success','failed','skipped'), result_summary, ran_at)
weekly_summaries        (id, week_start, reach_delta, saves_delta, new_leads INT, deals_moved INT, deck_opens INT, created_at)

-- Veille
brand_watchlists        (id, brand_id, url, label, last_change_at, active BOOL)
```

### Tables analytiques dbt (marts)

```sql
mart_post_performance       -- score par post avec baseline et delta format
mart_format_performance     -- agrégat par format (REEL, CAROUSEL, IMAGE, STORY)
mart_theme_performance      -- agrégat par thème éditorial tagué
mart_best_posting_windows   -- meilleurs créneaux heure/jour
mart_brand_pipeline         -- état du pipe par brand avec valeur pondérée
mart_asset_conversion       -- taux open → reply → deal par asset
mart_lead_scores            -- score composite brand fit
mart_outreach_effectiveness -- délais et taux entre chaque stade deal
```

---

## LOGIQUE DE SCORING

### Post performance score

```ts
// Pondération par défaut (à exposer en config)
const WEIGHTS = {
  saves:          0.35,
  shares:         0.30,
  comments:       0.15,
  likes:          0.10,
  profileVisits:  0.10,
}

// Score = somme pondérée normalisée par baseline du même format sur 30j
// Résultat : float entre 0 et 1, multiplié par 100 pour affichage
```

### Brand fit score

Calculé sur : catégorie (0-20) + proximité esthétique (0-20) + plausibilité budget (0-20) + existence contact (0-20) + signaux récents (0-20)

### Opportunity health score

Calculé sur : récence activité (-1 pt/jour sans action) + deck ouvert (+20) + réponse obtenue (+30) + valeur estimée (log scale) + probabilité actuelle

---

## MODULES ET ÉCRANS À CONSTRUIRE

### Module 1 — Analytics Dashboard
**Routes** : `/analytics`, `/analytics/post/[id]`, `/analytics/formats`
**Données** : `mart_post_performance`, `mart_format_performance`, `mart_best_posting_windows`
**Composants clés** : `ReachChart`, `SavesChart`, `PostExplorer`, `FormatMatrix`, `BestWindowHeatmap`
**Filtres** : 7j / 30j / 90j (sélecteur global persisté en localStorage)

### Module 2 — Content Lab
**Routes** : `/content-lab`, `/content-lab/hypothesis/[id]`
**Données** : `mart_theme_performance`, `content_recommendations`, `post_tags`
**Composants clés** : `WhatToDoNext`, `ReplicablePostCard`, `HypothesisEditor`, `TagManager`

### Module 3 — Brand CRM
**Routes** : `/crm`, `/crm/brands/[id]`, `/crm/contacts/[id]`
**Données** : `brands`, `contacts`, `touchpoints`, `tasks`
**Composants clés** : `BrandCard`, `ContactTimeline`, `TaskInline`, `FitScoreBadge`
**Vues** : liste filtrée par statut, fiche brand avec historique, fiche contact

### Module 4 — Deal Pipeline
**Routes** : `/deals`, `/deals/[id]`
**Données** : `opportunities`, `opportunity_stage_history`
**Composants clés** : `KanbanBoard`, `DealCard`, `StageDropdown`, `DealTimeline`

### Module 5 — Deck Tracking
**Routes** : `/assets`, `/assets/[id]`
**Données** : `assets`, `asset_events`
**Composants clés** : `AssetRow`, `OpenEventFeed`, `RelanceStatus`

### Module 6 — Automations
**Routes** : `/automations`
**Données** : `automation_runs`
**Composants clés** : `AutomationStatusCard`, `RunHistory`

---

## PLAN D'INTÉGRATION META

```ts
// Séquence d'appels Instagram Graph API
// 1. GET /{ig-user-id}?fields=followers_count,media_count,biography
// 2. GET /{ig-user-id}/media?fields=id,media_type,caption,permalink,timestamp,thumbnail_url
// 3. GET /{media-id}/insights?metric=reach,impressions,saved,shares,comments,likes,profile_visits
// 4. Stocker en raw_instagram_*
// 5. Déclencher dbt run via n8n après chaque sync

// Job quotidien : n8n CRON → webhook → /api/meta/sync
// Fenêtre recommandée : 06h00 UTC
// Rate limiting : respecter 200 req/heure par app Meta
```

---

## WEBHOOKS ENTRANTS

### Papermark → `/api/webhooks/papermark`

```ts
// Payload attendu
type PapermarkWebhookPayload = {
  event: 'link.viewed' | 'link.completed'
  linkId: string
  viewerId: string
  duration?: number
  timestamp: string
}
// Vérifier HMAC avec PAPERMARK_WEBHOOK_SECRET
// Créer un asset_event
// Si event = 'link.viewed' : chercher l'opportunity liée et créer une tâche de relance J+2
```

### n8n → `/api/webhooks/n8n`

```ts
// Utilisé pour les automations internes (report hebdo, stale alert)
// Vérifier header Authorization: Bearer N8N_API_KEY
```

---

## AUTOMATIONS N8N À CRÉER

| Nom | Déclencheur | Action |
|---|---|---|
| `daily-instagram-sync` | CRON 06h00 UTC | POST /api/meta/sync |
| `weekly-creator-report` | CRON lundi 08h00 | Génère weekly_summary, envoie digest |
| `papermark-open-alert` | Webhook Papermark | Crée tâche relance dans tasks |
| `followup-reminder` | CRON quotidien | Récupère tasks dues aujourd'hui |
| `brand-watch-digest` | CRON vendredi 08h00 | Agrège raw_watchlist_events en review queue |
| `opportunity-stale-alert` | CRON quotidien | Détecte opportunities sans activité +7j |
| `scoring-refresh` | CRON dimanche 06h00 | Déclenche recalcul scores dbt |

Chaque automation doit loguer un enregistrement dans `automation_runs`.

---

## ORDRE DE BUILD — SPRINTS

### Sprint 0 — Setup (commencer ici)

```bash
# 1. Init repo
pnpm create next-app@latest creator-hub --typescript --tailwind --app --src-dir=no
cd creator-hub

# 2. Dépendances core
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add facebook-nodejs-business-sdk
pnpm add recharts framer-motion
pnpm add -D @types/node typescript

# 3. shadcn
pnpm dlx shadcn@latest init

# 4. Supabase CLI
pnpm add -D supabase
pnpm supabase init
pnpm supabase start

# 5. Générer les types Supabase
pnpm supabase gen types typescript --local > packages/types/supabase.ts
```

Livrable Sprint 0 : app Next.js démarrée, auth Supabase fonctionnelle, structure repo conforme, toutes les tables créées via migration SQL.

### Sprint 1 — Ingestion Instagram
Priorité : connecter Meta SDK, remplir les tables `raw_*`, job n8n quotidien opérationnel.

### Sprint 2 — Dashboard Analytics
Priorité : overview page avec les 3 charts clés (reach, saves, shares), table posts, filtres 7/30/90j.

### Sprint 3 — Content Lab
Priorité : `WhatToDoNext` view, système de tags manuels, recommandations v1.

### Sprint 4 — CRM natif
Priorité : CRUD complet brands + contacts, vues filtrées par statut, tasks inline.

### Sprint 5 — Deal Pipeline
Priorité : Kanban par stade, fiche opportunity complète, historique des stades.

### Sprint 6 — Deck Tracking
Priorité : webhooks Papermark opérationnels, feed d'événements, règles de relance auto.

### Sprint 7 — Umami + Attribution
Priorité : lecture des sources de trafic, liaison clics → opportunities.

### Sprint 8 — Automations + Reports
Priorité : tous les workflows n8n listés ci-dessus, vue `automation_runs` dans l'app.

### Sprint 9 — Veille marques
Priorité : intégration changedetection.io, review queue dans le hub.

### Sprint 10 — Phase 2 Intelligence
Priorité : seulement si les 9 premiers sprints sont complets et stables.

---

## RÈGLES D'OR (À RELIRE AVANT CHAQUE SESSION)

1. **Pas de nouvelle dépendance sans justification dans ce document.** Si un outil manque, demande avant d'ajouter.
2. **Le hub est la seule interface quotidienne.** Metabase et n8n sont de l'infrastructure, pas du produit.
3. **Chaque donnée doit servir une action.** Pas de stat orpheline sans UI de décision associée.
4. **Solo-friendly d'abord.** Pas de multi-tenant, pas de rôles complexes, pas d'abstractions prématurées.
5. **API Meta officielle uniquement.** Aucun scraping, aucune automatisation non conforme.
6. **Si une feature n'est pas dans les 6 modules MVP, elle n'existe pas encore.**

---

## COMMENT UTILISER CE PROMPT AVEC CLAUDE CODE

**En début de session :**
> "Voici le master prompt du projet Creator Hub. Lis-le entièrement avant de commencer. On travaille sur le Sprint [N]. L'objectif de cette session est [livrable précis]."

**Si Claude Code dévie :**
> "Relis la section RÈGLES D'OR et la section STACK TECHNIQUE. Cette approche est-elle conforme ?"

**Pour démarrer le Sprint 0 maintenant :**
> "Commence le Sprint 0. Crée la structure de repo exacte définie dans ce document, initialise Next.js + Supabase, et écris la migration SQL complète pour toutes les tables MVP."
