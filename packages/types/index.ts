// ============================================================
// Creator Hub — Types partagés
// ============================================================

// --- Utilitaires ---

export type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

// --- Enums / Constantes ---

export type MediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REEL' | 'STORY'

export type BrandStatus = 'cold' | 'warm' | 'intro' | 'active'

export type DealStage =
  | 'target_identified'
  | 'outreach_drafted'
  | 'outreach_sent'
  | 'opened'
  | 'replied'
  | 'concept_shared'
  | 'negotiation'
  | 'verbal_yes'
  | 'won'
  | 'lost'
  | 'dormant'

export type AssetType = 'creator_deck' | 'case_study' | 'concept' | 'proposal' | 'media_kit' | 'pitch'

export type TaskStatus = 'todo' | 'done' | 'snoozed'

export type TouchpointType = 'email' | 'dm' | 'call' | 'meeting' | 'other'

export type CompanyType = 'brand' | 'agency'

export type ContentRecommendationType = 'replicate' | 'adapt' | 'drop'

export type AutomationStatus = 'success' | 'failed' | 'skipped'

// --- Scoring ---

export const POST_SCORE_WEIGHTS = {
  saves:         0.35,
  shares:        0.30,
  comments:      0.15,
  likes:         0.10,
  profileVisits: 0.10,
} as const

export type TPostScore = {
  postId:   string
  score:    number
  baseline: number
  delta:    number
}

export type TBrandFitScore = {
  brandId:          string
  categoryScore:    number
  aestheticScore:   number
  budgetScore:      number
  contactScore:     number
  signalScore:      number
  total:            number
}

export type TOpportunityHealthScore = {
  opportunityId:   string
  recencyPenalty:  number
  deckBonus:       number
  replyBonus:      number
  valueScore:      number
  probability:     number
  total:           number
}

// --- Instagram Graph API ---

export type IGAccountFields = {
  id:              string
  username:        string
  biography:       string
  followers_count: number
  media_count:     number
  profile_picture_url?: string
}

export type IGMediaFields = {
  id:            string
  media_type:    MediaType
  caption?:      string
  permalink:     string
  timestamp:     string
  thumbnail_url?: string
  media_url?:    string
}

export type IGMediaInsight = {
  name:   string
  period: string
  values: Array<{ value: number; end_time?: string }>
  title:  string
  id:     string
}

export type IGInsightsResponse = {
  data: IGMediaInsight[]
}

// --- Sync results ---

export type SyncAccountResult = {
  accountId:   string
  username:    string
  insertedRows: number
}

export type SyncMediaResult = {
  total:   number
  created: number
  updated: number
}

export type SyncInsightsResult = {
  mediaId:       string
  metricsStored: number
}

export type FullSyncResult = {
  account:  SyncAccountResult
  media:    SyncMediaResult
  insights: SyncInsightsResult[]
  errors:   string[]
  durationMs: number
}

// --- Entités métier (vues frontales) ---

export interface Brand {
  id:                string
  name:              string
  website?:          string
  country?:          string
  category?:         string
  premiumLevel:      number
  aestheticFitScore: number
  businessFitScore:  number
  status:            BrandStatus
  notes?:            string
  createdAt:         string
}

export interface Contact {
  id:              string
  fullName:        string
  email?:          string
  title?:          string
  companyId?:      string
  companyType?:    CompanyType
  linkedinUrl?:    string
  instagramHandle?: string
  warmness:        number
  lastContactAt?:  string
  nextFollowUpAt?: string
  notes?:          string
}

export interface Opportunity {
  id:              string
  name:            string
  brandId?:        string
  contactId?:      string
  collabType?:     string
  estimatedValue?: number
  currency:        string
  stage:           DealStage
  probability:     number
  expectedCloseAt?: string
  lastActivityAt:  string
  nextAction?:     string
  deckId?:         string
}

export interface Task {
  id:                  string
  label:               string
  status:              TaskStatus
  dueAt?:              string
  linkedBrandId?:      string
  linkedOpportunityId?: string
  linkedContactId?:    string
  createdAt:           string
}

// --- Content Lab ---

export interface ContentLabPost {
  id: string
  mediaId: string
  mediaType: string
  caption: string | null
  permalink: string | null
  postedAt: string | null
  metrics: {
    saves: number
    shares: number
    comments: number
    likes: number
    profileVisits: number
    reach: number
  }
  tags: string[]
  score: number
}

// PROVISIONAL: inline-computed until mart_theme_performance dbt mart is available
export interface ThemeAggregate {
  themeName: string
  postCount: number
  avgSaves: number
  avgReach: number
}

export interface ContentRecommendation {
  id: string
  postId: string | null
  type: ContentRecommendationType
  reason: string | null
  createdAt: string
  post?: {
    caption: string | null
    mediaType: string
    permalink: string | null
  }
}

// --- n8n webhook payloads ---

export type N8nSyncTriggerPayload = {
  automation: string
  triggeredAt: string
}

// --- Papermark webhook ---

export type PapermarkWebhookPayload = {
  event:    'link.viewed' | 'link.completed'
  linkId:   string
  viewerId: string
  duration?: number
  timestamp: string
}
