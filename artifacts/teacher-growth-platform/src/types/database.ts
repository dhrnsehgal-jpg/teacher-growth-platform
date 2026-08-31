umns: ['affiliation_verified_by'];
            isOneToOne: false;
            referencedRelation: 'app_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'school_regulatory_profile_funding_status_verified_by_fkey';
            columns: ['funding_status_verified_by'];
            isOneToOne: false;
            referencedRelation: 'app_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'school_regulatory_profile_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: true;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'school_regulatory_profile_service_framework_verified_by_fkey';
            columns: ['service_framework_verified_by'];
            isOneToOne: false;
            referencedRelation: 'app_user';
            referencedColumns: ['id'];
          },
        ];
      };
      school_stage: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          key: string;
          nep_stage: string | null;
          school_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id?: string;
          key: string;
          nep_stage?: string | null;
          school_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          key?: string;
          nep_stage?: string | null;
          school_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'school_stage_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
        ];
      };
      subject: {
        Row: {
          cbse_subject_code: string | null;
          created_at: string;
          department_id: string | null;
          display_name: string;
          id: string;
          is_active: boolean;
          key: string;
          school_id: string;
        };
        Insert: {
          cbse_subject_code?: string | null;
          created_at?: string;
          department_id?: string | null;
          display_name: string;
          id?: string;
          is_active?: boolean;
          key: string;
          school_id: string;
        };
        Update: {
          cbse_subject_code?: string | null;
          created_at?: string;
          department_id?: string | null;
          display_name?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subject_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'department';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subject_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
        ];
      };
      teacher_category: {
        Row: {
          created_at: string;
          description: string | null;
          display_name: string;
          id: string;
          is_active: boolean;
          key: string;
          school_id: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_name: string;
          id?: string;
          is_active?: boolean;
          key: string;
          school_id: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_name?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          school_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'teacher_category_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
        ];
      };
      teacher_department_membership: {
        Row: {
          department_id: string;
          teacher_profile_id: string;
        };
        Insert: {
          department_id: string;
          teacher_profile_id: string;
        };
        Update: {
          department_id?: string;
          teacher_profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'teacher_department_membership_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'department';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_department_membership_teacher_profile_id_fkey';
            columns: ['teacher_profile_id'];
            isOneToOne: false;
            referencedRelation: 'teacher_profile';
            referencedColumns: ['id'];
          },
        ];
      };
      teacher_profile: {
        Row: {
          career_level_id: string | null;
          created_at: string;
          date_of_joining: string | null;
          employee_code: string | null;
          employment_status: Database['core']['Enums']['employment_status'];
          has_leadership_responsibility: boolean;
          id: string;
          is_active: boolean;
          primary_department_id: string | null;
          prior_experience_months: number | null;
          qualification_note: string | null;
          qualification_verification: Database['regulatory']['Enums']['verification_status'];
          qualification_verified_at: string | null;
          qualification_verified_by: string | null;
          school_id: string;
          teacher_category_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          career_level_id?: string | null;
          created_at?: string;
          date_of_joining?: string | null;
          employee_code?: string | null;
          employment_status?: Database['core']['Enums']['employment_status'];
          has_leadership_responsibility?: boolean;
          id?: string;
          is_active?: boolean;
          primary_department_id?: string | null;
          prior_experience_months?: number | null;
          qualification_note?: string | null;
          qualification_verification?: Database['regulatory']['Enums']['verification_status'];
          qualification_verified_at?: string | null;
          qualification_verified_by?: string | null;
          school_id: string;
          teacher_category_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          career_level_id?: string | null;
          created_at?: string;
          date_of_joining?: string | null;
          employee_code?: string | null;
          employment_status?: Database['core']['Enums']['employment_status'];
          has_leadership_responsibility?: boolean;
          id?: string;
          is_active?: boolean;
          primary_department_id?: string | null;
          prior_experience_months?: number | null;
          qualification_note?: string | null;
          qualification_verification?: Database['regulatory']['Enums']['verification_status'];
          qualification_verified_at?: string | null;
          qualification_verified_by?: string | null;
          school_id?: string;
          teacher_category_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'teacher_profile_career_level_id_fkey';
            columns: ['career_level_id'];
            isOneToOne: false;
            referencedRelation: 'career_level';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_profile_primary_department_id_fkey';
            columns: ['primary_department_id'];
            isOneToOne: false;
            referencedRelation: 'department';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_profile_qualification_verified_by_fkey';
            columns: ['qualification_verified_by'];
            isOneToOne: false;
            referencedRelation: 'app_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_profile_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_profile_teacher_category_id_fkey';
            columns: ['teacher_category_id'];
            isOneToOne: false;
            referencedRelation: 'teacher_category';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_profile_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_user';
            referencedColumns: ['id'];
          },
        ];
      };
      teacher_teaching_assignment: {
        Row: {
          academic_year_id: string;
          class_level_id: string | null;
          created_at: string;
          id: string;
          school_id: string;
          school_stage_id: string | null;
          subject_id: string | null;
          teacher_profile_id: string;
        };
        Insert: {
          academic_year_id: string;
          class_level_id?: string | null;
          created_at?: string;
          id?: string;
          school_id: string;
          school_stage_id?: string | null;
          subject_id?: string | null;
          teacher_profile_id: string;
        };
        Update: {
          academic_year_id?: string;
          class_level_id?: string | null;
          created_at?: string;
          id?: string;
          school_id?: string;
          school_stage_id?: string | null;
          subject_id?: string | null;
          teacher_profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'teacher_teaching_assignment_academic_year_id_fkey';
            columns: ['academic_year_id'];
            isOneToOne: false;
            referencedRelation: 'academic_year';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_teaching_assignment_class_level_id_fkey';
            columns: ['class_level_id'];
            isOneToOne: false;
            referencedRelation: 'class_level';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_teaching_assignment_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_teaching_assignment_school_stage_id_fkey';
            columns: ['school_stage_id'];
            isOneToOne: false;
            referencedRelation: 'school_stage';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_teaching_assignment_subject_id_fkey';
            columns: ['subject_id'];
            isOneToOne: false;
            referencedRelation: 'subject';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_teaching_assignment_teacher_profile_id_fkey';
            columns: ['teacher_profile_id'];
            isOneToOne: false;
            referencedRelation: 'teacher_profile';
            referencedColumns: ['id'];
          },
        ];
      };
      user_role_assignment: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          role_id: string;
          school_id: string;
          scope_id: string | null;
          scope_type: Database['core']['Enums']['assignment_scope_type'];
          updated_at: string;
          user_id: string;
          valid_from: string;
          valid_to: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          role_id: string;
          school_id: string;
          scope_id?: string | null;
          scope_type?: Database['core']['Enums']['assignment_scope_type'];
          updated_at?: string;
          user_id: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          role_id?: string;
          school_id?: string;
          scope_id?: string | null;
          scope_type?: Database['core']['Enums']['assignment_scope_type'];
          updated_at?: string;
          user_id?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_role_assignment_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'app_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_role_assignment_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'role';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_role_assignment_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: false;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_role_assignment_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_user';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      school_compliance_readiness: {
        Row: {
          cbse_affiliation_status: Database['core']['Enums']['affiliation_status'] | null;
          employment_compliance_enabled: boolean | null;
          employment_gate_message: string | null;
          funding_status: Database['core']['Enums']['school_funding_status'] | null;
          last_reviewed_on: string | null;
          professional_growth_enabled: boolean | null;
          review_due_on: string | null;
          school_id: string | null;
        };
        Insert: {
          cbse_affiliation_status?: Database['core']['Enums']['affiliation_status'] | null;
          employment_compliance_enabled?: never;
          employment_gate_message?: never;
          funding_status?: Database['core']['Enums']['school_funding_status'] | null;
          last_reviewed_on?: string | null;
          professional_growth_enabled?: never;
          review_due_on?: string | null;
          school_id?: string | null;
        };
        Update: {
          cbse_affiliation_status?: Database['core']['Enums']['affiliation_status'] | null;
          employment_compliance_enabled?: never;
          employment_gate_message?: never;
          funding_status?: Database['core']['Enums']['school_funding_status'] | null;
          last_reviewed_on?: string | null;
          professional_growth_enabled?: never;
          review_due_on?: string | null;
          school_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'school_regulatory_profile_school_id_fkey';
            columns: ['school_id'];
            isOneToOne: true;
            referencedRelation: 'school';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      assert_employment_compliance_enabled: {
        Args: { p_school_id: string };
        Returns: undefined;
      };
      can_view_staff_record: {
        Args: { p_teacher_profile_id: string };
        Returns: boolean;
      };
      current_user_id: { Args: never; Returns: string };
      employment_compliance_enabled: {
        Args: { p_school_id: string };
        Returns: boolean;
      };
      employment_gate_message: { Args: never; Returns: string };
      has_permission: {
        Args: { p_permission: string; p_school_id: string };
        Returns: boolean;
      };
      is_member_of: { Args: { p_school_id: string }; Returns: boolean };
      provision_school_roles: {
        Args: { p_school_id: string };
        Returns: undefined;
      };
      shares_school_with_directory_access: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      user_school_ids: { Args: never; Returns: string[] };
    };
    Enums: {
      affiliation_status:
        'provisional' | 'regular' | 'extended' | 'applied' | 'withdrawn' | 'unverified';
      assignment_scope_type: 'school' | 'department' | 'school_stage' | 'individual';
      employment_status: 'active' | 'probation' | 'on_leave' | 'notice_period' | 'separated';
      minority_status: 'minority' | 'non_minority' | 'unverified';
      school_funding_status:
        'private_unaided' | 'private_aided' | 'government' | 'other' | 'unverified';
      school_ownership_type:
        'society' | 'trust' | 'section_8_company' | 'government_body' | 'other' | 'unverified';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  evidence: {
    Tables: {
      evidence: {
        Row: {
          academic_year_id: string;
          content_type: string | null;
          created_at: string;
          description: string | null;
          evidence_type_id: string;
          file_name: string | null;
          file_size_bytes: number | null;
          id: string;
          occurred_on: string | null;
          reflection: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          school_id: string;
          status: Database['evidence']['Enums']['status'];
          storage_bucket: string | null;
          storage_path: string | null;
          submitted_at: string | null;
          teacher_profile_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          content_type?: string | null;
          created_at?: string;
          description?: string | null;
          evidence_type_id: string;
          file_name?: string | null;
          file_size_bytes?: number | null;
          id?: string;
          occurred_on?: string | null;
          reflection?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          school_id: string;
          status?: Database['evidence']['Enums']['status'];
          storage_bucket?: string | null;
          storage_path?: string | null;
          submitted_at?: string | null;
          teacher_profile_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          content_type?: string | null;
          created_at?: string;
          description?: string | null;
          evidence_type_id?: string;
          file_name?: string | null;
          file_size_bytes?: number | null;
          id?: string;
          occurred_on?: string | null;
          reflection?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          school_id?: string;
          status?: Database['evidence']['Enums']['status'];
          storage_bucket?: string | null;
          storage_path?: string | null;
          submitted_at?: string | null;
          teacher_profile_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'evidence_evidence_type_id_fkey';
            columns: ['evidence_type_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_type';
            referencedColumns: ['id'];
          },
        ];
      };
      evidence_link: {
        Row: {
          competency_id: string | null;
          created_at: string;
          created_by: string | null;
          evidence_id: string;
          id: string;
          indicator_id: string | null;
          note: string | null;
          school_id: string;
          teacher_kpi_id: string | null;
        };
        Insert: {
          competency_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          evidence_id: string;
          id?: string;
          indicator_id?: string | null;
          note?: string | null;
          school_id: string;
          teacher_kpi_id?: string | null;
        };
        Update: {
          competency_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          evidence_id?: string;
          id?: string;
          indicator_id?: string | null;
          note?: string | null;
          school_id?: string;
          teacher_kpi_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'evidence_link_evidence_id_fkey';
            columns: ['evidence_id'];
            isOneToOne: false;
            referencedRelation: 'evidence';
            referencedColumns: ['id'];
          },
        ];
      };
      evidence_type: {
        Row: {
          contains_student_data: boolean;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          key: string;
          name: string;
          school_id: string;
          sort_order: number;
          submission_guidance: string | null;
        };
        Insert: {
          contains_student_data?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          name: string;
          school_id: string;
          sort_order?: number;
          submission_guidance?: string | null;
        };
        Update: {
          contains_student_data?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          name?: string;
          school_id?: string;
          sort_order?: number;
          submission_guidance?: string | null;
        };
        Relationships: [];
      };
      requirement: {
        Row: {
          academic_year_id: string;
          created_at: string;
          description: string | null;
          evidence_type_id: string;
          external_reference: string | null;
          id: string;
          minimum_count: number;
          role_key: string | null;
          school_id: string;
          school_stage_id: string | null;
          source_alignment: Database['competency']['Enums']['source_alignment'];
          source_framework: Database['competency']['Enums']['source_framework'];
          teacher_category_id: string | null;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          created_at?: string;
          description?: string | null;
          evidence_type_id: string;
          external_reference?: string | null;
          id?: string;
          minimum_count?: number;
          role_key?: string | null;
          school_id: string;
          school_stage_id?: string | null;
          source_alignment?: Database['competency']['Enums']['source_alignment'];
          source_framework?: Database['competency']['Enums']['source_framework'];
          teacher_category_id?: string | null;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          created_at?: string;
          description?: string | null;
          evidence_type_id?: string;
          external_reference?: string | null;
          id?: string;
          minimum_count?: number;
          role_key?: string | null;
          school_id?: string;
          school_stage_id?: string | null;
          source_alignment?: Database['competency']['Enums']['source_alignment'];
          source_framework?: Database['competency']['Enums']['source_framework'];
          teacher_category_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'requirement_evidence_type_id_fkey';
            columns: ['evidence_type_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_type';
            referencedColumns: ['id'];
          },
        ];
      };
      status_history: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          evidence_id: string;
          from_status: Database['evidence']['Enums']['status'] | null;
          id: number;
          note: string | null;
          school_id: string;
          to_status: Database['evidence']['Enums']['status'];
        };
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          evidence_id: string;
          from_status?: Database['evidence']['Enums']['status'] | null;
          id?: never;
          note?: string | null;
          school_id: string;
          to_status: Database['evidence']['Enums']['status'];
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          evidence_id?: string;
          from_status?: Database['evidence']['Enums']['status'] | null;
          id?: never;
          note?: string | null;
          school_id?: string;
          to_status?: Database['evidence']['Enums']['status'];
        };
        Relationships: [
          {
            foreignKeyName: 'status_history_evidence_id_fkey';
            columns: ['evidence_id'];
            isOneToOne: false;
            referencedRelation: 'evidence';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      provision_default_types: {
        Args: { p_school_id: string };
        Returns: number;
      };
    };
    Enums: {
      status:
        | 'draft'
        | 'submitted'
        | 'under_review'
        | 'verified'
        | 'returned_for_clarification'
        | 'rejected';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  growth: {
    Tables: {
      professional_goal: {
        Row: {
          academic_year_id: string;
          competency_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          school_id: string;
          status: string;
          success_measure: string | null;
          target_date: string | null;
          teacher_profile_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          competency_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          school_id: string;
          status?: string;
          success_measure?: string | null;
          target_date?: string | null;
          teacher_profile_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          competency_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          school_id?: string;
          status?: string;
          success_measure?: string | null;
          target_date?: string | null;
          teacher_profile_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  kpi: {
    Tables: {
      category: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          key: string;
          name: string;
          school_id: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          name: string;
          school_id: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          name?: string;
          school_id?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      school_policy: {
        Row: {
          academic_year_id: string;
          created_at: string;
          id: string;
          max_student_outcome_weight_pct: number;
          min_kpi_count: number;
          notes: string | null;
          require_weights_total_100: boolean;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          created_at?: string;
          id?: string;
          max_student_outcome_weight_pct?: number;
          min_kpi_count?: number;
          notes?: string | null;
          require_weights_total_100?: boolean;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          created_at?: string;
          id?: string;
          max_student_outcome_weight_pct?: number;
          min_kpi_count?: number;
          notes?: string | null;
          require_weights_total_100?: boolean;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      teacher_kpi: {
        Row: {
          academic_year_id: string;
          assigned_at: string | null;
          assigned_by: string | null;
          category_id: string;
          created_at: string;
          data_source: string;
          description: string;
          direction: Database['kpi']['Enums']['measurement_direction'];
          evidence_requirement: string | null;
          external_reference: string | null;
          frequency: Database['kpi']['Enums']['frequency'];
          id: string;
          is_student_outcome_measure: boolean;
          metric: string;
          name: string;
          reviewer_user_id: string | null;
          school_id: string;
          source_alignment: Database['competency']['Enums']['source_alignment'];
          source_framework: Database['competency']['Enums']['source_framework'];
          status: Database['kpi']['Enums']['assignment_status'];
          target: string;
          teacher_profile_id: string;
          template_id: string | null;
          unit: string | null;
          updated_at: string;
          weight: number;
        };
        Insert: {
          academic_year_id: string;
          assigned_at?: string | null;
          assigned_by?: string | null;
          category_id: string;
          created_at?: string;
          data_source: string;
          description: string;
          direction: Database['kpi']['Enums']['measurement_direction'];
          evidence_requirement?: string | null;
          external_reference?: string | null;
          frequency: Database['kpi']['Enums']['frequency'];
          id?: string;
          is_student_outcome_measure?: boolean;
          metric: string;
          name: string;
          reviewer_user_id?: string | null;
          school_id: string;
          source_alignment?: Database['competency']['Enums']['source_alignment'];
          source_framework?: Database['competency']['Enums']['source_framework'];
          status?: Database['kpi']['Enums']['assignment_status'];
          target: string;
          teacher_profile_id: string;
          template_id?: string | null;
          unit?: string | null;
          updated_at?: string;
          weight: number;
        };
        Update: {
          academic_year_id?: string;
          assigned_at?: string | null;
          assigned_by?: string | null;
          category_id?: string;
          created_at?: string;
          data_source?: string;
          description?: string;
          direction?: Database['kpi']['Enums']['measurement_direction'];
          evidence_requirement?: string | null;
          external_reference?: string | null;
          frequency?: Database['kpi']['Enums']['frequency'];
          id?: string;
          is_student_outcome_measure?: boolean;
          metric?: string;
          name?: string;
          reviewer_user_id?: string | null;
          school_id?: string;
          source_alignment?: Database['competency']['Enums']['source_alignment'];
          source_framework?: Database['competency']['Enums']['source_framework'];
          status?: Database['kpi']['Enums']['assignment_status'];
          target?: string;
          teacher_profile_id?: string;
          template_id?: string | null;
          unit?: string | null;
          updated_at?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'teacher_kpi_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'category';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teacher_kpi_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'template';
            referencedColumns: ['id'];
          },
        ];
      };
      template: {
        Row: {
          category_id: string;
          created_at: string;
          data_source: string;
          default_target: string | null;
          default_weight: number | null;
          description: string;
          direction: Database['kpi']['Enums']['measurement_direction'];
          evidence_requirement: string | null;
          external_reference: string | null;
          frequency: Database['kpi']['Enums']['frequency'];
          id: string;
          is_student_outcome_measure: boolean;
          key: string;
          metric: string;
          name: string;
          retired_at: string | null;
          retired_by: string | null;
          retirement_reason: string | null;
          school_id: string;
          source_alignment: Database['competency']['Enums']['source_alignment'];
          source_framework: Database['competency']['Enums']['source_framework'];
          status: Database['competency']['Enums']['lifecycle_status'];
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          data_source: string;
          default_target?: string | null;
          default_weight?: number | null;
          description: string;
          direction: Database['kpi']['Enums']['measurement_direction'];
          evidence_requirement?: string | null;
          external_reference?: string | null;
          frequency: Database['kpi']['Enums']['frequency'];
          id?: string;
          is_student_outcome_measure?: boolean;
          key: string;
          metric: string;
          name: string;
          retired_at?: string | null;
          retired_by?: string | null;
          retirement_reason?: string | null;
          school_id: string;
          source_alignment?: Database['competency']['Enums']['source_alignment'];
          source_framework?: Database['competency']['Enums']['source_framework'];
          status?: Database['competency']['Enums']['lifecycle_status'];
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          data_source?: string;
          default_target?: string | null;
          default_weight?: number | null;
          description?: string;
          direction?: Database['kpi']['Enums']['measurement_direction'];
          evidence_requirement?: string | null;
          external_reference?: string | null;
          frequency?: Database['kpi']['Enums']['frequency'];
          id?: string;
          is_student_outcome_measure?: boolean;
          key?: string;
          metric?: string;
          name?: string;
          retired_at?: string | null;
          retired_by?: string | null;
          retirement_reason?: string | null;
          school_id?: string;
          source_alignment?: Database['competency']['Enums']['source_alignment'];
          source_framework?: Database['competency']['Enums']['source_framework'];
          status?: Database['competency']['Enums']['lifecycle_status'];
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kpi_template_category_fk';
            columns: ['category_id', 'school_id'];
            isOneToOne: false;
            referencedRelation: 'category';
            referencedColumns: ['id', 'school_id'];
          },
        ];
      };
      template_applicability: {
        Row: {
          created_at: string;
          id: string;
          role_key: string | null;
          school_id: string;
          school_stage_id: string | null;
          teacher_category_id: string | null;
          template_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role_key?: string | null;
          school_id: string;
          school_stage_id?: string | null;
          teacher_category_id?: string | null;
          template_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role_key?: string | null;
          school_id?: string;
          school_stage_id?: string | null;
          teacher_category_id?: string | null;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kpi_template_applicability_fk';
            columns: ['template_id', 'school_id'];
            isOneToOne: false;
            referencedRelation: 'template';
            referencedColumns: ['id', 'school_id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      provision_default_catalogue: {
        Args: { p_school_id: string };
        Returns: number;
      };
      validate_teacher_kpi_set: {
        Args: { p_academic_year_id: string; p_teacher_profile_id: string };
        Returns: {
          detail: string;
          issue_code: string;
        }[];
      };
    };
    Enums: {
      assignment_status: 'draft' | 'assigned' | 'active' | 'closed' | 'cancelled';
      frequency: 'continuous' | 'monthly' | 'termly' | 'semester' | 'annual';
      measurement_direction: 'increase' | 'decrease' | 'maintain' | 'qualitative';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  regulatory: {
    Tables: {
      authority: {
        Row: {
          created_at: string;
          id: string;
          key: string;
          layer: Database['regulatory']['Enums']['authority_layer'];
          name: string;
          official_website: string | null;
          school_id: string | null;
          short_name: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          key: string;
          layer: Database['regulatory']['Enums']['authority_layer'];
          name: string;
          official_website?: string | null;
          school_id?: string | null;
          short_name?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          key?: string;
          layer?: Database['regulatory']['Enums']['authority_layer'];
          name?: string;
          official_website?: string | null;
          school_id?: string | null;
          short_name?: string | null;
        };
        Relationships: [];
      };
      recalculation_authorisation: {
        Row: {
          academic_year_id: string;
          authorised_at: string;
          authorised_by: string;
          id: string;
          reason: string;
          school_id: string;
          valid_until: string;
        };
        Insert: {
          academic_year_id: string;
          authorised_at?: string;
          authorised_by: string;
          id?: string;
          reason: string;
          school_id: string;
          valid_until: string;
        };
        Update: {
          academic_year_id?: string;
          authorised_at?: string;
          authorised_by?: string;
          id?: string;
          reason?: string;
          school_id?: string;
          valid_until?: string;
        };
        Relationships: [];
      };
      requirement: {
        Row: {
          applicability_note: string | null;
          classification: Database['regulatory']['Enums']['requirement_classification'];
          clause_reference: string | null;
          created_at: string;
          created_by: string | null;
          effective_from: string | null;
          effective_to: string | null;
          evidence_required: string | null;
          id: string;
          last_reviewed_on: string | null;
          notes: string | null;
          requirement_key: string;
          requirement_text: string;
          review_due_on: string | null;
          school_id: string | null;
          source_id: string;
          superseded_by_id: string | null;
          supersedes_id: string | null;
          title: string;
          updated_at: string;
          verification_status: Database['regulatory']['Enums']['verification_status'];
          version: number;
        };
        Insert: {
          applicability_note?: string | null;
          classification: Database['regulatory']['Enums']['requirement_classification'];
          clause_reference?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          evidence_required?: string | null;
          id?: string;
          last_reviewed_on?: string | null;
          notes?: string | null;
          requirement_key: string;
          requirement_text: string;
          review_due_on?: string | null;
          school_id?: string | null;
          source_id: string;
          superseded_by_id?: string | null;
          supersedes_id?: string | null;
          title: string;
          updated_at?: string;
          verification_status?: Database['regulatory']['Enums']['verification_status'];
          version?: number;
        };
        Update: {
          applicability_note?: string | null;
          classification?: Database['regulatory']['Enums']['requirement_classification'];
          clause_reference?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          evidence_required?: string | null;
          id?: string;
          last_reviewed_on?: string | null;
          notes?: string | null;
          requirement_key?: string;
          requirement_text?: string;
          review_due_on?: string | null;
          school_id?: string | null;
          source_id?: string;
          superseded_by_id?: string | null;
          supersedes_id?: string | null;
          title?: string;
          updated_at?: string;
          verification_status?: Database['regulatory']['Enums']['verification_status'];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'requirement_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'source';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requirement_superseded_by_id_fkey';
            columns: ['superseded_by_id'];
            isOneToOne: false;
            referencedRelation: 'requirement';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requirement_supersedes_id_fkey';
            columns: ['supersedes_id'];
            isOneToOne: false;
            referencedRelation: 'requirement';
            referencedColumns: ['id'];
          },
        ];
      };
      requirement_employee_category: {
        Row: {
          employee_category: string;
          requirement_id: string;
        };
        Insert: {
          employee_category: string;
          requirement_id: string;
        };
        Update: {
          employee_category?: string;
          requirement_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'requirement_employee_category_requirement_id_fkey';
            columns: ['requirement_id'];
            isOneToOne: false;
            referencedRelation: 'requirement';
            referencedColumns: ['id'];
          },
        ];
      };
      requirement_school_type: {
        Row: {
          requirement_id: string;
          school_type: Database['regulatory']['Enums']['school_type_applicability'];
        };
        Insert: {
          requirement_id: string;
          school_type: Database['regulatory']['Enums']['school_type_applicability'];
        };
        Update: {
          requirement_id?: string;
          school_type?: Database['regulatory']['Enums']['school_type_applicability'];
        };
        Relationships: [
          {
            foreignKeyName: 'requirement_school_type_requirement_id_fkey';
            columns: ['requirement_id'];
            isOneToOne: false;
            referencedRelation: 'requirement';
            referencedColumns: ['id'];
          },
        ];
      };
      ruleset_snapshot: {
        Row: {
          academic_year_id: string;
          id: string;
          locked_at: string;
          locked_by: string;
          school_id: string;
          snapshot: Json;
        };
        Insert: {
          academic_year_id: string;
          id?: string;
          locked_at?: string;
          locked_by: string;
          school_id: string;
          snapshot: Json;
        };
        Update: {
          academic_year_id?: string;
          id?: string;
          locked_at?: string;
          locked_by?: string;
          school_id?: string;
          snapshot?: Json;
        };
        Relationships: [];
      };
      school_requirement_status: {
        Row: {
          applicability: Database['regulatory']['Enums']['verification_status'];
          created_at: string;
          determination_note: string | null;
          determined_at: string | null;
          determined_by: string | null;
          id: string;
          is_enforced: boolean;
          last_reviewed_on: string | null;
          requirement_id: string;
          review_due_on: string | null;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          applicability?: Database['regulatory']['Enums']['verification_status'];
          created_at?: string;
          determination_note?: string | null;
          determined_at?: string | null;
          determined_by?: string | null;
          id?: string;
          is_enforced?: boolean;
          last_reviewed_on?: string | null;
          requirement_id: string;
          review_due_on?: string | null;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          applicability?: Database['regulatory']['Enums']['verification_status'];
          created_at?: string;
          determination_note?: string | null;
          determined_at?: string | null;
          determined_by?: string | null;
          id?: string;
          is_enforced?: boolean;
          last_reviewed_on?: string | null;
          requirement_id?: string;
          review_due_on?: string | null;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'school_requirement_status_requirement_id_fkey';
            columns: ['requirement_id'];
            isOneToOne: false;
            referencedRelation: 'requirement';
            referencedColumns: ['id'];
          },
        ];
      };
      source: {
        Row: {
          authority_id: string;
          content_sha256: string | null;
          created_at: string;
          created_by: string | null;
          document_type: string;
          effective_from: string | null;
          effective_to: string | null;
          id: string;
          issued_on: string | null;
          last_reviewed_on: string | null;
          notes: string | null;
          reference_number: string | null;
          retrieved_at: string | null;
          review_due_on: string | null;
          school_id: string | null;
          source_url: string | null;
          superseded_by_id: string | null;
          title: string;
          updated_at: string;
          verification_status: Database['regulatory']['Enums']['verification_status'];
          verified_at: string | null;
          verified_by: string | null;
          version_label: string;
        };
        Insert: {
          authority_id: string;
          content_sha256?: string | null;
          created_at?: string;
          created_by?: string | null;
          document_type: string;
          effective_from?: string | null;
          effective_to?: string | null;
          id?: string;
          issued_on?: string | null;
          last_reviewed_on?: string | null;
          notes?: string | null;
          reference_number?: string | null;
          retrieved_at?: string | null;
          review_due_on?: string | null;
          school_id?: string | null;
          source_url?: string | null;
          superseded_by_id?: string | null;
          title: string;
          updated_at?: string;
          verification_status?: Database['regulatory']['Enums']['verification_status'];
          verified_at?: string | null;
          verified_by?: string | null;
          version_label?: string;
        };
        Update: {
          authority_id?: string;
          content_sha256?: string | null;
          created_at?: string;
          created_by?: string | null;
          document_type?: string;
          effective_from?: string | null;
          effective_to?: string | null;
          id?: string;
          issued_on?: string | null;
          last_reviewed_on?: string | null;
          notes?: string | null;
          reference_number?: string | null;
          retrieved_at?: string | null;
          review_due_on?: string | null;
          school_id?: string | null;
          source_url?: string | null;
          superseded_by_id?: string | null;
          title?: string;
          updated_at?: string;
          verification_status?: Database['regulatory']['Enums']['verification_status'];
          verified_at?: string | null;
          verified_by?: string | null;
          version_label?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'source_authority_id_fkey';
            columns: ['authority_id'];
            isOneToOne: false;
            referencedRelation: 'authority';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'source_superseded_by_id_fkey';
            columns: ['superseded_by_id'];
            isOneToOne: false;
            referencedRelation: 'source';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_enforceable_for_school: {
        Args: {
          p_as_of?: string;
          p_requirement_key: string;
          p_school_id: string;
        };
        Returns: boolean;
      };
      may_recalculate_year: {
        Args: { p_academic_year_id: string; p_school_id: string };
        Returns: boolean;
      };
      requirement_as_of: {
        Args: { p_as_of: string; p_requirement_key: string };
        Returns: {
          applicability_note: string | null;
          classification: Database['regulatory']['Enums']['requirement_classification'];
          clause_reference: string | null;
          created_at: string;
          created_by: string | null;
          effective_from: string | null;
          effective_to: string | null;
          evidence_required: string | null;
          id: string;
          last_reviewed_on: string | null;
          notes: string | null;
          requirement_key: string;
          requirement_text: string;
          review_due_on: string | null;
          school_id: string | null;
          source_id: string;
          superseded_by_id: string | null;
          supersedes_id: string | null;
          title: string;
          updated_at: string;
          verification_status: Database['regulatory']['Enums']['verification_status'];
          version: number;
        };
        SetofOptions: {
          from: '*';
          to: 'requirement';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      authority_layer: 'central' | 'cbse' | 'state' | 'school';
      requirement_classification: 'mandatory' | 'recommended' | 'school_policy';
      school_type_applicability:
        'private_unaided' | 'private_aided' | 'government' | 'all_school_types';
      verification_status:
        | 'verified'
        | 'requires_verification'
        | 'superseded'
        | 'not_applicable'
        | 'potentially_applicable';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  audit: {
    Enums: {
      event_source: ['ui', 'api', 'system', 'import', 'migration'],
    },
  },
  competency: {
    Enums: {
      lifecycle_status: ['draft', 'active', 'retired'],
      source_alignment: ['aligned', 'derived', 'school_defined'],
      source_framework: ['npst', 'cbse', 'punjab', 'school', 'other_framework'],
    },
  },
  core: {
    Enums: {
      affiliation_status: [
        'provisional',
        'regular',
        'extended',
        'applied',
        'withdrawn',
        'unverified',
      ],
      assignment_scope_type: ['school', 'department', 'school_stage', 'individual'],
      employment_status: ['active', 'probation', 'on_leave', 'notice_period', 'separated'],
      minority_status: ['minority', 'non_minority', 'unverified'],
      school_funding_status: [
        'private_unaided',
        'private_aided',
        'government',
        'other',
        'unverified',
      ],
      school_ownership_type: [
        'society',
        'trust',
        'section_8_company',
        'government_body',
        'other',
        'unverified',
      ],
    },
  },
  evidence: {
    Enums: {
      status: [
        'draft',
        'submitted',
        'under_review',
        'verified',
        'returned_for_clarification',
        'rejected',
      ],
    },
  },
  growth: {
    Enums: {},
  },
  kpi: {
    Enums: {
      assignment_status: ['draft', 'assigned', 'active', 'closed', 'cancelled'],
      frequency: ['continuous', 'monthly', 'termly', 'semester', 'annual'],
      measurement_direction: ['increase', 'decrease', 'maintain', 'qualitative'],
    },
  },
  public: {
    Enums: {},
  },
  regulatory: {
    Enums: {
      authority_layer: ['central', 'cbse', 'state', 'school'],
      requirement_classification: ['mandatory', 'recommended', 'school_policy'],
      school_type_applicability: [
        'private_unaided',
        'private_aided',
        'government',
        'all_school_types',
      ],
      verification_status: [
        'verified',
        'requires_verification',
        'superseded',
        'not_applicable',
        'potentially_applicable',
      ],
    },
  },
} as const;
