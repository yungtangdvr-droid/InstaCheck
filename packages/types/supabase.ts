// Types générés depuis le schéma Supabase
// Régénérer avec : pnpm db:types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Row<T extends Record<string, unknown>> = T
type Insert<T extends Record<string, unknown>> = T
type Update<T extends Record<string, unknown>> = Partial<T>

export interface Database {
  public: {
    Tables: {
      raw_instagram_account_daily: {
        Row: Row<{
          id:              string
          account_id:      string
          date:            string
          followers_count: number | null
          reach:           number | null
          impressions:     number | null
          synced_at:       string
        }>
        Insert: Insert<{
          id?:             string
          account_id:      string
          date:            string
          followers_count?: number | null
          reach?:          number | null
          impressions?:    number | null
          synced_at?:      string
        }>
        Update: Update<Database['public']['Tables']['raw_instagram_account_daily']['Insert']>
        Relationships: []
      }
      raw_instagram_media: {
        Row: Row<{
          id:         string
          media_id:   string
          account_id: string
          media_type: string | null
          caption:    string | null
          permalink:  string | null
          timestamp:  string | null
          raw_json:   Json | null
          synced_at:  string
        }>
        Insert: Insert<{
          id?:        string
          media_id:   string
          account_id: string
          media_type?: string | null
          caption?:   string | null
          permalink?: string | null
          timestamp?: string | null
          raw_json?:  Json | null
          synced_at?: string
        }>
        Update: Update<Database['public']['Tables']['raw_instagram_media']['Insert']>
        Relationships: []
      }
      raw_instagram_media_insights: {
        Row: Row<{
          id:          string
          media_id:    string
          metric_name: string
          value:       number | null
          period:      string | null
          synced_at:   string
        }>
        Insert: Insert<{
          id?:         string
          media_id:    string
          metric_name: string
          value?:      number | null
          period?:     string | null
          synced_at?:  string
        }>
        Update: Update<Database['public']['Tables']['raw_instagram_media_insights']['Insert']>
        Relationships: []
      }
      raw_papermark_events: {
        Row: Row<{
          id:          string
          event_id:    string
          asset_id:    string
          event_type:  string
          viewer_id:   string | null
          duration_ms: number | null
          occurred_at: string
        }>
        Insert: Insert<{
          id?:         string
          event_id:    string
          asset_id:    string
          event_type:  string
          viewer_id?:  string | null
          duration_ms?: number | null
          occurred_at: string
        }>
        Update: Update<Database['public']['Tables']['raw_papermark_events']['Insert']>
        Relationships: []
      }
      raw_umami_events: {
        Row: Row<{
          id:          string
          event_id:    string
          session_id:  string | null
          url:         string | null
          event_name:  string | null
          referrer:    string | null
          occurred_at: string
        }>
        Insert: Insert<{
          id?:         string
          event_id:    string
          session_id?: string | null
          url?:        string | null
          event_name?: string | null
          referrer?:   string | null
          occurred_at: string
        }>
        Update: Update<Database['public']['Tables']['raw_umami_events']['Insert']>
        Relationships: []
      }
      raw_watchlist_events: {
        Row: Row<{
          id:             string
          url:            string
          change_summary: string | null
          detected_at:    string
        }>
        Insert: Insert<{
          id?:             string
          url:             string
          change_summary?: string | null
          detected_at:     string
        }>
        Update: Update<Database['public']['Tables']['raw_watchlist_events']['Insert']>
        Relationships: []
      }
      accounts: {
        Row: Row<{
          id:           string
          instagram_id: string
          username:     string
          avatar_url:   string | null
          created_at:   string
        }>
        Insert: Insert<{
          id?:          string
          instagram_id: string
          username:     string
          avatar_url?:  string | null
          created_at?:  string
        }>
        Update: Update<Database['public']['Tables']['accounts']['Insert']>
        Relationships: []
      }
      posts: {
        Row: Row<{
          id:         string
          account_id: string
          media_id:   string
          media_type: string
          caption:    string | null
          permalink:  string | null
          posted_at:  string | null
        }>
        Insert: Insert<{
          id?:        string
          account_id: string
          media_id:   string
          media_type: string
          caption?:   string | null
          permalink?: string | null
          posted_at?: string | null
        }>
        Update: Update<Database['public']['Tables']['posts']['Insert']>
        Relationships: []
      }
      post_metrics_daily: {
        Row: Row<{
          id:             string
          post_id:        string
          date:           string
          reach:          number
          impressions:    number
          saves:          number
          shares:         number
          likes:          number
          comments:       number
          profile_visits: number
          follower_delta: number
        }>
        Insert: Insert<{
          id?:             string
          post_id:         string
          date:            string
          reach?:          number
          impressions?:    number
          saves?:          number
          shares?:         number
          likes?:          number
          comments?:       number
          profile_visits?: number
          follower_delta?: number
        }>
        Update: Update<Database['public']['Tables']['post_metrics_daily']['Insert']>
        Relationships: []
      }
      post_tags: {
        Row: Row<{
          id:         string
          post_id:    string
          tag:        string
          created_at: string
        }>
        Insert: Insert<{
          id?:        string
          post_id:    string
          tag:        string
          created_at?: string
        }>
        Update: Update<Database['public']['Tables']['post_tags']['Insert']>
        Relationships: []
      }
      content_themes: {
        Row: Row<{
          id:          string
          name:        string
          description: string | null
          tags:        string[]
        }>
        Insert: Insert<{
          id?:          string
          name:         string
          description?: string | null
          tags?:        string[]
        }>
        Update: Update<Database['public']['Tables']['content_themes']['Insert']>
        Relationships: []
      }
      content_recommendations: {
        Row: Row<{
          id:         string
          post_id:    string | null
          type:       string
          reason:     string | null
          created_at: string
        }>
        Insert: Insert<{
          id?:        string
          post_id?:   string | null
          type:       string
          reason?:    string | null
          created_at?: string
        }>
        Update: Update<Database['public']['Tables']['content_recommendations']['Insert']>
        Relationships: []
      }
      brands: {
        Row: Row<{
          id:                  string
          name:                string
          website:             string | null
          country:             string | null
          category:            string | null
          premium_level:       number
          aesthetic_fit_score: number
          business_fit_score:  number
          status:              string
          notes:               string | null
          created_at:          string
        }>
        Insert: Insert<{
          id?:                  string
          name:                 string
          website?:             string | null
          country?:             string | null
          category?:            string | null
          premium_level?:       number
          aesthetic_fit_score?: number
          business_fit_score?:  number
          status?:              string
          notes?:               string | null
          created_at?:          string
        }>
        Update: Update<Database['public']['Tables']['brands']['Insert']>
        Relationships: []
      }
      agencies: {
        Row: Row<{
          id:         string
          name:       string
          website:    string | null
          country:    string | null
          notes:      string | null
          created_at: string
        }>
        Insert: Insert<{
          id?:       string
          name:      string
          website?:  string | null
          country?:  string | null
          notes?:    string | null
          created_at?: string
        }>
        Update: Update<Database['public']['Tables']['agencies']['Insert']>
        Relationships: []
      }
      contacts: {
        Row: Row<{
          id:                string
          full_name:         string
          email:             string | null
          title:             string | null
          company_id:        string | null
          company_type:      string | null
          linkedin_url:      string | null
          instagram_handle:  string | null
          warmness:          number
          last_contact_at:   string | null
          next_follow_up_at: string | null
          notes:             string | null
        }>
        Insert: Insert<{
          id?:                string
          full_name:          string
          email?:             string | null
          title?:             string | null
          company_id?:        string | null
          company_type?:      string | null
          linkedin_url?:      string | null
          instagram_handle?:  string | null
          warmness?:          number
          last_contact_at?:   string | null
          next_follow_up_at?: string | null
          notes?:             string | null
        }>
        Update: Update<Database['public']['Tables']['contacts']['Insert']>
        Relationships: []
      }
      brand_contacts: {
        Row: Row<{
          brand_id:   string
          contact_id: string
        }>
        Insert: Insert<{
          brand_id:   string
          contact_id: string
        }>
        Update: Update<Database['public']['Tables']['brand_contacts']['Insert']>
        Relationships: []
      }
      touchpoints: {
        Row: Row<{
          id:          string
          contact_id:  string | null
          brand_id:    string | null
          type:        string
          note:        string | null
          occurred_at: string
        }>
        Insert: Insert<{
          id?:         string
          contact_id?: string | null
          brand_id?:   string | null
          type:        string
          note?:       string | null
          occurred_at?: string
        }>
        Update: Update<Database['public']['Tables']['touchpoints']['Insert']>
        Relationships: []
      }
      opportunities: {
        Row: Row<{
          id:               string
          name:             string
          brand_id:         string | null
          contact_id:       string | null
          collab_type:      string | null
          estimated_value:  number | null
          currency:         string
          stage:            string
          probability:      number
          expected_close_at: string | null
          last_activity_at:  string
          next_action:       string | null
          deck_id:           string | null
          booking_url:       string | null
        }>
        Insert: Insert<{
          id?:               string
          name:              string
          brand_id?:         string | null
          contact_id?:       string | null
          collab_type?:      string | null
          estimated_value?:  number | null
          currency?:         string
          stage?:            string
          probability?:      number
          expected_close_at?: string | null
          last_activity_at?:  string
          next_action?:       string | null
          deck_id?:           string | null
          booking_url?:       string | null
        }>
        Update: Update<Database['public']['Tables']['opportunities']['Insert']>
        Relationships: []
      }
      opportunity_stage_history: {
        Row: Row<{
          id:             string
          opportunity_id: string
          stage:          string
          changed_at:     string
        }>
        Insert: Insert<{
          id?:             string
          opportunity_id:  string
          stage:           string
          changed_at?:     string
        }>
        Update: Update<Database['public']['Tables']['opportunity_stage_history']['Insert']>
        Relationships: []
      }
      assets: {
        Row: Row<{
          id:                 string
          name:               string
          type:               string
          papermark_link_id:  string | null
          papermark_link_url: string | null
          created_at:         string
        }>
        Insert: Insert<{
          id?:                 string
          name:                string
          type:                string
          papermark_link_id?:  string | null
          papermark_link_url?: string | null
          created_at?:         string
        }>
        Update: Update<Database['public']['Tables']['assets']['Insert']>
        Relationships: []
      }
      asset_events: {
        Row: Row<{
          id:                 string
          asset_id:           string
          event_type:         string
          viewer_fingerprint: string | null
          duration_ms:        number | null
          occurred_at:        string
        }>
        Insert: Insert<{
          id?:                 string
          asset_id:            string
          event_type:          string
          viewer_fingerprint?: string | null
          duration_ms?:        number | null
          occurred_at:         string
        }>
        Update: Update<Database['public']['Tables']['asset_events']['Insert']>
        Relationships: []
      }
      tasks: {
        Row: Row<{
          id:                     string
          label:                  string
          status:                 string
          due_at:                 string | null
          linked_brand_id:        string | null
          linked_opportunity_id:  string | null
          linked_contact_id:      string | null
          created_at:             string
        }>
        Insert: Insert<{
          id?:                     string
          label:                   string
          status?:                 string
          due_at?:                 string | null
          linked_brand_id?:        string | null
          linked_opportunity_id?:  string | null
          linked_contact_id?:      string | null
          created_at?:             string
        }>
        Update: Update<Database['public']['Tables']['tasks']['Insert']>
        Relationships: []
      }
      automation_runs: {
        Row: Row<{
          id:               string
          automation_name:  string
          status:           string
          result_summary:   string | null
          ran_at:           string
        }>
        Insert: Insert<{
          id?:              string
          automation_name:  string
          status:           string
          result_summary?:  string | null
          ran_at?:          string
        }>
        Update: Update<Database['public']['Tables']['automation_runs']['Insert']>
        Relationships: []
      }
      weekly_summaries: {
        Row: Row<{
          id:           string
          week_start:   string
          reach_delta:  number
          saves_delta:  number
          new_leads:    number
          deals_moved:  number
          deck_opens:   number
          created_at:   string
        }>
        Insert: Insert<{
          id?:          string
          week_start:   string
          reach_delta?: number
          saves_delta?: number
          new_leads?:   number
          deals_moved?: number
          deck_opens?:  number
          created_at?:  string
        }>
        Update: Update<Database['public']['Tables']['weekly_summaries']['Insert']>
        Relationships: []
      }
      brand_watchlists: {
        Row: Row<{
          id:             string
          brand_id:       string | null
          url:            string
          label:          string | null
          last_change_at: string | null
          active:         boolean
        }>
        Insert: Insert<{
          id?:             string
          brand_id?:       string | null
          url:             string
          label?:          string | null
          last_change_at?: string | null
          active?:         boolean
        }>
        Update: Update<Database['public']['Tables']['brand_watchlists']['Insert']>
        Relationships: []
      }
      attribution_rules: {
        Row: Row<{
          id:          string
          label:       string
          match_type:  string
          pattern:     string
          target_type: string
          target_id:   string
          priority:    number
          active:      boolean
          created_at:  string
        }>
        Insert: Insert<{
          id?:         string
          label:       string
          match_type:  string
          pattern:     string
          target_type: string
          target_id:   string
          priority?:   number
          active?:     boolean
          created_at?: string
        }>
        Update: Update<Database['public']['Tables']['attribution_rules']['Insert']>
        Relationships: []
      }
      attribution_events: {
        Row: Row<{
          id:             string
          raw_event_id:   string
          rule_id:        string | null
          opportunity_id: string | null
          brand_id:       string | null
          asset_id:       string | null
          matched_by:     string
          url:            string
          referrer:       string | null
          event_name:     string | null
          occurred_at:    string
        }>
        Insert: Insert<{
          id?:             string
          raw_event_id:    string
          rule_id?:        string | null
          opportunity_id?: string | null
          brand_id?:       string | null
          asset_id?:       string | null
          matched_by:      string
          url:             string
          referrer?:       string | null
          event_name?:     string | null
          occurred_at:     string
        }>
        Update: Update<Database['public']['Tables']['attribution_events']['Insert']>
        Relationships: []
      }
    }
    Views: {
      // dbt mart surfaces. These are read-only views defined in
      // supabase/migrations/0004_mart_views.sql that forward `select *`
      // from marts.mart_*. Shape must stay in sync with
      // infrastructure/dbt/models/marts/*.sql.
      v_mart_post_performance: {
        Row: Row<{
          post_id:                  string
          account_id:               string
          media_id:                 string
          media_type:               string
          caption:                  string | null
          permalink:                string | null
          posted_at:                string | null
          posted_at_local:          string | null
          posted_date_local:        string | null
          posted_dow:               number | null
          posted_hour:              number | null
          in_last_7d:               boolean
          in_last_30d:              boolean
          in_last_90d:              boolean
          tags:                     string[]
          theme_names:              string[]
          total_reach:              number
          total_impressions:        number
          total_saves:              number
          total_shares:             number
          total_likes:              number
          total_comments:           number
          total_profile_visits:     number
          baseline_saves:           number | null
          baseline_shares:          number | null
          baseline_comments:        number | null
          baseline_likes:           number | null
          baseline_profile_visits:  number | null
          format_sample_size:       number
          performance_score:        number
          baseline_score:           number
          score_delta:              number
        }>
        Relationships: []
      }
      v_mart_format_performance: {
        Row: Row<{
          media_type:                  string
          period_days:                 number
          post_count:                  number
          total_reach:                 number
          total_saves:                 number
          total_shares:                number
          total_likes:                 number
          total_comments:              number
          total_profile_visits:        number
          avg_reach_per_post:          number
          avg_saves_per_post:          number
          avg_shares_per_post:         number
          avg_likes_per_post:          number
          avg_comments_per_post:       number
          avg_profile_visits_per_post: number
          avg_score:                   number
          baseline_score:              number
          top_post_id:                 string | null
          top_post_score:              number | null
        }>
        Relationships: []
      }
      v_mart_theme_performance: {
        Row: Row<{
          theme_name:              string
          theme_id:                string | null
          is_mapped_theme:         boolean
          period_days:             number
          post_count:              number
          total_saves:             number
          total_reach:             number
          total_shares:            number
          total_likes:             number
          total_comments:          number
          avg_saves_per_post:      number
          avg_reach_per_post:      number
          avg_score:               number
          baseline_score:          number
          last_posted_at:          string | null
          top_post_id:             string | null
          top_post_score:          number | null
          low_sample_flag:         boolean
          sample_size_confidence:  number
        }>
        Relationships: []
      }
      v_mart_best_posting_windows: {
        Row: Row<{
          // day_of_week is ISO 1–7 (1 = Monday … 7 = Sunday) in Europe/Paris.
          // The app converts to 0–6 Sunday-first in getPostingWindows.
          period_days:       number
          day_of_week:       number
          hour:              number
          media_type:        string | null
          post_count:        number
          avg_saves:         number
          avg_reach:         number
          avg_score:         number
          sample_confidence: number
          low_sample_flag:   boolean
        }>
        Relationships: []
      }
    }
    Functions:      Record<string, never>
    Enums:          Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
