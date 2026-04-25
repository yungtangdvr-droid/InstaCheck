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
// POST_SCORE_WEIGHTS lives in @creator-hub/scoring (single source of truth).
// This module owns scoring TYPES only — runtime weights are exported from scoring.

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
  total:     number
  created:   number
  updated:   number
  limit:     number
  processed: number
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
  lastActivityAt?: string
  nextAction?:     string
  deckId?:         string
  bookingUrl?:     string
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

// --- CRM (Sprint 4) ---

export interface Touchpoint {
  id:         string
  contactId:  string | null
  brandId:    string | null
  type:       TouchpointType
  note:       string | null
  occurredAt: string
}

export interface BrandListRow extends Brand {
  contactsCount:    number
  openTasksCount:   number
  lastTouchpointAt: string | null
}

export interface ContactListRow extends Contact {
  brandName: string | null
}

export type TBrandInput = {
  name:               string
  website?:           string
  country?:           string
  category?:          string
  aestheticFitScore?: number
  businessFitScore?:  number
  status?:            BrandStatus
  notes?:             string
}

export type TContactInput = {
  fullName:         string
  email?:           string
  title?:           string
  companyId?:       string
  companyType?:     CompanyType
  linkedinUrl?:     string
  instagramHandle?: string
  warmness?:        number
  nextFollowUpAt?:  string
  notes?:           string
}

export type TTouchpointInput = {
  type:        TouchpointType
  note?:       string
  contactId?:  string
  brandId?:    string
  occurredAt?: string
}

export type TTaskInput = {
  label:           string
  dueAt?:          string
  linkedBrandId?:  string
  linkedContactId?: string
}

// --- Deals (Sprint 5) ---

export interface OpportunityStageEvent {
  id:            string
  opportunityId: string
  stage:         DealStage
  changedAt:     string
}

export interface OpportunityListRow extends Opportunity {
  brandName:      string | null
  contactName:    string | null
  openTasksCount: number
  hasDeck:        boolean
}

export type TOpportunityInput = {
  name:             string
  brandId?:         string
  contactId?:       string
  collabType?:      string
  estimatedValue?:  number
  currency?:        string
  stage?:           DealStage
  probability?:     number
  expectedCloseAt?: string
  nextAction?:      string
  deckId?:          string
}

export type TOpportunityTaskInput = {
  label:                string
  dueAt?:               string
  linkedOpportunityId:  string
  linkedBrandId?:       string
  linkedContactId?:     string
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
  scoreDelta: number
  savesMultiplier: number | null
  // Unclamped weighted ratio of the post vs the 30 d same-format baseline,
  // and its percentile within the currently-ranked set. Both null when no
  // baseline is available. See apps/web/features/analytics/ranking.ts.
  rankScore: number | null
  percentile: number | null
  previewUrl: string | null
  thumbnailUrl: string | null
}

export interface ThemeAggregate {
  themeName: string
  postCount: number
  avgSaves: number
  avgReach: number
  // From mart_theme_performance. True when post_count < 3; UI greys the row.
  lowSampleFlag?: boolean
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

// --- Assets / Deck Tracking (Sprint 6) ---

export type AssetEventType = 'opened' | 'completed' | 'clicked'

export interface Asset {
  id:                string
  name:              string
  type:              AssetType
  papermarkLinkId?:  string
  papermarkLinkUrl?: string
  createdAt:         string
}

export interface AssetEvent {
  id:                string
  assetId:           string
  eventType:         AssetEventType
  viewerFingerprint: string | null
  durationMs:        number | null
  occurredAt:        string
}

export interface AssetListRow extends Asset {
  eventsCount:              number
  openedCount:              number
  lastEventAt:              string | null
  linkedOpportunitiesCount: number
}

export type TAssetInput = {
  name:              string
  type:              AssetType
  papermarkLinkId?:  string
  papermarkLinkUrl?: string
}

export type TRelanceStatus = {
  openedCount:    number
  completedCount: number
  lastEventAt:    string | null
  relanceTaskId:  string | null
  relanceDueAt:   string | null
  relanceDone:    boolean
}

// --- Analytics (Sprint 2) ---

export type TAnalyticsPeriod = 7 | 30 | 90

export type TDailyMetricPoint = {
  date:     string   // ISO date YYYY-MM-DD
  reach:    number
  saves:    number
  shares:   number
  likes:    number
  comments: number
}

export type TFormatSummary = {
  mediaType: string
  count:     number
  reach:     number
  saves:     number
  shares:    number
}

export type TPostingWindow = {
  // 0 = Sun … 6 = Sat (JS Date.getDay convention). The mart emits ISO
  // 1–7 and the analytics fetcher remaps it; see isoDowToSundayFirst.
  dayOfWeek:        number
  hour:             number   // 0–23
  savesAvg:         number
  count:            number
  // post_count / total_posts in the same (period, media_type) slice.
  sampleConfidence: number
  // Mart flag: true when post_count < 2. UI should de-emphasize or exclude.
  lowSample:        boolean
}

export type TTopPost = {
  id:               string
  mediaId:          string
  mediaType:        string
  caption:          string | null
  permalink:        string | null
  postedAt:         string | null
  reach:            number
  saves:            number
  shares:           number
  likes:            number
  comments:         number
  profileVisits:    number
  // Baseline-relative 0–100 score from mart_post_performance (avg ≈ 50).
  // Kept for transparency; the explorer surfaces scoreDelta + multiplier
  // because the upstream score saturates at 100 for many posts.
  score:            number
  // performance_score − baseline_score (≈ 50). Signed, unclamped display.
  scoreDelta:       number
  // total_saves / baseline_saves. Null when the format has no 30d baseline.
  savesMultiplier:  number | null
  // Unclamped UI-side score: weighted sum of per-metric ratios vs same-format
  // 30 d baseline. Null when every baseline is missing. See ranking.ts.
  rankScore:        number | null
  // Percentile rank (0–100) of rankScore within the currently-loaded period.
  percentile:       number | null
  // Meta CDN URL for image / carousel cover, or video thumbnail. Null when
  // raw_instagram_media.raw_json doesn't carry the field. These URLs are
  // signed and expire — treat as a best-effort preview, not an archive.
  previewUrl:       string | null
  // Explicit video thumbnail when distinct from the main media URL. Used for
  // VIDEO / REEL rows where media_url points to the video binary itself.
  thumbnailUrl:     string | null
}

// --- Umami + Attribution (Sprint 7) ---

export type TUmamiEvent = {
  id:             string
  websiteId:      string
  sessionId:      string | null
  createdAt:      string
  urlPath:        string
  urlQuery:       string | null
  referrerDomain: string | null
  referrerPath:   string | null
  eventName:      string | null
}

export type TUmamiFetchParams = {
  startAt: number // ms since epoch
  endAt:   number
  limit?:  number
}

export type AttributionMatchType  = 'url_pattern' | 'utm_source' | 'referrer' | 'asset_link_url'
export type AttributionTargetType = 'opportunity' | 'brand' | 'asset'

export interface AttributionRule {
  id:         string
  label:      string
  matchType:  AttributionMatchType
  pattern:    string
  targetType: AttributionTargetType
  targetId:   string
  priority:   number
  active:     boolean
  createdAt:  string
}

export interface AttributionEvent {
  id:            string
  rawEventId:    string
  ruleId:        string | null
  opportunityId: string | null
  brandId:       string | null
  assetId:       string | null
  matchedBy:     AttributionMatchType
  url:           string
  referrer:      string | null
  eventName:     string | null
  occurredAt:    string
}

export type TAttributionRuleInput = {
  label:      string
  matchType:  AttributionMatchType
  pattern:    string
  targetType: AttributionTargetType
  targetId:   string
  priority?:  number
  active?:    boolean
}

export type TTrafficOverviewRow = {
  key:              string
  kind:             'referrer' | 'url' | 'utm_source'
  clicks:           number
  attributedClicks: number
  sampleUrl:        string | null
}

export type TUmamiSyncSummary = {
  fetched:      number
  inserted:     number
  resolved:     number
  ambiguous:    number
  windowStart:  string
  windowEnd:    string
  durationMs:   number
}

// --- Automations & Reports (Sprint 8) ---

export type CanonicalAutomationName =
  | 'daily-instagram-sync'
  | 'weekly-creator-report'
  | 'papermark-open-alert'
  | 'followup-reminder'
  | 'opportunity-stale-alert'
  | 'brand-watch-digest'
  | 'scoring-refresh'

export const CANONICAL_AUTOMATIONS: ReadonlyArray<CanonicalAutomationName> = [
  'daily-instagram-sync',
  'weekly-creator-report',
  'papermark-open-alert',
  'followup-reminder',
  'opportunity-stale-alert',
  'brand-watch-digest',
  'scoring-refresh',
] as const

export interface AutomationRun {
  id:             string
  automationName: string
  status:         AutomationStatus
  resultSummary:  string | null
  ranAt:          string
}

export interface AutomationSummary {
  name:        string
  canonical:   boolean
  lastRun:     AutomationRun | null
  lastSuccess: AutomationRun | null
  lastFailure: AutomationRun | null
  runs7d:      { success: number; failed: number; skipped: number }
}

export interface WeeklySummary {
  id:          string
  weekStart:   string
  reachDelta:  number
  savesDelta:  number
  newLeads:    number
  dealsMoved:  number
  deckOpens:   number
  createdAt:   string
}

export type TWeeklyReportInput = {
  weekStart?: string  // ISO date (Monday). Defaults to current ISO week.
}

export type TWeeklyReportResult = {
  weekStart:   string
  reachDelta:  number
  savesDelta:  number
  newLeads:    number
  dealsMoved:  number
  deckOpens:   number
  upserted:    boolean
}

export type TStaleOpportunitiesResult = {
  staleCount:        number
  tasksCreated:      number
  skippedAsDuplicate: number
}

export type TFollowupRemindersResult = {
  dueToday: Array<{
    id:                  string
    label:               string
    dueAt:               string | null
    linkedBrandId:       string | null
    linkedOpportunityId: string | null
    linkedContactId:     string | null
  }>
}

// --- Brand Watch (Sprint 9) ---

export interface BrandWatchlist {
  id:           string
  brandId:      string
  url:          string
  label:        string | null
  lastChangeAt: string | null
  active:       boolean
}

export interface WatchlistListRow extends BrandWatchlist {
  brandName:   string
  eventsCount: number
  lastEventAt: string | null
}

export type TWatchlistInput = {
  brandId: string
  url:     string
  label?:  string
  active?: boolean
}

export interface WatchlistEvent {
  id:            string
  url:           string
  changeSummary: string | null
  detectedAt:    string
}

export type ReviewQueueStatus = 'matched' | 'unmatched' | 'ambiguous'

export interface ReviewQueueCandidate {
  watchlistId: string
  brandId:     string
  brandName:   string
  label:       string | null
}

export interface ReviewQueueRow {
  event:      WatchlistEvent
  status:     ReviewQueueStatus
  candidates: ReviewQueueCandidate[]   // length 0 when unmatched, 1 when matched, 2+ when ambiguous
}

export type TBrandWatchDigestResult = {
  windowDays:      number
  totalEvents:     number
  matchedEvents:   number
  ambiguousEvents: number
  unmatchedEvents: number
  activeWatches:   number
}

export type ChangedetectionWebhookPayload = {
  url:               string
  watch_uuid?:       string
  current_snapshot?: string
  diff?:             string
  change_summary?:   string
  detected_at?:      string
}

export type TEventToTaskResult = {
  taskId:  string
  deduped: boolean
}
