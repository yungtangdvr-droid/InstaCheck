export type { Database } from './supabase'

// ─── Raw ingestion ────────────────────────────────────────────────────────────

export type TRawInstagramAccountDaily = {
  account_id: string
  date: string
  followers_count: number
  reach: number
  impressions: number
  synced_at: string
}

export type TRawInstagramMedia = {
  media_id: string
  account_id: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  caption: string | null
  permalink: string
  timestamp: string
  raw_json: Record<string, unknown>
}

export type TRawInstagramMediaInsights = {
  media_id: string
  metric_name: string
  value: number
  period: string
  synced_at: string
}

export type TRawPapermarkEvent = {
  event_id: string
  asset_id: string
  event_type: 'link.viewed' | 'link.completed'
  viewer_id: string
  duration_ms: number | null
  occurred_at: string
}

export type TRawUmamiEvent = {
  event_id: string
  session_id: string
  url: string
  event_name: string
  referrer: string | null
  occurred_at: string
}

export type TRawWatchlistEvent = {
  id: string
  url: string
  change_summary: string
  detected_at: string
}

// ─── Core business ────────────────────────────────────────────────────────────

export interface Account {
  id: string
  instagram_id: string
  username: string
  avatar_url: string | null
  created_at: string
}

export interface Post {
  id: string
  account_id: string
  media_id: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  caption: string | null
  permalink: string
  posted_at: string
}

export interface PostMetricsDaily {
  id: string
  post_id: string
  date: string
  reach: number
  impressions: number
  saves: number
  shares: number
  likes: number
  comments: number
  profile_visits: number
  follower_delta: number
}

export interface PostTag {
  id: string
  post_id: string
  tag: string
  created_at: string
}

export interface ContentTheme {
  id: string
  name: string
  description: string | null
  tags: string[]
}

export type TContentRecommendationType = 'replicate' | 'adapt' | 'drop'

export interface ContentRecommendation {
  id: string
  post_id: string
  type: TContentRecommendationType
  reason: string
  created_at: string
}

// ─── CRM ─────────────────────────────────────────────────────────────────────

export type TBrandStatus = 'cold' | 'warm' | 'intro' | 'active'

export interface Brand {
  id: string
  name: string
  website: string | null
  country: string | null
  category: string | null
  premium_level: string | null
  aesthetic_fit_score: number | null
  business_fit_score: number | null
  status: TBrandStatus
  notes: string | null
  created_at: string
}

export interface Agency {
  id: string
  name: string
  website: string | null
  country: string | null
  notes: string | null
  created_at: string
}

export type TCompanyType = 'brand' | 'agency'

export interface Contact {
  id: string
  full_name: string
  email: string | null
  title: string | null
  company_id: string | null
  company_type: TCompanyType | null
  linkedin_url: string | null
  instagram_handle: string | null
  warmness: number
  last_contact_at: string | null
  next_follow_up_at: string | null
  notes: string | null
}

export interface BrandContact {
  brand_id: string
  contact_id: string
}

export type TTouchpointType = 'email' | 'dm' | 'call' | 'meeting' | 'other'

export interface Touchpoint {
  id: string
  contact_id: string
  brand_id: string | null
  type: TTouchpointType
  note: string | null
  occurred_at: string
}

// ─── Deals ────────────────────────────────────────────────────────────────────

export type TDealStage =
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

export interface Opportunity {
  id: string
  name: string
  brand_id: string | null
  contact_id: string | null
  collab_type: string | null
  estimated_value: number | null
  currency: string
  stage: TDealStage
  probability: number
  expected_close_at: string | null
  last_activity_at: string | null
  next_action: string | null
  deck_id: string | null
}

export interface OpportunityStageHistory {
  id: string
  opportunity_id: string
  stage: TDealStage
  changed_at: string
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export type TAssetType = 'creator_deck' | 'case_study' | 'concept' | 'proposal' | 'media_kit' | 'pitch'
export type TAssetEventType = 'opened' | 'completed' | 'clicked'

export interface Asset {
  id: string
  name: string
  type: TAssetType
  papermark_link_id: string | null
  papermark_link_url: string | null
  created_at: string
}

export interface AssetEvent {
  id: string
  asset_id: string
  event_type: TAssetEventType
  viewer_fingerprint: string | null
  duration_ms: number | null
  occurred_at: string
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export type TTaskStatus = 'todo' | 'done' | 'snoozed'

export interface Task {
  id: string
  label: string
  status: TTaskStatus
  due_at: string | null
  linked_brand_id: string | null
  linked_opportunity_id: string | null
  linked_contact_id: string | null
  created_at: string
}

// ─── Automations ──────────────────────────────────────────────────────────────

export type TAutomationStatus = 'success' | 'failed' | 'skipped'

export interface AutomationRun {
  id: string
  automation_name: string
  status: TAutomationStatus
  result_summary: string | null
  ran_at: string
}

export interface WeeklySummary {
  id: string
  week_start: string
  reach_delta: number
  saves_delta: number
  new_leads: number
  deals_moved: number
  deck_opens: number
  created_at: string
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export interface BrandWatchlist {
  id: string
  brand_id: string
  url: string
  label: string | null
  last_change_at: string | null
  active: boolean
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export type TPostScore = {
  postId: string
  score: number
  baseline: number
}

export type TBrandFitScore = {
  brandId: string
  category: number
  aesthetic: number
  budget: number
  contactExists: number
  recentSignals: number
  total: number
}

export type TOpportunityHealth = {
  opportunityId: string
  score: number
  daysSinceActivity: number
  deckOpened: boolean
  replyReceived: boolean
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export type PapermarkWebhookPayload = {
  event: 'link.viewed' | 'link.completed'
  linkId: string
  viewerId: string
  duration?: number
  timestamp: string
}
