// Fichier généré automatiquement via :
// pnpm supabase gen types typescript --local > packages/types/supabase.ts
// Ne pas modifier manuellement — régénérer après chaque migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          instagram_id: string
          username: string
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          instagram_id: string
          username: string
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          instagram_id?: string
          username?: string
          avatar_url?: string | null
          created_at?: string
        }
      }
      posts: {
        Row: {
          id: string
          account_id: string
          media_id: string
          media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
          caption: string | null
          permalink: string
          posted_at: string
        }
        Insert: {
          id?: string
          account_id: string
          media_id: string
          media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
          caption?: string | null
          permalink: string
          posted_at: string
        }
        Update: {
          id?: string
          account_id?: string
          media_id?: string
          media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
          caption?: string | null
          permalink?: string
          posted_at?: string
        }
      }
      brands: {
        Row: {
          id: string
          name: string
          website: string | null
          country: string | null
          category: string | null
          premium_level: string | null
          aesthetic_fit_score: number | null
          business_fit_score: number | null
          status: 'cold' | 'warm' | 'intro' | 'active'
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          website?: string | null
          country?: string | null
          category?: string | null
          premium_level?: string | null
          aesthetic_fit_score?: number | null
          business_fit_score?: number | null
          status?: 'cold' | 'warm' | 'intro' | 'active'
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          website?: string | null
          country?: string | null
          category?: string | null
          premium_level?: string | null
          aesthetic_fit_score?: number | null
          business_fit_score?: number | null
          status?: 'cold' | 'warm' | 'intro' | 'active'
          notes?: string | null
          created_at?: string
        }
      }
      opportunities: {
        Row: {
          id: string
          name: string
          brand_id: string | null
          contact_id: string | null
          collab_type: string | null
          estimated_value: number | null
          currency: string
          stage: string
          probability: number
          expected_close_at: string | null
          last_activity_at: string | null
          next_action: string | null
          deck_id: string | null
        }
        Insert: {
          id?: string
          name: string
          brand_id?: string | null
          contact_id?: string | null
          collab_type?: string | null
          estimated_value?: number | null
          currency?: string
          stage?: string
          probability?: number
          expected_close_at?: string | null
          last_activity_at?: string | null
          next_action?: string | null
          deck_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          brand_id?: string | null
          contact_id?: string | null
          collab_type?: string | null
          estimated_value?: number | null
          currency?: string
          stage?: string
          probability?: number
          expected_close_at?: string | null
          last_activity_at?: string | null
          next_action?: string | null
          deck_id?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
