export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      administrative_divisions: {
        Row: {
          code: string | null
          country_id: string
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
          parent_division_id: string | null
          sort_order: number | null
          type_id: string
        }
        Insert: {
          code?: string | null
          country_id: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          parent_division_id?: string | null
          sort_order?: number | null
          type_id: string
        }
        Update: {
          code?: string | null
          country_id?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          parent_division_id?: string | null
          sort_order?: number | null
          type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "administrative_divisions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_divisions_parent_division_id_fkey"
            columns: ["parent_division_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_divisions_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "division_types"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          id: string
          iso2: string
          iso3: string
          lat: number | null
          lng: number | null
          name: string
        }
        Insert: {
          id?: string
          iso2: string
          iso3: string
          lat?: number | null
          lng?: number | null
          name: string
        }
        Update: {
          id?: string
          iso2?: string
          iso3?: string
          lat?: number | null
          lng?: number | null
          name?: string
        }
        Relationships: []
      }
      country_stats: {
        Row: {
          circle_count: number
          duo_count: number
          iso3: string
          lat: number | null
          lng: number | null
          memory_count: number
          name: string
          song_count: number
          updated_at: string
          vault_count: number
        }
        Insert: {
          circle_count?: number
          duo_count?: number
          iso3: string
          lat?: number | null
          lng?: number | null
          memory_count?: number
          name: string
          song_count?: number
          updated_at?: string
          vault_count?: number
        }
        Update: {
          circle_count?: number
          duo_count?: number
          iso3?: string
          lat?: number | null
          lng?: number | null
          memory_count?: number
          name?: string
          song_count?: number
          updated_at?: string
          vault_count?: number
        }
        Relationships: []
      }
      division_types: {
        Row: {
          country_id: string
          id: string
          level: number
          name: string
        }
        Insert: {
          country_id: string
          id?: string
          level: number
          name: string
        }
        Update: {
          country_id?: string
          id?: string
          level?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "division_types_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      member_secrets: {
        Row: {
          member_id: string
          secret_hash: string
          set_at: string
        }
        Insert: {
          member_id: string
          secret_hash: string
          set_at?: string
        }
        Update: {
          member_id?: string
          secret_hash?: string
          set_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_secrets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          avatar_color: string
          avatar_url: string | null
          display_name: string
          id: string
          joined_at: string
          name_changed_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: string
          user_id: string
          vault_id: string
        }
        Insert: {
          avatar_color: string
          avatar_url?: string | null
          display_name: string
          id?: string
          joined_at?: string
          name_changed_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          user_id: string
          vault_id: string
        }
        Update: {
          avatar_color?: string
          avatar_url?: string | null
          display_name?: string
          id?: string
          joined_at?: string
          name_changed_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          user_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_revoked_by_same_vault_fk"
            columns: ["revoked_by", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "members_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_events: {
        Row: {
          actor_member_id: string | null
          created_at: string
          event_type: string
          id: string
          new_user_id: string | null
          previous_user_id: string | null
          subject_member_id: string | null
          vault_id: string
        }
        Insert: {
          actor_member_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_user_id?: string | null
          previous_user_id?: string | null
          subject_member_id?: string | null
          vault_id: string
        }
        Update: {
          actor_member_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_user_id?: string | null
          previous_user_id?: string | null
          subject_member_id?: string | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_events_actor_same_vault_fk"
            columns: ["actor_member_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "membership_events_subject_same_vault_fk"
            columns: ["subject_member_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "membership_events_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          content: string | null
          created_at: string
          id: string
          kind: string
          media_url: string | null
          member_id: string
          song_id: string | null
          unlock_at: string | null
          vault_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          kind: string
          media_url?: string | null
          member_id: string
          song_id?: string | null
          unlock_at?: string | null
          vault_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          media_url?: string | null
          member_id?: string
          song_id?: string | null
          unlock_at?: string | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_member_same_vault_fk"
            columns: ["member_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "memories_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_song_same_vault_fk"
            columns: ["song_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "memories_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_capsule_payloads: {
        Row: {
          content: string
          created_at: string
          memory_id: string
          unlock_at: string
          vault_id: string
        }
        Insert: {
          content: string
          created_at?: string
          memory_id: string
          unlock_at: string
          vault_id: string
        }
        Update: {
          content?: string
          created_at?: string
          memory_id?: string
          unlock_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsule_memory_same_vault_fk"
            columns: ["memory_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "memory_capsule_payloads_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: true
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_capsule_payloads_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          member_id: string
          memory_id: string
          vault_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          member_id: string
          memory_id: string
          vault_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          member_id?: string
          memory_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_replies_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_replies_member_same_vault_fk"
            columns: ["member_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "memory_replies_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_replies_memory_same_vault_fk"
            columns: ["memory_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id", "vault_id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string | null
          id: string
          member_id: string
          message_id: string
          sticker_id: string | null
          vault_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          id?: string
          member_id: string
          message_id: string
          sticker_id?: string | null
          vault_id: string
        }
        Update: {
          created_at?: string
          emoji?: string | null
          id?: string
          member_id?: string
          message_id?: string
          sticker_id?: string | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_member_same_vault_fk"
            columns: ["member_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "message_reactions_message_same_vault_fk"
            columns: ["message_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "message_reactions_sticker_same_vault_fk"
            columns: ["sticker_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "vault_stickers"
            referencedColumns: ["id", "vault_id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          member_id: string
          vault_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          member_id: string
          vault_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          member_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_member_same_vault_fk"
            columns: ["member_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "messages_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          blocked_until: string | null
          bucket_key: string
          hit_count: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          blocked_until?: string | null
          bucket_key: string
          hit_count?: number
          updated_at?: string
          window_started_at: string
        }
        Update: {
          blocked_until?: string | null
          bucket_key?: string
          hit_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          emoji: string | null
          id: string
          member_id: string
          memory_id: string
          sticker_id: string | null
          vault_id: string
        }
        Insert: {
          emoji?: string | null
          id?: string
          member_id: string
          memory_id: string
          sticker_id?: string | null
          vault_id: string
        }
        Update: {
          emoji?: string | null
          id?: string
          member_id?: string
          memory_id?: string
          sticker_id?: string | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_member_same_vault_fk"
            columns: ["member_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "reactions_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_memory_same_vault_fk"
            columns: ["memory_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "reactions_sticker_same_vault_fk"
            columns: ["sticker_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "vault_stickers"
            referencedColumns: ["id", "vault_id"]
          },
        ]
      }
      region_stats: {
        Row: {
          circle_count: number
          country_iso3: string
          division_id: string
          duo_count: number
          lat: number | null
          level: number
          lng: number | null
          memory_count: number
          name: string
          parent_division_id: string | null
          song_count: number
          updated_at: string
          vault_count: number
        }
        Insert: {
          circle_count?: number
          country_iso3: string
          division_id: string
          duo_count?: number
          lat?: number | null
          level: number
          lng?: number | null
          memory_count?: number
          name: string
          parent_division_id?: string | null
          song_count?: number
          updated_at?: string
          vault_count?: number
        }
        Update: {
          circle_count?: number
          country_iso3?: string
          division_id?: string
          duo_count?: number
          lat?: number | null
          level?: number
          lng?: number | null
          memory_count?: number
          name?: string
          parent_division_id?: string | null
          song_count?: number
          updated_at?: string
          vault_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "region_stats_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: true
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      media_upload_intents: {
        Row: {
          bucket: string
          completed_at: string | null
          created_at: string
          declared_bytes: number
          expires_at: string
          id: string
          member_id: string
          object_key: string
          song_id: string | null
          status: string
          title: string
          vault_id: string
        }
        Insert: {
          bucket?: string
          completed_at?: string | null
          created_at?: string
          declared_bytes: number
          expires_at?: string
          id: string
          member_id: string
          object_key: string
          song_id?: string | null
          status?: string
          title: string
          vault_id: string
        }
        Update: {
          bucket?: string
          completed_at?: string | null
          created_at?: string
          declared_bytes?: number
          expires_at?: string
          id?: string
          member_id?: string
          object_key?: string
          song_id?: string | null
          status?: string
          title?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_upload_intents_member_same_vault_fk"
            columns: ["member_id", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "media_upload_intents_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: true
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_upload_intents_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          added_by: string
          created_at: string
          file_url: string | null
          id: string
          source_url: string | null
          title: string
          vault_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          file_url?: string | null
          id?: string
          source_url?: string | null
          title: string
          vault_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          file_url?: string | null
          id?: string
          source_url?: string | null
          title?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "songs_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_added_by_same_vault_fk"
            columns: ["added_by", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "songs_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_cleanup_queue: {
        Row: {
          attempt_count: number
          available_at: string
          bucket: string
          created_at: string
          id: string
          last_error: string | null
          object_key: string
          processed_at: string | null
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          bucket: string
          created_at?: string
          id?: string
          last_error?: string | null
          object_key: string
          processed_at?: string | null
        }
        Update: {
          attempt_count?: number
          available_at?: string
          bucket?: string
          created_at?: string
          id?: string
          last_error?: string | null
          object_key?: string
          processed_at?: string | null
        }
        Relationships: []
      }
      vault_email_confirmations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          vault_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          vault_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_email_confirmations_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_invites: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          redeemed_at: string | null
          redeemed_by: string | null
          revoked_at: string | null
          token_hash: string
          vault_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
          token_hash: string
          vault_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
          token_hash?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_invites_creator_same_vault_fk"
            columns: ["created_by", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "vault_invites_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_invites_redeemer_same_vault_fk"
            columns: ["redeemed_by", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "vault_invites_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_recovery_requests: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          vault_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          vault_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_recovery_requests_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_stickers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          retired_at: string | null
          storage_path: string
          vault_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          retired_at?: string | null
          storage_path: string
          vault_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          retired_at?: string | null
          storage_path?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_stickers_creator_same_vault_fk"
            columns: ["created_by", "vault_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "vault_id"]
          },
          {
            foreignKeyName: "vault_stickers_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vaults: {
        Row: {
          country_id: string | null
          created_at: string
          division_id: string | null
          id: string
          key_hash: string
          key_lookup: string
          max_members: number
          milestone_date: string | null
          name: string
          purpose: string
          recovery_email_confirmed_at: string | null
          recovery_email_enc: string | null
          recovery_email_hash: string | null
          vault_type: string
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          key_hash: string
          key_lookup: string
          max_members: number
          milestone_date?: string | null
          name: string
          purpose: string
          recovery_email_confirmed_at?: string | null
          recovery_email_enc?: string | null
          recovery_email_hash?: string | null
          vault_type: string
        }
        Update: {
          country_id?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          key_hash?: string
          key_lookup?: string
          max_members?: number
          milestone_date?: string | null
          name?: string
          purpose?: string
          recovery_email_confirmed_at?: string | null
          recovery_email_enc?: string | null
          recovery_email_hash?: string | null
          vault_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaults_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaults_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaults_division_same_country_fk"
            columns: ["division_id", "country_id"]
            isOneToOne: false
            referencedRelation: "administrative_divisions"
            referencedColumns: ["id", "country_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_song_upload: {
        Args: { p_intent_id: string; p_member_id: string }
        Returns: {
          added_by: string
          created_at: string
          file_url: string | null
          id: string
          source_url: string | null
          title: string
          vault_id: string
        }
        SetofOptions: {
          from: "*"
          to: "songs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_vault_recovery: {
        Args: { p_key_hash: string; p_key_lookup: string; p_token_hash: string }
        Returns: {
          vault_id: string
          vault_name: string
        }[]
      }
      confirm_vault_recovery_email: {
        Args: { p_token_hash: string }
        Returns: string
      }
      consume_rate_limit: {
        Args: {
          p_block_seconds?: number
          p_bucket_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          challenge_required: boolean
          current_hits: number
          retry_after_seconds: number
        }[]
      }
      create_memory_entry: {
        Args: {
          p_content: string
          p_kind: string
          p_member_id: string
          p_song_id?: string
          p_unlock_at?: string
          p_vault_id: string
        }
        Returns: {
          content: string | null
          created_at: string
          id: string
          kind: string
          media_url: string | null
          member_id: string
          song_id: string | null
          unlock_at: string | null
          vault_id: string
        }
        SetofOptions: {
          from: "*"
          to: "memories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_vault_sticker: {
        Args: {
          sticker_name: string
          target_id: string
          target_member_id: string
          target_storage_path: string
          target_vault_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          retired_at: string | null
          storage_path: string
          vault_id: string
        }
        SetofOptions: {
          from: "*"
          to: "vault_stickers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      join_vault_member: {
        Args: {
          p_avatar_color: string
          p_display_name: string
          p_secret_hash: string
          p_user_id: string
          p_vault_id: string
        }
        Returns: {
          member_id: string
          member_role: string
          vault_id: string
          vault_name: string
          vault_type: string
        }[]
      }
      rebind_vault_member: {
        Args: { p_member_id: string; p_user_id: string }
        Returns: {
          member_id: string
          member_role: string
          vault_id: string
          vault_name: string
          vault_type: string
        }[]
      }
      redeem_vault_invite: {
        Args: {
          p_avatar_color: string
          p_display_name: string
          p_secret_hash: string
          p_token_hash: string
          p_user_id: string
        }
        Returns: {
          invite_id: string
          member_id: string
          member_role: string
          vault_id: string
          vault_name: string
          vault_type: string
        }[]
      }
      refresh_region_stats: { Args: never; Returns: undefined }
      reserve_song_upload: {
        Args: {
          p_declared_bytes: number
          p_intent_id: string
          p_member_id: string
          p_title: string
          p_vault_id: string
        }
        Returns: {
          bucket: string
          completed_at: string | null
          created_at: string
          declared_bytes: number
          expires_at: string
          id: string
          member_id: string
          object_key: string
          song_id: string | null
          status: string
          title: string
          vault_id: string
        }
        SetofOptions: {
          from: "*"
          to: "media_upload_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_vault_member: {
        Args: {
          p_actor_member_id: string
          p_subject_member_id: string
          p_vault_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
