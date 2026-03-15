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
          re_audit_count: number | null
          review_comment: string | null
          review_duration_seconds: number | null
          review_started_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["audit_status"]
          uploaded_at: string
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
          re_audit_count?: number | null
          review_comment?: string | null
          review_duration_seconds?: number | null
          review_started_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          uploaded_at?: string
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
          re_audit_count?: number | null
          review_comment?: string | null
          review_duration_seconds?: number | null
          review_started_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          uploaded_at?: string
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
      get_user_display_name: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_approved: { Args: { _user_id: string }; Returns: boolean }
      mark_audit_for_reaudit: {
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
