export type TMediaType = 'REEL' | 'CAROUSEL_ALBUM' | 'IMAGE' | 'STORY'

export type TPeriod = 7 | 30 | 90

export type TPostMetricsDaily = {
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

export type TPost = {
  id: string
  account_id: string
  media_id: string
  media_type: TMediaType
  caption: string | null
  permalink: string
  posted_at: string
}

export type TPostPerformance = {
  post_id: string
  media_type: TMediaType
  caption: string | null
  permalink: string
  posted_at: string
  score: number
  reach: number
  saves: number
  shares: number
  likes: number
  comments: number
  baseline_reach: number
  reach_delta_pct: number
}

export type TDailyMetric = {
  date: string
  value: number
}

export type TChartDataPoint = {
  date: string
  reach: number
  saves: number
  shares: number
}

export type TAnalyticsOverview = {
  chart_data: TChartDataPoint[]
  posts: TPostPerformance[]
  totals: {
    reach: number
    saves: number
    shares: number
    reach_delta_pct: number
    saves_delta_pct: number
    shares_delta_pct: number
  }
}
