export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          instagram_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          instagram_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          instagram_id?: string
          username?: string
        }
        Relationships: []
      }
      agencies: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          website?: string | null
        }
        Relationships: []
      }
      asset_events: {
        Row: {
          asset_id: string
          duration_ms: number | null
          event_type: Database["public"]["Enums"]["asset_event_type"]
          id: string
          occurred_at: string
          viewer_fingerprint: string | null
        }
        Insert: {
          asset_id: string
          duration_ms?: number | null
          event_type: Database["public"]["Enums"]["asset_event_type"]
          id?: string
          occurred_at?: string
          viewer_fingerprint?: string | null
        }
        Update: {
          asset_id?: string
          duration_ms?: number | null
          event_type?: Database["public"]["Enums"]["asset_event_type"]
          id?: string
          occurred_at?: string
          viewer_fingerprint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          created_at: string
          id: string
          name: string
          papermark_link_id: string | null
          papermark_link_url: string | null
          type: Database["public"]["Enums"]["asset_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          papermark_link_id?: string | null
          papermark_link_url?: string | null
          type: Database["public"]["Enums"]["asset_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          papermark_link_id?: string | null
          papermark_link_url?: string | null
          type?: Database["public"]["Enums"]["asset_type"]
        }
        Relationships: []
      }
      attribution_events: {
        Row: {
          asset_id: string | null
          brand_id: string | null
          event_name: string | null
          id: string
          matched_by: Database["public"]["Enums"]["attribution_match_type"]
          occurred_at: string
          opportunity_id: string | null
          raw_event_id: string
          referrer: string | null
          rule_id: string | null
          url: string
        }
        Insert: {
          asset_id?: string | null
          brand_id?: string | null
          event_name?: string | null
          id?: string
          matched_by: Database["public"]["Enums"]["attribution_match_type"]
          occurred_at: string
          opportunity_id?: string | null
          raw_event_id: string
          referrer?: string | null
          rule_id?: string | null
          url: string
        }
        Update: {
          asset_id?: string | null
          brand_id?: string | null
          event_name?: string | null
          id?: string
          matched_by?: Database["public"]["Enums"]["attribution_match_type"]
          occurred_at?: string
          opportunity_id?: string | null
          raw_event_id?: string
          referrer?: string | null
          rule_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribution_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_events_raw_event_id_fkey"
            columns: ["raw_event_id"]
            isOneToOne: true
            referencedRelation: "raw_umami_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "attribution_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      attribution_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          match_type: Database["public"]["Enums"]["attribution_match_type"]
          pattern: string
          priority: number
          target_id: string
          target_type: Database["public"]["Enums"]["attribution_target_type"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          match_type: Database["public"]["Enums"]["attribution_match_type"]
          pattern: string
          priority?: number
          target_id: string
          target_type: Database["public"]["Enums"]["attribution_target_type"]
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          match_type?: Database["public"]["Enums"]["attribution_match_type"]
          pattern?: string
          priority?: number
          target_id?: string
          target_type?: Database["public"]["Enums"]["attribution_target_type"]
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          automation_name: string
          id: string
          ran_at: string
          result_summary: string | null
          status: Database["public"]["Enums"]["automation_status"]
        }
        Insert: {
          automation_name: string
          id?: string
          ran_at?: string
          result_summary?: string | null
          status: Database["public"]["Enums"]["automation_status"]
        }
        Update: {
          automation_name?: string
          id?: string
          ran_at?: string
          result_summary?: string | null
          status?: Database["public"]["Enums"]["automation_status"]
        }
        Relationships: []
      }
      benchmark_accounts: {
        Row: {
          active: boolean
          cohort: Database["public"]["Enums"]["benchmark_cohort"]
          created_at: string
          display_name: string | null
          id: string
          ig_user_id: string | null
          ig_username: string
          language: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          cohort: Database["public"]["Enums"]["benchmark_cohort"]
          created_at?: string
          display_name?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username: string
          language?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          cohort?: Database["public"]["Enums"]["benchmark_cohort"]
          created_at?: string
          display_name?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username?: string
          language?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      benchmark_sync_runs: {
        Row: {
          accounts_attempted: number
          accounts_succeeded: number
          errors: Json
          fetched_via: string | null
          finished_at: string | null
          id: string
          kind: string
          media_fetched: number
          notes: string | null
          started_at: string
          status: string
        }
        Insert: {
          accounts_attempted?: number
          accounts_succeeded?: number
          errors?: Json
          fetched_via?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          media_fetched?: number
          notes?: string | null
          started_at?: string
          status: string
        }
        Update: {
          accounts_attempted?: number
          accounts_succeeded?: number
          errors?: Json
          fetched_via?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          media_fetched?: number
          notes?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      brand_contacts: {
        Row: {
          brand_id: string
          contact_id: string
        }
        Insert: {
          brand_id: string
          contact_id: string
        }
        Update: {
          brand_id?: string
          contact_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_contacts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_watchlists: {
        Row: {
          active: boolean
          brand_id: string
          id: string
          label: string | null
          last_change_at: string | null
          url: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          id?: string
          label?: string | null
          last_change_at?: string | null
          url: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          id?: string
          label?: string | null
          last_change_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_watchlists_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          aesthetic_fit_score: number | null
          business_fit_score: number | null
          category: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          premium_level: string | null
          status: Database["public"]["Enums"]["brand_status"]
          website: string | null
        }
        Insert: {
          aesthetic_fit_score?: number | null
          business_fit_score?: number | null
          category?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          premium_level?: string | null
          status?: Database["public"]["Enums"]["brand_status"]
          website?: string | null
        }
        Update: {
          aesthetic_fit_score?: number | null
          business_fit_score?: number | null
          category?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          premium_level?: string | null
          status?: Database["public"]["Enums"]["brand_status"]
          website?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company_id: string | null
          company_type: Database["public"]["Enums"]["company_type"] | null
          email: string | null
          full_name: string
          id: string
          instagram_handle: string | null
          last_contact_at: string | null
          linkedin_url: string | null
          next_follow_up_at: string | null
          notes: string | null
          title: string | null
          warmness: number
        }
        Insert: {
          company_id?: string | null
          company_type?: Database["public"]["Enums"]["company_type"] | null
          email?: string | null
          full_name: string
          id?: string
          instagram_handle?: string | null
          last_contact_at?: string | null
          linkedin_url?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          title?: string | null
          warmness?: number
        }
        Update: {
          company_id?: string | null
          company_type?: Database["public"]["Enums"]["company_type"] | null
          email?: string | null
          full_name?: string
          id?: string
          instagram_handle?: string | null
          last_contact_at?: string | null
          linkedin_url?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          title?: string | null
          warmness?: number
        }
        Relationships: []
      }
      content_recommendations: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reason: string
          type: Database["public"]["Enums"]["content_recommendation_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reason: string
          type: Database["public"]["Enums"]["content_recommendation_type"]
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reason?: string
          type?: Database["public"]["Enums"]["content_recommendation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "content_recommendations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_recommendations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_mart_format_performance"
            referencedColumns: ["top_post_id"]
          },
          {
            foreignKeyName: "content_recommendations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_mart_post_performance"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "content_recommendations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_mart_theme_performance"
            referencedColumns: ["top_post_id"]
          },
        ]
      }
      content_themes: {
        Row: {
          description: string | null
          id: string
          name: string
          tags: string[]
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
          tags?: string[]
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          tags?: string[]
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          booking_url: string | null
          brand_id: string | null
          collab_type: string | null
          contact_id: string | null
          currency: string
          deck_id: string | null
          estimated_value: number | null
          expected_close_at: string | null
          id: string
          last_activity_at: string | null
          name: string
          next_action: string | null
          probability: number
          stage: Database["public"]["Enums"]["deal_stage"]
        }
        Insert: {
          booking_url?: string | null
          brand_id?: string | null
          collab_type?: string | null
          contact_id?: string | null
          currency?: string
          deck_id?: string | null
          estimated_value?: number | null
          expected_close_at?: string | null
          id?: string
          last_activity_at?: string | null
          name: string
          next_action?: string | null
          probability?: number
          stage?: Database["public"]["Enums"]["deal_stage"]
        }
        Update: {
          booking_url?: string | null
          brand_id?: string | null
          collab_type?: string | null
          contact_id?: string | null
          currency?: string
          deck_id?: string | null
          estimated_value?: number | null
          expected_close_at?: string | null
          id?: string
          last_activity_at?: string | null
          name?: string
          next_action?: string | null
          probability?: number
          stage?: Database["public"]["Enums"]["deal_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stage_history: {
        Row: {
          changed_at: string
          id: string
          opportunity_id: string
          stage: Database["public"]["Enums"]["deal_stage"]
        }
        Insert: {
          changed_at?: string
          id?: string
          opportunity_id: string
          stage: Database["public"]["Enums"]["deal_stage"]
        }
        Update: {
          changed_at?: string
          id?: string
          opportunity_id?: string
          stage?: Database["public"]["Enums"]["deal_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_history_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      post_content_analysis: {
        Row: {
          analysis_json: Json | null
          analyzed_at: string | null
          confidence: number | null
          created_at: string
          cultural_reference: string | null
          error_message: string | null
          format_pattern: string | null
          humor_type: string | null
          id: string
          input_tokens: number | null
          language: string | null
          model: string
          niche_level: string | null
          output_tokens: number | null
          post_id: string
          primary_theme: string | null
          prompt_version: string
          provider: string
          replication_potential: string | null
          secondary_themes: string[]
          short_reason: string | null
          source_media_url: string | null
          status: Database["public"]["Enums"]["content_analysis_status"]
          updated_at: string
          visible_text: string | null
        }
        Insert: {
          analysis_json?: Json | null
          analyzed_at?: string | null
          confidence?: number | null
          created_at?: string
          cultural_reference?: string | null
          error_message?: string | null
          format_pattern?: string | null
          humor_type?: string | null
          id?: string
          input_tokens?: number | null
          language?: string | null
          model: string
          niche_level?: string | null
          output_tokens?: number | null
          post_id: string
          primary_theme?: string | null
          prompt_version: string
          provider: string
          replication_potential?: string | null
          secondary_themes?: string[]
          short_reason?: string | null
          source_media_url?: string | null
          status?: Database["public"]["Enums"]["content_analysis_status"]
          updated_at?: string
          visible_text?: string | null
        }
        Update: {
          analysis_json?: Json | null
          analyzed_at?: string | null
          confidence?: number | null
          created_at?: string
          cultural_reference?: string | null
          error_message?: string | null
          format_pattern?: string | null
          humor_type?: string | null
          id?: string
          input_tokens?: number | null
          language?: string | null
          model?: string
          niche_level?: string | null
          output_tokens?: number | null
          post_id?: string
          primary_theme?: string | null
          prompt_version?: string
          provider?: string
          replication_potential?: string | null
          secondary_themes?: string[]
          short_reason?: string | null
          source_media_url?: string | null
          status?: Database["public"]["Enums"]["content_analysis_status"]
          updated_at?: string
          visible_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_content_analysis_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_content_analysis_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "v_mart_format_performance"
            referencedColumns: ["top_post_id"]
          },
          {
            foreignKeyName: "post_content_analysis_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "v_mart_post_performance"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_content_analysis_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "v_mart_theme_performance"
            referencedColumns: ["top_post_id"]
          },
        ]
      }
      post_metrics_daily: {
        Row: {
          comments: number
          date: string
          follower_delta: number
          id: string
          impressions: number
          likes: number
          post_id: string
          profile_visits: number
          reach: number
          saves: number
          shares: number
        }
        Insert: {
          comments?: number
          date: string
          follower_delta?: number
          id?: string
          impressions?: number
          likes?: number
          post_id: string
          profile_visits?: number
          reach?: number
          saves?: number
          shares?: number
        }
        Update: {
          comments?: number
          date?: string
          follower_delta?: number
          id?: string
          impressions?: number
          likes?: number
          post_id?: string
          profile_visits?: number
          reach?: number
          saves?: number
          shares?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_metrics_daily_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_metrics_daily_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_mart_format_performance"
            referencedColumns: ["top_post_id"]
          },
          {
            foreignKeyName: "post_metrics_daily_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_mart_post_performance"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_metrics_daily_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_mart_theme_performance"
            referencedColumns: ["top_post_id"]
          },
        ]
      }
      post_tags: {
        Row: {
          created_at: string
          id: string
          post_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          tag: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_mart_format_performance"
            referencedColumns: ["top_post_id"]
          },
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_mart_post_performance"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "v_mart_theme_performance"
            referencedColumns: ["top_post_id"]
          },
        ]
      }
      posts: {
        Row: {
          account_id: string
          caption: string | null
          id: string
          media_id: string
          media_type: Database["public"]["Enums"]["media_type"]
          permalink: string
          posted_at: string
        }
        Insert: {
          account_id: string
          caption?: string | null
          id?: string
          media_id: string
          media_type: Database["public"]["Enums"]["media_type"]
          permalink: string
          posted_at: string
        }
        Update: {
          account_id?: string
          caption?: string | null
          id?: string
          media_id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          permalink?: string
          posted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_benchmark_instagram_account_daily: {
        Row: {
          benchmark_account_id: string
          date: string
          fetched_via: string
          followers_count: number | null
          id: string
          media_count: number | null
          metric_availability: Json
          raw_json: Json
          synced_at: string
        }
        Insert: {
          benchmark_account_id: string
          date: string
          fetched_via: string
          followers_count?: number | null
          id?: string
          media_count?: number | null
          metric_availability?: Json
          raw_json: Json
          synced_at?: string
        }
        Update: {
          benchmark_account_id?: string
          date?: string
          fetched_via?: string
          followers_count?: number | null
          id?: string
          media_count?: number | null
          metric_availability?: Json
          raw_json?: Json
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_benchmark_instagram_account_daily_benchmark_account_id_fkey"
            columns: ["benchmark_account_id"]
            isOneToOne: false
            referencedRelation: "benchmark_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_benchmark_instagram_account_daily_benchmark_account_id_fkey"
            columns: ["benchmark_account_id"]
            isOneToOne: false
            referencedRelation: "v_mart_benchmark_peer_pool"
            referencedColumns: ["benchmark_account_id"]
          },
        ]
      }
      raw_benchmark_instagram_media: {
        Row: {
          benchmark_account_id: string
          comments_count: number | null
          fetched_via: string
          id: string
          like_count: number | null
          media_id: string
          media_type: string | null
          metric_availability: Json
          permalink: string | null
          posted_at: string | null
          raw_json: Json
          reposts: number | null
          synced_at: string
          view_count: number | null
        }
        Insert: {
          benchmark_account_id: string
          comments_count?: number | null
          fetched_via: string
          id?: string
          like_count?: number | null
          media_id: string
          media_type?: string | null
          metric_availability?: Json
          permalink?: string | null
          posted_at?: string | null
          raw_json: Json
          reposts?: number | null
          synced_at?: string
          view_count?: number | null
        }
        Update: {
          benchmark_account_id?: string
          comments_count?: number | null
          fetched_via?: string
          id?: string
          like_count?: number | null
          media_id?: string
          media_type?: string | null
          metric_availability?: Json
          permalink?: string | null
          posted_at?: string | null
          raw_json?: Json
          reposts?: number | null
          synced_at?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_benchmark_instagram_media_benchmark_account_id_fkey"
            columns: ["benchmark_account_id"]
            isOneToOne: false
            referencedRelation: "benchmark_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_benchmark_instagram_media_benchmark_account_id_fkey"
            columns: ["benchmark_account_id"]
            isOneToOne: false
            referencedRelation: "v_mart_benchmark_peer_pool"
            referencedColumns: ["benchmark_account_id"]
          },
        ]
      }
      raw_instagram_account_daily: {
        Row: {
          account_id: string
          date: string
          followers_count: number
          id: string
          impressions: number
          reach: number
          synced_at: string
        }
        Insert: {
          account_id: string
          date: string
          followers_count?: number
          id?: string
          impressions?: number
          reach?: number
          synced_at?: string
        }
        Update: {
          account_id?: string
          date?: string
          followers_count?: number
          id?: string
          impressions?: number
          reach?: number
          synced_at?: string
        }
        Relationships: []
      }
      raw_instagram_audience_demographics: {
        Row: {
          account_id: string
          breakdown: string
          date: string
          fetched_via: string
          id: string
          key: string
          label: string | null
          raw_json: Json
          reason: string | null
          synced_at: string
          threshold_state: string
          timeframe: string
          value: number
        }
        Insert: {
          account_id: string
          breakdown: string
          date: string
          fetched_via?: string
          id?: string
          key: string
          label?: string | null
          raw_json?: Json
          reason?: string | null
          synced_at?: string
          threshold_state: string
          timeframe: string
          value?: number
        }
        Update: {
          account_id?: string
          breakdown?: string
          date?: string
          fetched_via?: string
          id?: string
          key?: string
          label?: string | null
          raw_json?: Json
          reason?: string | null
          synced_at?: string
          threshold_state?: string
          timeframe?: string
          value?: number
        }
        Relationships: []
      }
      raw_instagram_media: {
        Row: {
          account_id: string
          caption: string | null
          id: string
          media_id: string
          media_type: Database["public"]["Enums"]["media_type"]
          permalink: string
          raw_json: Json
          timestamp: string
        }
        Insert: {
          account_id: string
          caption?: string | null
          id?: string
          media_id: string
          media_type: Database["public"]["Enums"]["media_type"]
          permalink: string
          raw_json?: Json
          timestamp: string
        }
        Update: {
          account_id?: string
          caption?: string | null
          id?: string
          media_id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          permalink?: string
          raw_json?: Json
          timestamp?: string
        }
        Relationships: []
      }
      raw_instagram_media_insights: {
        Row: {
          id: string
          media_id: string
          metric_name: string
          period: string
          synced_at: string
          value: number
        }
        Insert: {
          id?: string
          media_id: string
          metric_name: string
          period: string
          synced_at?: string
          value?: number
        }
        Update: {
          id?: string
          media_id?: string
          metric_name?: string
          period?: string
          synced_at?: string
          value?: number
        }
        Relationships: []
      }
      raw_papermark_events: {
        Row: {
          asset_id: string
          duration_ms: number | null
          event_id: string
          event_type: string
          id: string
          occurred_at: string
          viewer_id: string
        }
        Insert: {
          asset_id: string
          duration_ms?: number | null
          event_id: string
          event_type: string
          id?: string
          occurred_at: string
          viewer_id: string
        }
        Update: {
          asset_id?: string
          duration_ms?: number | null
          event_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          viewer_id?: string
        }
        Relationships: []
      }
      raw_umami_events: {
        Row: {
          event_id: string
          event_name: string
          id: string
          occurred_at: string
          referrer: string | null
          session_id: string
          url: string
        }
        Insert: {
          event_id: string
          event_name: string
          id?: string
          occurred_at: string
          referrer?: string | null
          session_id: string
          url: string
        }
        Update: {
          event_id?: string
          event_name?: string
          id?: string
          occurred_at?: string
          referrer?: string | null
          session_id?: string
          url?: string
        }
        Relationships: []
      }
      raw_watchlist_events: {
        Row: {
          change_summary: string
          detected_at: string
          id: string
          url: string
        }
        Insert: {
          change_summary: string
          detected_at?: string
          id?: string
          url: string
        }
        Update: {
          change_summary?: string
          detected_at?: string
          id?: string
          url?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          due_at: string | null
          id: string
          label: string
          linked_brand_id: string | null
          linked_contact_id: string | null
          linked_opportunity_id: string | null
          status: Database["public"]["Enums"]["task_status"]
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          id?: string
          label: string
          linked_brand_id?: string | null
          linked_contact_id?: string | null
          linked_opportunity_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
        }
        Update: {
          created_at?: string
          due_at?: string | null
          id?: string
          label?: string
          linked_brand_id?: string | null
          linked_contact_id?: string | null
          linked_opportunity_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_linked_brand_id_fkey"
            columns: ["linked_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_linked_contact_id_fkey"
            columns: ["linked_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_linked_opportunity_id_fkey"
            columns: ["linked_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      touchpoints: {
        Row: {
          brand_id: string | null
          contact_id: string
          id: string
          note: string | null
          occurred_at: string
          type: Database["public"]["Enums"]["touchpoint_type"]
        }
        Insert: {
          brand_id?: string | null
          contact_id: string
          id?: string
          note?: string | null
          occurred_at?: string
          type: Database["public"]["Enums"]["touchpoint_type"]
        }
        Update: {
          brand_id?: string | null
          contact_id?: string
          id?: string
          note?: string | null
          occurred_at?: string
          type?: Database["public"]["Enums"]["touchpoint_type"]
        }
        Relationships: [
          {
            foreignKeyName: "touchpoints_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "touchpoints_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_summaries: {
        Row: {
          created_at: string
          deals_moved: number
          deck_opens: number
          id: string
          new_leads: number
          reach_delta: number
          saves_delta: number
          week_start: string
        }
        Insert: {
          created_at?: string
          deals_moved?: number
          deck_opens?: number
          id?: string
          new_leads?: number
          reach_delta?: number
          saves_delta?: number
          week_start: string
        }
        Update: {
          created_at?: string
          deals_moved?: number
          deck_opens?: number
          id?: string
          new_leads?: number
          reach_delta?: number
          saves_delta?: number
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_mart_benchmark_peer_percentile: {
        Row: {
          account_count: number | null
          computed_at: string | null
          followers_ceiling: number | null
          followers_floor: number | null
          metric: string | null
          p10: number | null
          p25: number | null
          p50: number | null
          p75: number | null
          p90: number | null
          pool_cohorts: string[] | null
          rates: number[] | null
          sample_size: number | null
        }
        Relationships: []
      }
      v_mart_benchmark_peer_pool: {
        Row: {
          active: boolean | null
          benchmark_account_id: string | null
          cohort: Database["public"]["Enums"]["benchmark_cohort"] | null
          eligible: boolean | null
          followers_count: number | null
          ig_username: string | null
          language: string | null
          latest_snapshot_date: string | null
          media_sample_size: number | null
        }
        Relationships: []
      }
      v_mart_best_posting_windows: {
        Row: {
          avg_reach: number | null
          avg_saves: number | null
          avg_score: number | null
          day_of_week: number | null
          hour: number | null
          low_sample_flag: boolean | null
          media_type: string | null
          period_days: number | null
          post_count: number | null
          sample_confidence: number | null
        }
        Relationships: []
      }
      v_mart_format_performance: {
        Row: {
          avg_comments_per_post: number | null
          avg_likes_per_post: number | null
          avg_profile_visits_per_post: number | null
          avg_reach_per_post: number | null
          avg_saves_per_post: number | null
          avg_score: number | null
          avg_shares_per_post: number | null
          baseline_score: number | null
          media_type: string | null
          period_days: number | null
          post_count: number | null
          top_post_id: string | null
          top_post_score: number | null
          total_comments: number | null
          total_likes: number | null
          total_profile_visits: number | null
          total_reach: number | null
          total_saves: number | null
          total_shares: number | null
        }
        Relationships: []
      }
      v_mart_post_performance: {
        Row: {
          account_id: string | null
          baseline_comments: number | null
          baseline_likes: number | null
          baseline_profile_visits: number | null
          baseline_saves: number | null
          baseline_score: number | null
          baseline_shares: number | null
          caption: string | null
          format_sample_size: number | null
          in_last_30d: boolean | null
          in_last_7d: boolean | null
          in_last_90d: boolean | null
          media_id: string | null
          media_type: string | null
          performance_score: number | null
          permalink: string | null
          post_id: string | null
          posted_at: string | null
          posted_at_local: string | null
          posted_date_local: string | null
          posted_dow: number | null
          posted_hour: number | null
          score_delta: number | null
          tags: string[] | null
          theme_names: string[] | null
          total_comments: number | null
          total_impressions: number | null
          total_likes: number | null
          total_profile_visits: number | null
          total_reach: number | null
          total_saves: number | null
          total_shares: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_mart_theme_performance: {
        Row: {
          avg_reach_per_post: number | null
          avg_saves_per_post: number | null
          avg_score: number | null
          baseline_score: number | null
          is_mapped_theme: boolean | null
          last_posted_at: string | null
          low_sample_flag: boolean | null
          period_days: number | null
          post_count: number | null
          sample_size_confidence: number | null
          theme_id: string | null
          theme_name: string | null
          top_post_id: string | null
          top_post_score: number | null
          total_comments: number | null
          total_likes: number | null
          total_reach: number | null
          total_saves: number | null
          total_shares: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      asset_event_type: "opened" | "completed" | "clicked"
      asset_type:
        | "creator_deck"
        | "case_study"
        | "concept"
        | "proposal"
        | "media_kit"
        | "pitch"
      attribution_match_type:
        | "url_pattern"
        | "utm_source"
        | "referrer"
        | "asset_link_url"
      attribution_target_type: "opportunity" | "brand" | "asset"
      automation_status: "success" | "failed" | "skipped"
      benchmark_cohort:
        | "core_peer"
        | "adjacent_culture"
        | "french_francophone"
        | "aspirational"
      benchmark_metric_status:
        | "available"
        | "unavailable_field"
        | "unavailable_400"
        | "unavailable_403"
        | "unavailable_other"
      brand_status: "cold" | "warm" | "intro" | "active"
      company_type: "brand" | "agency"
      content_analysis_status: "pending" | "completed" | "failed" | "skipped"
      content_recommendation_type: "replicate" | "adapt" | "drop"
      deal_stage:
        | "target_identified"
        | "outreach_drafted"
        | "outreach_sent"
        | "opened"
        | "replied"
        | "concept_shared"
        | "negotiation"
        | "verbal_yes"
        | "won"
        | "lost"
        | "dormant"
      media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"
      task_status: "todo" | "done" | "snoozed"
      touchpoint_type: "email" | "dm" | "call" | "meeting" | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      asset_event_type: ["opened", "completed", "clicked"],
      asset_type: [
        "creator_deck",
        "case_study",
        "concept",
        "proposal",
        "media_kit",
        "pitch",
      ],
      attribution_match_type: [
        "url_pattern",
        "utm_source",
        "referrer",
        "asset_link_url",
      ],
      attribution_target_type: ["opportunity", "brand", "asset"],
      automation_status: ["success", "failed", "skipped"],
      benchmark_cohort: [
        "core_peer",
        "adjacent_culture",
        "french_francophone",
        "aspirational",
      ],
      benchmark_metric_status: [
        "available",
        "unavailable_field",
        "unavailable_400",
        "unavailable_403",
        "unavailable_other",
      ],
      brand_status: ["cold", "warm", "intro", "active"],
      company_type: ["brand", "agency"],
      content_analysis_status: ["pending", "completed", "failed", "skipped"],
      content_recommendation_type: ["replicate", "adapt", "drop"],
      deal_stage: [
        "target_identified",
        "outreach_drafted",
        "outreach_sent",
        "opened",
        "replied",
        "concept_shared",
        "negotiation",
        "verbal_yes",
        "won",
        "lost",
        "dormant",
      ],
      media_type: ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"],
      task_status: ["todo", "done", "snoozed"],
      touchpoint_type: ["email", "dm", "call", "meeting", "other"],
    },
  },
} as const

