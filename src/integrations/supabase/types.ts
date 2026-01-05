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
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["audit_status"]
          uploaded_at: string
        }
        Insert: {
          action_plan?: string | null
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
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          uploaded_at?: string
        }
        Update: {
          action_plan?: string | null
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
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["audit_status"]
          uploaded_at?: string
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
      interview_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          audit_id: string
          export_batch_id: string | null
          exported_at: string | null
          id: string
          notes: string | null
          team_id: string
          total_names: number | null
          typing_completed_at: string | null
          typing_status: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          audit_id: string
          export_batch_id?: string | null
          exported_at?: string | null
          id?: string
          notes?: string | null
          team_id: string
          total_names?: number | null
          typing_completed_at?: string | null
          typing_status?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          audit_id?: string
          export_batch_id?: string | null
          exported_at?: string | null
          id?: string
          notes?: string | null
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
      profiles: {
        Row: {
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
      get_storage_usage: {
        Args: never
        Returns: {
          bucket_id: string
          file_count: number
          total_size_bytes: number
        }[]
      }
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
