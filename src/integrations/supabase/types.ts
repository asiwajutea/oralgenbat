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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          badge_color: string | null
          category: string
          code: string
          created_at: string | null
          criteria_field: string | null
          criteria_type: string
          criteria_value: number
          description: string
          icon: string
          id: string
          name: string
        }
        Insert: {
          badge_color?: string | null
          category: string
          code: string
          created_at?: string | null
          criteria_field?: string | null
          criteria_type: string
          criteria_value: number
          description: string
          icon: string
          id?: string
          name: string
        }
        Update: {
          badge_color?: string | null
          category?: string
          code?: string
          created_at?: string | null
          criteria_field?: string | null
          criteria_type?: string
          criteria_value?: number
          description?: string
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          read: boolean | null
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean | null
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean | null
          type?: string
        }
        Relationships: []
      }
      ai_feature_settings: {
        Row: {
          audio_summary_enabled: boolean
          error_suggestion_enabled: boolean
          fraud_analysis_enabled: boolean
          id: string
          invoice_parsing_enabled: boolean
          pdf_analysis_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audio_summary_enabled?: boolean
          error_suggestion_enabled?: boolean
          fraud_analysis_enabled?: boolean
          id?: string
          invoice_parsing_enabled?: boolean
          pdf_analysis_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audio_summary_enabled?: boolean
          error_suggestion_enabled?: boolean
          fraud_analysis_enabled?: boolean
          id?: string
          invoice_parsing_enabled?: boolean
          pdf_analysis_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      announcement_dismissals: {
        Row: {
          acknowledged: boolean | null
          announcement_id: string
          dismissed_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean | null
          announcement_id: string
          dismissed_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean | null
          announcement_id?: string
          dismissed_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string | null
          created_by: string
          cta_text: string | null
          cta_url: string | null
          display_frequency: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          priority: number | null
          require_acknowledgment: boolean | null
          scheduled_at: string | null
          style: string | null
          target_contractor_id: string | null
          target_role: Database["public"]["Enums"]["app_role"] | null
          target_roles: string[] | null
          target_type: string | null
          target_user_ids: string[] | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by: string
          cta_text?: string | null
          cta_url?: string | null
          display_frequency?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          require_acknowledgment?: boolean | null
          scheduled_at?: string | null
          style?: string | null
          target_contractor_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          target_roles?: string[] | null
          target_type?: string | null
          target_user_ids?: string[] | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string
          cta_text?: string | null
          cta_url?: string | null
          display_frequency?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          require_acknowledgment?: boolean | null
          scheduled_at?: string | null
          style?: string | null
          target_contractor_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          target_roles?: string[] | null
          target_type?: string | null
          target_user_ids?: string[] | null
          title?: string
        }
        Relationships: []
      }
      artifact_comment_reads: {
        Row: {
          comment_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_comment_reads_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "artifact_correction_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_correction_comments: {
        Row: {
          audit_id: string
          comment: string
          created_at: string
          id: string
          is_read: boolean | null
          parent_comment_id: string | null
          user_id: string
        }
        Insert: {
          audit_id: string
          comment: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          parent_comment_id?: string | null
          user_id: string
        }
        Update: {
          audit_id?: string
          comment?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          parent_comment_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_correction_comments_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_correction_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "artifact_correction_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_checklist_progress: {
        Row: {
          audit_id: string
          created_at: string | null
          current_index: number
          failure_comments: string | null
          has_failures: boolean
          id: string
          is_completed: boolean
          items: Json
          reviewer_id: string
          updated_at: string | null
        }
        Insert: {
          audit_id: string
          created_at?: string | null
          current_index?: number
          failure_comments?: string | null
          has_failures?: boolean
          id?: string
          is_completed?: boolean
          items?: Json
          reviewer_id: string
          updated_at?: string | null
        }
        Update: {
          audit_id?: string
          created_at?: string | null
          current_index?: number
          failure_comments?: string | null
          has_failures?: boolean
          id?: string
          is_completed?: boolean
          items?: Json
          reviewer_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_checklist_progress_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: true
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_file_cleanup_log: {
        Row: {
          audit_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          notes: string | null
          photos_deleted: number | null
          zip_deleted: boolean | null
          zip_url: string | null
        }
        Insert: {
          audit_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          photos_deleted?: number | null
          zip_deleted?: boolean | null
          zip_url?: string | null
        }
        Update: {
          audit_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          photos_deleted?: number | null
          zip_deleted?: boolean | null
          zip_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_file_cleanup_log_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_file_cleanup_log_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          action_plan: string | null
          artifact_correction: string[] | null
          artifact_correction_resolved_at: string | null
          artifact_correction_resolved_by: string | null
          file_name: string
          file_url: string
          id: string
          is_re_audit: boolean | null
          last_modified: string
          locked_at: string | null
          locked_by: string | null
          mobile_zip_uploaded_at: string | null
          mobile_zip_url: string | null
          original_status: Database["public"]["Enums"]["audit_status"] | null
          pass_override_action_plan: string | null
          pass_override_reason: string | null
          passed_with_failures: boolean | null
          re_audit_count: number | null
          review_comment: string | null
          review_duration_seconds: number | null
          review_started_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["audit_status"]
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          action_plan?: string | null
          artifact_correction?: string[] | null
          artifact_correction_resolved_at?: string | null
          artifact_correction_resolved_by?: string | null
          file_name: string
          file_url: string
          id?: string
          is_re_audit?: boolean | null
          last_modified?: string
          locked_at?: string | null
          locked_by?: string | null
          mobile_zip_uploaded_at?: string | null
          mobile_zip_url?: string | null
          original_status?: Database["public"]["Enums"]["audit_status"] | null
          pass_override_action_plan?: string | null
          pass_override_reason?: string | null
          passed_with_failures?: boolean | null
          re_audit_count?: number | null
          review_comment?: string | null
          review_duration_seconds?: number | null
          review_started_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          action_plan?: string | null
          artifact_correction?: string[] | null
          artifact_correction_resolved_at?: string | null
          artifact_correction_resolved_by?: string | null
          file_name?: string
          file_url?: string
          id?: string
          is_re_audit?: boolean | null
          last_modified?: string
          locked_at?: string | null
          locked_by?: string | null
          mobile_zip_uploaded_at?: string | null
          mobile_zip_url?: string | null
          original_status?: Database["public"]["Enums"]["audit_status"] | null
          pass_override_action_plan?: string | null
          pass_override_reason?: string | null
          passed_with_failures?: boolean | null
          re_audit_count?: number | null
          review_comment?: string | null
          review_duration_seconds?: number | null
          review_started_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_targets: {
        Row: {
          contractor_id: string
          created_at: string
          id: string
          label: string | null
          set_by: string | null
          target_names: number
          updated_at: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          id?: string
          label?: string | null
          set_by?: string | null
          target_names: number
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          id?: string
          label?: string | null
          set_by?: string | null
          target_names?: number
          updated_at?: string
        }
        Relationships: []
      }
      burn_queue: {
        Row: {
          audit_id: string
          file_name: string
          id: string
          reason: string
          restored_at: string | null
          restored_by: string | null
          sent_at: string
          sent_by: string
        }
        Insert: {
          audit_id: string
          file_name: string
          id?: string
          reason: string
          restored_at?: string | null
          restored_by?: string | null
          sent_at?: string
          sent_by: string
        }
        Update: {
          audit_id?: string
          file_name?: string
          id?: string
          reason?: string
          restored_at?: string | null
          restored_by?: string | null
          sent_at?: string
          sent_by?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          audit_id: string | null
          category: string
          contractor_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          audit_id?: string | null
          category?: string
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          audit_id?: string | null
          category?: string
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_global_policy: {
        Row: {
          all_users_mode: string
          allow_managers_only: boolean
          allow_same_role: boolean
          allow_same_team: boolean
          allowed_user_ids: string[]
          id: number
          team_chats_excepted_user_ids: string[]
          team_chats_mode: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          all_users_mode?: string
          allow_managers_only?: boolean
          allow_same_role?: boolean
          allow_same_team?: boolean
          allowed_user_ids?: string[]
          id?: number
          team_chats_excepted_user_ids?: string[]
          team_chats_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          all_users_mode?: string
          allow_managers_only?: boolean
          allow_same_role?: boolean
          allow_same_team?: boolean
          allowed_user_ids?: string[]
          id?: number
          team_chats_excepted_user_ids?: string[]
          team_chats_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          message_type: string
          metadata: Json | null
          reply_to_message_id: string | null
          sender_id: string | null
        }
        Insert: {
          attachments?: Json | null
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          metadata?: Json | null
          reply_to_message_id?: string | null
          sender_id?: string | null
        }
        Update: {
          attachments?: Json | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          metadata?: Json | null
          reply_to_message_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messaging_policies: {
        Row: {
          allowed: boolean
          from_role: Database["public"]["Enums"]["app_role"]
          id: string
          to_role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed?: boolean
          from_role: Database["public"]["Enums"]["app_role"]
          id?: string
          to_role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed?: boolean
          from_role?: Database["public"]["Enums"]["app_role"]
          id?: string
          to_role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      chat_participants: {
        Row: {
          closed_at: string | null
          conversation_id: string
          id: string
          is_muted: boolean
          joined_at: string
          last_read_at: string | null
          participant_role: string
          removed_at: string | null
          unread_count: number
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          conversation_id: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          participant_role?: string
          removed_at?: string | null
          unread_count?: number
          user_id: string
        }
        Update: {
          closed_at?: string | null
          conversation_id?: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          participant_role?: string
          removed_at?: string | null
          unread_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_pending_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      chat_user_blocks: {
        Row: {
          blocked_user_id: string
          created_at: string
          created_by: string | null
          except_user_ids: string[]
          id: string
        }
        Insert: {
          blocked_user_id: string
          created_at?: string
          created_by?: string | null
          except_user_ids?: string[]
          id?: string
        }
        Update: {
          blocked_user_id?: string
          created_at?: string
          created_by?: string | null
          except_user_ids?: string[]
          id?: string
        }
        Relationships: []
      }
      chat_user_preferences: {
        Row: {
          categories_enabled: Json
          email_digest: boolean
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          categories_enabled?: Json
          email_digest?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          categories_enabled?: Json
          email_digest?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_error_logs: {
        Row: {
          browser_info: string | null
          component_name: string | null
          created_at: string
          error_message: string
          error_source: string | null
          error_stack: string | null
          id: string
          notes: string | null
          page_url: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          suggested_fix: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          browser_info?: string | null
          component_name?: string | null
          created_at?: string
          error_message: string
          error_source?: string | null
          error_stack?: string | null
          id?: string
          notes?: string | null
          page_url?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          suggested_fix?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          browser_info?: string | null
          component_name?: string | null
          created_at?: string
          error_message?: string
          error_source?: string | null
          error_stack?: string | null
          id?: string
          notes?: string | null
          page_url?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          suggested_fix?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      data_entry_teams: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      email_notification_logs: {
        Row: {
          audit_id: string | null
          body_preview: string | null
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          provider_response: Json | null
          recipients: string[]
          status: string
          subject: string | null
          template_key: string | null
          triggered_by_event: string | null
        }
        Insert: {
          audit_id?: string | null
          body_preview?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          provider_response?: Json | null
          recipients?: string[]
          status?: string
          subject?: string | null
          template_key?: string | null
          triggered_by_event?: string | null
        }
        Update: {
          audit_id?: string | null
          body_preview?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          provider_response?: Json | null
          recipients?: string[]
          status?: string
          subject?: string | null
          template_key?: string | null
          triggered_by_event?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          available_vars: Json
          body_html: string
          body_text: string | null
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          name: string
          notification_type: string | null
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          available_vars?: Json
          body_html: string
          body_text?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          name: string
          notification_type?: string | null
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          available_vars?: Json
          body_html?: string
          body_text?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          name?: string
          notification_type?: string | null
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      field_manager_admin_assignments: {
        Row: {
          admin_id: string
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          field_manager_id: string
          id: string
          is_active: boolean | null
          notes: string | null
        }
        Insert: {
          admin_id: string
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          field_manager_id: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
        }
        Update: {
          admin_id?: string
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          field_manager_id?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
        }
        Relationships: []
      }
      field_manager_subcontractor_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          field_manager_id: string
          id: string
          is_active: boolean | null
          notes: string | null
          sub_contractor_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          field_manager_id: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          sub_contractor_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          field_manager_id?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          sub_contractor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_manager_subcontractor_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_manager_subcontractor_assignments_field_manager_id_fkey"
            columns: ["field_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_manager_subcontractor_assignments_sub_contractor_id_fkey"
            columns: ["sub_contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          audit_id: string
          entry_completed_at: string | null
          entry_completed_by: string | null
          entry_status: string | null
          export_batch_id: string | null
          exported_at: string | null
          flagged_at: string | null
          flagged_by: string | null
          id: string
          is_flagged_for_issue: boolean | null
          issue_comment: string | null
          issue_resolved_at: string | null
          issue_resolved_by: string | null
          notes: string | null
          resolve_comment: string | null
          team_id: string
          total_names: number | null
          typing_completed_at: string | null
          typing_status: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          audit_id: string
          entry_completed_at?: string | null
          entry_completed_by?: string | null
          entry_status?: string | null
          export_batch_id?: string | null
          exported_at?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          id?: string
          is_flagged_for_issue?: boolean | null
          issue_comment?: string | null
          issue_resolved_at?: string | null
          issue_resolved_by?: string | null
          notes?: string | null
          resolve_comment?: string | null
          team_id: string
          total_names?: number | null
          typing_completed_at?: string | null
          typing_status?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          audit_id?: string
          entry_completed_at?: string | null
          entry_completed_by?: string | null
          entry_status?: string | null
          export_batch_id?: string | null
          exported_at?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          id?: string
          is_flagged_for_issue?: boolean | null
          issue_comment?: string | null
          issue_resolved_at?: string | null
          issue_resolved_by?: string | null
          notes?: string | null
          resolve_comment?: string | null
          team_id?: string
          total_names?: number | null
          typing_completed_at?: string | null
          typing_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_assignments_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: true
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "data_entry_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_fm_overrides: {
        Row: {
          assigned_by: string | null
          audit_id: string
          created_at: string
          field_manager_id: string
          id: string
          notes: string | null
        }
        Insert: {
          assigned_by?: string | null
          audit_id: string
          created_at?: string
          field_manager_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          assigned_by?: string | null
          audit_id?: string
          created_at?: string
          field_manager_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      interview_metadata: {
        Row: {
          audio_quality_summary: string | null
          audit_id: string | null
          contractor_business_name: string | null
          contractor_id: string
          created_at: string | null
          duration_manually_confirmed: boolean | null
          family_story_audio_url: string | null
          family_story_duration: number | null
          family_story_noise_level: number | null
          family_story_silence_level: number | null
          field_manager: string | null
          first_ancestor: string | null
          id: string
          interview_date: string
          interview_language: string | null
          interview_location: string | null
          interview_time: string
          interviewee_age: number | null
          interviewee_birth_location: string | null
          interviewee_birth_year: number | null
          interviewee_clan: string | null
          interviewee_name: string | null
          interviewee_phone: string | null
          interviewee_title: string | null
          interviewee_tribe: string | null
          interviewer_code: string
          interviewer_id: string | null
          interviewer_name: string | null
          pdf_analyzed_at: string | null
          pdf_clarity_score: number | null
          pdf_handwriting_legibility: number | null
          pdf_quality_feedback: string | null
          pdf_scores_manually_adjusted: boolean | null
          pedigree_segment_audio_url: string | null
          pedigree_segment_duration: number | null
          pedigree_segment_noise_level: number | null
          pedigree_segment_silence_level: number | null
          total_names: number | null
          updated_at: string | null
        }
        Insert: {
          audio_quality_summary?: string | null
          audit_id?: string | null
          contractor_business_name?: string | null
          contractor_id: string
          created_at?: string | null
          duration_manually_confirmed?: boolean | null
          family_story_audio_url?: string | null
          family_story_duration?: number | null
          family_story_noise_level?: number | null
          family_story_silence_level?: number | null
          field_manager?: string | null
          first_ancestor?: string | null
          id?: string
          interview_date: string
          interview_language?: string | null
          interview_location?: string | null
          interview_time: string
          interviewee_age?: number | null
          interviewee_birth_location?: string | null
          interviewee_birth_year?: number | null
          interviewee_clan?: string | null
          interviewee_name?: string | null
          interviewee_phone?: string | null
          interviewee_title?: string | null
          interviewee_tribe?: string | null
          interviewer_code: string
          interviewer_id?: string | null
          interviewer_name?: string | null
          pdf_analyzed_at?: string | null
          pdf_clarity_score?: number | null
          pdf_handwriting_legibility?: number | null
          pdf_quality_feedback?: string | null
          pdf_scores_manually_adjusted?: boolean | null
          pedigree_segment_audio_url?: string | null
          pedigree_segment_duration?: number | null
          pedigree_segment_noise_level?: number | null
          pedigree_segment_silence_level?: number | null
          total_names?: number | null
          updated_at?: string | null
        }
        Update: {
          audio_quality_summary?: string | null
          audit_id?: string | null
          contractor_business_name?: string | null
          contractor_id?: string
          created_at?: string | null
          duration_manually_confirmed?: boolean | null
          family_story_audio_url?: string | null
          family_story_duration?: number | null
          family_story_noise_level?: number | null
          family_story_silence_level?: number | null
          field_manager?: string | null
          first_ancestor?: string | null
          id?: string
          interview_date?: string
          interview_language?: string | null
          interview_location?: string | null
          interview_time?: string
          interviewee_age?: number | null
          interviewee_birth_location?: string | null
          interviewee_birth_year?: number | null
          interviewee_clan?: string | null
          interviewee_name?: string | null
          interviewee_phone?: string | null
          interviewee_title?: string | null
          interviewee_tribe?: string | null
          interviewer_code?: string
          interviewer_id?: string | null
          interviewer_name?: string | null
          pdf_analyzed_at?: string | null
          pdf_clarity_score?: number | null
          pdf_handwriting_legibility?: number | null
          pdf_quality_feedback?: string | null
          pdf_scores_manually_adjusted?: boolean | null
          pedigree_segment_audio_url?: string | null
          pedigree_segment_duration?: number | null
          pedigree_segment_noise_level?: number | null
          pedigree_segment_silence_level?: number | null
          total_names?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_metadata_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_photos: {
        Row: {
          audit_id: string | null
          created_at: string | null
          display_order: number | null
          file_name: string
          id: string
          storage_path: string
        }
        Insert: {
          audit_id?: string | null
          created_at?: string | null
          display_order?: number | null
          file_name: string
          id?: string
          storage_path: string
        }
        Update: {
          audit_id?: string | null
          created_at?: string | null
          display_order?: number | null
          file_name?: string
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_photos_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount: number | null
          audit_id: string | null
          booklet_delivered_at: string | null
          booklet_printed_at: string | null
          booklet_received_at: string | null
          contractor_name: string | null
          created_at: string | null
          created_by: string | null
          folder_name: string
          id: string
          interview_id: string | null
          invoice_date: string
          invoice_file_url: string | null
          invoice_number: string
          journey_status: string | null
          names_count: number
          pay_rate: number | null
          payment_type: string
          vendor_id: string | null
        }
        Insert: {
          amount?: number | null
          audit_id?: string | null
          booklet_delivered_at?: string | null
          booklet_printed_at?: string | null
          booklet_received_at?: string | null
          contractor_name?: string | null
          created_at?: string | null
          created_by?: string | null
          folder_name: string
          id?: string
          interview_id?: string | null
          invoice_date: string
          invoice_file_url?: string | null
          invoice_number: string
          journey_status?: string | null
          names_count: number
          pay_rate?: number | null
          payment_type: string
          vendor_id?: string | null
        }
        Update: {
          amount?: number | null
          audit_id?: string | null
          booklet_delivered_at?: string | null
          booklet_printed_at?: string | null
          booklet_received_at?: string | null
          contractor_name?: string | null
          created_at?: string | null
          created_by?: string | null
          folder_name?: string
          id?: string
          interview_id?: string | null
          invoice_date?: string
          invoice_file_url?: string | null
          invoice_number?: string
          journey_status?: string | null
          names_count?: number
          pay_rate?: number | null
          payment_type?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      penalty_charges: {
        Row: {
          amount: number
          appeal_decided_at: string | null
          appeal_decided_by: string | null
          appeal_reason: string | null
          appeal_status: string | null
          audit_id: string
          charged_user_id: string
          charged_user_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          currency: string
          id: string
          paid_amount: number
          removed_at: string | null
          removed_by: string | null
          removed_reason: string | null
          setting_id: string | null
          status: string
        }
        Insert: {
          amount: number
          appeal_decided_at?: string | null
          appeal_decided_by?: string | null
          appeal_reason?: string | null
          appeal_status?: string | null
          audit_id: string
          charged_user_id: string
          charged_user_role: Database["public"]["Enums"]["app_role"]
          created_at?: string
          currency?: string
          id?: string
          paid_amount?: number
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          setting_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          appeal_decided_at?: string | null
          appeal_decided_by?: string | null
          appeal_reason?: string | null
          appeal_status?: string | null
          audit_id?: string
          charged_user_id?: string
          charged_user_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          currency?: string
          id?: string
          paid_amount?: number
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          setting_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "penalty_charges_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "penalty_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      penalty_exemptions: {
        Row: {
          cascade_to_subordinates: boolean
          created_at: string
          created_by: string | null
          exempt_user_id: string
          id: string
          setting_id: string
        }
        Insert: {
          cascade_to_subordinates?: boolean
          created_at?: string
          created_by?: string | null
          exempt_user_id: string
          id?: string
          setting_id: string
        }
        Update: {
          cascade_to_subordinates?: boolean
          created_at?: string
          created_by?: string | null
          exempt_user_id?: string
          id?: string
          setting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "penalty_exemptions_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "penalty_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      penalty_payments: {
        Row: {
          amount: number
          charge_id: string | null
          charged_user_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          currency: string
          declared_at: string
          declared_by: string
          id: string
          note: string | null
          status: string
        }
        Insert: {
          amount: number
          charge_id?: string | null
          charged_user_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          currency?: string
          declared_at?: string
          declared_by: string
          id?: string
          note?: string | null
          status?: string
        }
        Update: {
          amount?: number
          charge_id?: string | null
          charged_user_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          currency?: string
          declared_at?: string
          declared_by?: string
          id?: string
          note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "penalty_payments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "penalty_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      penalty_settings: {
        Row: {
          amount: number
          charge_mode: string
          created_at: string
          currency: string
          effective_from: string
          id: string
          is_active: boolean
          scope_id: string | null
          scope_type: string
          set_by: string
          set_by_role: Database["public"]["Enums"]["app_role"]
          target_role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          charge_mode: string
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          scope_id?: string | null
          scope_type: string
          set_by: string
          set_by_role: Database["public"]["Enums"]["app_role"]
          target_role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          charge_mode?: string
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          scope_id?: string | null
          scope_type?: string
          set_by?: string
          set_by_role?: Database["public"]["Enums"]["app_role"]
          target_role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          active_contractor_id: string | null
          approved_at: string | null
          approved_by: string | null
          contractor_id: string
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_approved: boolean
          phone: string
          updated_at: string | null
        }
        Insert: {
          account_status?: string
          active_contractor_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          contractor_id: string
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_approved?: boolean
          phone: string
          updated_at?: string | null
        }
        Update: {
          account_status?: string
          active_contractor_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          contractor_id?: string
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_approved?: boolean
          phone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      push_notification_deliveries: {
        Row: {
          delivered_at: string
          id: string
          interacted_at: string | null
          push_notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          delivered_at?: string
          id?: string
          interacted_at?: string | null
          push_notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          delivered_at?: string
          id?: string
          interacted_at?: string | null
          push_notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_deliveries_push_notification_id_fkey"
            columns: ["push_notification_id"]
            isOneToOne: false
            referencedRelation: "push_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notifications: {
        Row: {
          created_at: string
          created_by: string
          id: string
          message: string
          target_roles: string[] | null
          target_type: string
          target_user_ids: string[] | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          message: string
          target_roles?: string[] | null
          target_type?: string
          target_user_ids?: string[] | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          target_roles?: string[] | null
          target_type?: string
          target_user_ids?: string[] | null
          title?: string
        }
        Relationships: []
      }
      re_audit_submissions: {
        Row: {
          audit_id: string
          id: string
          new_pdf_url: string | null
          new_zip_url: string | null
          re_audit_note: string | null
          replaced_pdf: boolean | null
          replaced_zip: boolean | null
          submission_comment: string | null
          submitted_at: string | null
          submitted_by: string
          submitted_by_role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          audit_id: string
          id?: string
          new_pdf_url?: string | null
          new_zip_url?: string | null
          re_audit_note?: string | null
          replaced_pdf?: boolean | null
          replaced_zip?: boolean | null
          submission_comment?: string | null
          submitted_at?: string | null
          submitted_by: string
          submitted_by_role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          audit_id?: string
          id?: string
          new_pdf_url?: string | null
          new_zip_url?: string | null
          re_audit_note?: string | null
          replaced_pdf?: boolean | null
          replaced_zip?: boolean | null
          submission_comment?: string | null
          submitted_at?: string | null
          submitted_by?: string
          submitted_by_role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "re_audit_submissions_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_notification_logs: {
        Row: {
          audit_id: string | null
          contractor_id: string | null
          created_at: string
          error_message: string | null
          file_name: string | null
          id: string
          interviewer_code: string | null
          message: string
          provider_response: Json | null
          recipients: string[]
          recipients_count: number
          status: string
        }
        Insert: {
          audit_id?: string | null
          contractor_id?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          id?: string
          interviewer_code?: string | null
          message: string
          provider_response?: Json | null
          recipients?: string[]
          recipients_count?: number
          status?: string
        }
        Update: {
          audit_id?: string | null
          contractor_id?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          id?: string
          interviewer_code?: string | null
          message?: string
          provider_response?: Json | null
          recipients?: string[]
          recipients_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_notification_logs_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      team_assignment_history: {
        Row: {
          contractor_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          field_manager_id: string
          id: string
          interviewer_code: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          field_manager_id: string
          id?: string
          interviewer_code: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          field_manager_id?: string
          id?: string
          interviewer_code?: string
        }
        Relationships: []
      }
      team_assignments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          contractor_id: string
          created_at: string | null
          field_manager_id: string
          id: string
          interviewer_code: string
          notes: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          contractor_id: string
          created_at?: string | null
          field_manager_id: string
          id?: string
          interviewer_code: string
          notes?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          contractor_id?: string
          created_at?: string | null
          field_manager_id?: string
          id?: string
          interviewer_code?: string
          notes?: string | null
          status?: string
        }
        Relationships: []
      }
      team_export_batches: {
        Row: {
          created_at: string
          export_batch_id: string
          exported_at: string
          exported_by: string | null
          file_names: Json
          id: string
          team_id: string
          total_files: number
          total_names: number
        }
        Insert: {
          created_at?: string
          export_batch_id: string
          exported_at?: string
          exported_by?: string | null
          file_names?: Json
          id?: string
          team_id: string
          total_files?: number
          total_names?: number
        }
        Update: {
          created_at?: string
          export_batch_id?: string
          exported_at?: string
          exported_by?: string | null
          file_names?: Json
          id?: string
          team_id?: string
          total_files?: number
          total_names?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_export_batches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "data_entry_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_attempts: {
        Row: {
          audit_id: string | null
          created_at: string
          detected_kind: string
          file_name: string
          id: string
          message: string | null
          mode: string
          status: string
          user_id: string
        }
        Insert: {
          audit_id?: string | null
          created_at?: string
          detected_kind: string
          file_name: string
          id?: string
          message?: string | null
          mode: string
          status: string
          user_id: string
        }
        Update: {
          audit_id?: string | null
          created_at?: string
          detected_kind?: string
          file_name?: string
          id?: string
          message?: string | null
          mode?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      upload_lock_settings: {
        Row: {
          locked: boolean
          reason: string | null
          scope_id: string
          scope_type: string
          set_by: string | null
          updated_at: string
        }
        Insert: {
          locked?: boolean
          reason?: string | null
          scope_id?: string
          scope_type: string
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          locked?: boolean
          reason?: string | null
          scope_id?: string
          scope_type?: string
          set_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      upload_quota_settings: {
        Row: {
          limit_value: number
          metric: string
          reset_at: string | null
          reset_period: string
          scope_id: string
          scope_type: string
          set_by: string | null
          updated_at: string
        }
        Insert: {
          limit_value: number
          metric: string
          reset_at?: string | null
          reset_period?: string
          scope_id: string
          scope_type: string
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          limit_value?: number
          metric?: string
          reset_at?: string | null
          reset_period?: string
          scope_id?: string
          scope_type?: string
          set_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_achievement_progress: {
        Row: {
          achievement_id: string
          current_value: number | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          current_value?: number | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          current_value?: number | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievement_progress_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string | null
          id: string
          progress_value: number | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string | null
          id?: string
          progress_value?: number | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string | null
          id?: string
          progress_value?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_log: {
        Row: {
          action_type: string
          created_at: string
          description: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string
          user_role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          action_type: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
          user_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
          user_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: []
      }
      user_contractor_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          contractor_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          contractor_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          contractor_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      user_email_preferences: {
        Row: {
          created_at: string
          emails_enabled: boolean
          notify_account_status: boolean
          notify_agent_reassigned: boolean
          notify_audit_passed: boolean
          notify_comments: boolean
          notify_data_entry_complete: boolean
          notify_failed_audit: boolean
          notify_inactivity: boolean
          notify_interview_assigned: boolean
          notify_issues: boolean
          notify_milestones: boolean
          notify_new_interviews: boolean
          notify_new_registration: boolean
          notify_payment: boolean
          notify_re_audit: boolean
          notify_team_requests: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emails_enabled?: boolean
          notify_account_status?: boolean
          notify_agent_reassigned?: boolean
          notify_audit_passed?: boolean
          notify_comments?: boolean
          notify_data_entry_complete?: boolean
          notify_failed_audit?: boolean
          notify_inactivity?: boolean
          notify_interview_assigned?: boolean
          notify_issues?: boolean
          notify_milestones?: boolean
          notify_new_interviews?: boolean
          notify_new_registration?: boolean
          notify_payment?: boolean
          notify_re_audit?: boolean
          notify_team_requests?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emails_enabled?: boolean
          notify_account_status?: boolean
          notify_agent_reassigned?: boolean
          notify_audit_passed?: boolean
          notify_comments?: boolean
          notify_data_entry_complete?: boolean
          notify_failed_audit?: boolean
          notify_inactivity?: boolean
          notify_interview_assigned?: boolean
          notify_issues?: boolean
          notify_milestones?: boolean
          notify_new_interviews?: boolean
          notify_new_registration?: boolean
          notify_payment?: boolean
          notify_re_audit?: boolean
          notify_team_requests?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notification_settings: {
        Row: {
          created_at: string | null
          id: string
          notify_account_status: boolean | null
          notify_agent_reassigned: boolean | null
          notify_audit_passed: boolean | null
          notify_comments: boolean | null
          notify_data_entry_complete: boolean | null
          notify_failed_audit: boolean | null
          notify_inactivity: boolean | null
          notify_interview_assigned: boolean | null
          notify_issues: boolean | null
          notify_milestones: boolean | null
          notify_new_interviews: boolean | null
          notify_new_registration: boolean | null
          notify_payment: boolean | null
          notify_re_audit: boolean | null
          notify_team_requests: boolean | null
          push_subscription: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notify_account_status?: boolean | null
          notify_agent_reassigned?: boolean | null
          notify_audit_passed?: boolean | null
          notify_comments?: boolean | null
          notify_data_entry_complete?: boolean | null
          notify_failed_audit?: boolean | null
          notify_inactivity?: boolean | null
          notify_interview_assigned?: boolean | null
          notify_issues?: boolean | null
          notify_milestones?: boolean | null
          notify_new_interviews?: boolean | null
          notify_new_registration?: boolean | null
          notify_payment?: boolean | null
          notify_re_audit?: boolean | null
          notify_team_requests?: boolean | null
          push_subscription?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notify_account_status?: boolean | null
          notify_agent_reassigned?: boolean | null
          notify_audit_passed?: boolean | null
          notify_comments?: boolean | null
          notify_data_entry_complete?: boolean | null
          notify_failed_audit?: boolean | null
          notify_inactivity?: boolean | null
          notify_interview_assigned?: boolean | null
          notify_issues?: boolean | null
          notify_milestones?: boolean | null
          notify_new_interviews?: boolean | null
          notify_new_registration?: boolean | null
          notify_payment?: boolean | null
          notify_re_audit?: boolean | null
          notify_team_requests?: boolean | null
          push_subscription?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          is_online: boolean
          last_seen_at: string | null
          last_session_duration_seconds: number | null
          session_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          is_online?: boolean
          last_seen_at?: string | null
          last_session_duration_seconds?: number | null
          session_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          is_online?: boolean
          last_seen_at?: string | null
          last_session_duration_seconds?: number | null
          session_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_session_history: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string
          logout_reason: string | null
          session_ended_at: string | null
          session_started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          logout_reason?: string | null
          session_ended_at?: string | null
          session_started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          logout_reason?: string | null
          session_ended_at?: string | null
          session_started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_session_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      appeal_penalty_charge: {
        Args: { _charge_id: string; _reason: string }
        Returns: undefined
      }
      assert_upload_allowed: {
        Args: { _file_name: string; _new_names?: number }
        Returns: Json
      }
      can_message_users: {
        Args: { _recipient_ids: string[] }
        Returns: boolean
      }
      confirm_penalty_payment: {
        Args: { _accept: boolean; _note?: string; _payment_id: string }
        Returns: undefined
      }
      contractor_scope_covers: {
        Args: { _scope_id: string; _scope_type: string }
        Returns: boolean
      }
      create_chat_conversation: {
        Args: {
          _category?: string
          _participant_ids: string[]
          _title?: string
          _type?: string
        }
        Returns: string
      }
      decide_penalty_appeal: {
        Args: { _accept: boolean; _charge_id: string; _note?: string }
        Returns: undefined
      }
      declare_penalty_payment: {
        Args: { _amount: number; _charge_id: string; _note?: string }
        Returns: string
      }
      delete_conversation: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      detect_interview_fraud_flag: {
        Args: { p_audit_id: string }
        Returns: {
          collisions: Json
          contractor_id: string
          interview_date: string
          interview_time: string
          interviewer_code: string
          is_flagged: boolean
        }[]
      }
      get_assignable_field_managers: {
        Args: { _for_contractor?: string }
        Returns: {
          contractor_id: string
          full_name: string
          id: string
        }[]
      }
      get_canonical_field_managers: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_chat_unread_summary: {
        Args: never
        Returns: {
          category: string
          unread_count: number
        }[]
      }
      get_chat_unread_total: { Args: never; Returns: number }
      get_cleanable_audit_files: {
        Args: { contractor_filter?: string; min_age_days?: number }
        Returns: {
          audit_id: string
          days_since_review: number
          file_name: string
          has_metadata: boolean
          mobile_zip_uploaded_at: string
          photo_count: number
          reviewed_at: string
          status: Database["public"]["Enums"]["audit_status"]
          zip_url: string
        }[]
      }
      get_contractor_audits: {
        Args: {
          p_auditor_name?: string
          p_contractor_id: string
          p_end_date?: string
          p_interviewer?: string
          p_is_auditor?: boolean
          p_limit?: number
          p_offset?: number
          p_reviewer?: string
          p_search?: string
          p_sort_by_artifacts?: boolean
          p_start_date?: string
          p_statuses?: string[]
        }
        Returns: {
          action_plan: string
          artifact_correction: string[]
          artifact_correction_resolved_at: string
          artifact_correction_resolved_by: string
          file_name: string
          file_url: string
          id: string
          is_re_audit: boolean
          last_modified: string
          locked_at: string
          locked_by: string
          mobile_zip_uploaded_at: string
          mobile_zip_url: string
          original_status: Database["public"]["Enums"]["audit_status"]
          re_audit_count: number
          review_comment: string
          review_duration_seconds: number
          review_started_at: string
          reviewed_at: string
          reviewed_by: string
          status: Database["public"]["Enums"]["audit_status"]
          total_count: number
          uploaded_at: string
          uploaded_by_name: string
        }[]
      }
      get_penalty_summary: {
        Args: { _user_id: string }
        Returns: {
          balance: number
          currency: string
          open_count: number
          total_charged: number
          total_paid: number
        }[]
      }
      get_review_stats: {
        Args: never
        Returns: {
          burned_count: number
          failed_names: number
          failed_reviews: number
          monthly_names: number
          monthly_reviews: number
          passed_names: number
          passed_reviews: number
          total_names: number
          total_reviews: number
        }[]
      }
      get_status_counts: {
        Args: {
          p_auditor_name?: string
          p_contractor_id?: string
          p_is_auditor?: boolean
        }
        Returns: {
          count: number
          status_key: string
          total_names: number
        }[]
      }
      get_storage_usage: {
        Args: never
        Returns: {
          bucket_id: string
          file_count: number
          total_size_bytes: number
        }[]
      }
      get_upload_quota_usage: {
        Args: { _metric: string; _scope_id: string; _scope_type: string }
        Returns: Json
      }
      get_upload_tracking_error_stats: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          completed_checklists: number
          failed_questions: number
          first_audits_failed: number
          first_audits_total: number
          total_questions: number
        }[]
      }
      get_upload_tracking_interviews: {
        Args: {
          p_artifact?: string
          p_end_date: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_start_date: string
          p_status?: string
        }
        Returns: {
          action_plan: string
          artifact_correction: string[]
          audit_id: string
          field_manager: string
          file_name: string
          interview_location: string
          interviewee_name: string
          interviewer_code: string
          interviewer_name: string
          is_re_audit: boolean
          pass_override_action_plan: string
          pass_override_reason: string
          passed_with_failures: boolean
          re_audit_count: number
          review_comment: string
          reviewed_at: string
          reviewed_by: string
          status: Database["public"]["Enums"]["audit_status"]
          total_count: number
          total_names: number
          uploaded_at: string
          uploaded_by_name: string
        }[]
      }
      get_upload_tracking_stats: {
        Args: {
          p_end_date: string
          p_granularity?: string
          p_start_date: string
        }
        Returns: {
          interviews_uploaded: number
          interviews_with_metadata: number
          interviews_without_metadata: number
          period: string
          period_start: string
          total_names: number
        }[]
      }
      get_user_activity: {
        Args: {
          _action_types?: string[]
          _end_date?: string
          _entity_types?: string[]
          _limit?: number
          _offset?: number
          _search?: string
          _start_date?: string
          _user_id: string
        }
        Returns: {
          action_type: string
          created_at: string
          description: string
          entity_id: string
          entity_label: string
          entity_type: string
          id: string
          metadata: Json
          total_count: number
          user_id: string
          user_role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_user_display_name: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_chat_participant: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      is_penalty_superior: {
        Args: { _actor: string; _charged: string }
        Returns: boolean
      }
      is_user_approved: { Args: { _user_id: string }; Returns: boolean }
      leave_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      log_activity: {
        Args: {
          _action_type: string
          _description?: string
          _entity_id?: string
          _entity_label?: string
          _entity_type?: string
          _metadata?: Json
          _user_id: string
        }
        Returns: undefined
      }
      mark_audit_for_reaudit:
        | {
            Args: {
              _audit_id: string
              _comment: string
              _new_pdf_url?: string
              _new_zip_url?: string
              _submitted_by: string
              _submitted_by_role: Database["public"]["Enums"]["app_role"]
            }
            Returns: undefined
          }
        | {
            Args: {
              _audit_id: string
              _comment: string
              _new_pdf_url?: string
              _new_zip_url?: string
              _re_audit_note?: string
              _submitted_by: string
              _submitted_by_role: Database["public"]["Enums"]["app_role"]
            }
            Returns: undefined
          }
      mark_conversation_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      process_chat_event_inline: {
        Args: { _event_id: string }
        Returns: undefined
      }
      remove_penalty_charge: {
        Args: { _charge_id: string; _reason: string }
        Returns: undefined
      }
      rename_conversation: {
        Args: { _conversation_id: string; _new_title: string }
        Returns: undefined
      }
      upload_quota_window_start: {
        Args: { _reset_at: string; _reset_period: string }
        Returns: string
      }
      user_can_view_audit_for_tracking: {
        Args: { _audit_id: string; _file_name: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "field_manager"
        | "auditor"
        | "contractor"
        | "admin"
        | "super_admin"
        | "data_entry_clerk"
        | "quality_assurance_manager"
        | "sub_contractor"
      audit_status:
        | "Pending"
        | "Audit Passed"
        | "Audit Failed"
        | "Awaiting Review"
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
    Enums: {
      app_role: [
        "field_manager",
        "auditor",
        "contractor",
        "admin",
        "super_admin",
        "data_entry_clerk",
        "quality_assurance_manager",
        "sub_contractor",
      ],
      audit_status: [
        "Pending",
        "Audit Passed",
        "Audit Failed",
        "Awaiting Review",
      ],
    },
  },
} as const
