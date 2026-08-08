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
      cached_hidden_bandi: {
        Row: {
          bando_id: string
          codice_istat: string | null
          competition_index: number | null
          comune: string | null
          discovered_at: string
          fonte_extratestuale: string | null
          id: string
          payload: Json
          provincia: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bando_id: string
          codice_istat?: string | null
          competition_index?: number | null
          comune?: string | null
          discovered_at?: string
          fonte_extratestuale?: string | null
          id?: string
          payload: Json
          provincia?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bando_id?: string
          codice_istat?: string | null
          competition_index?: number | null
          comune?: string | null
          discovered_at?: string
          fonte_extratestuale?: string | null
          id?: string
          payload?: Json
          provincia?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      company_profiles: {
        Row: {
          anno_costituzione: number
          ateco_secondari: string[]
          codice_ateco: string
          codice_istat: string | null
          comune: string
          created_at: string
          de_minimis_ultimi_3_anni: number | null
          dimensione_impresa: string | null
          disponibile_consorzio_europeo: boolean
          email_referente: string | null
          fatturato_annuo: number
          forma_giuridica: Database["public"]["Enums"]["legal_form"]
          id: string
          imprenditoria_femminile: boolean
          impresa_giovanile: boolean
          impresa_in_difficolta: boolean
          investimenti_previsti: string[]
          legale_rappresentante: string | null
          numero_dipendenti: number
          paese_sede: string
          partita_iva: string
          pec: string | null
          pmi_innovativa: boolean
          provincia: string
          ragione_sociale: string
          regione: string
          spesa_prevista: number | null
          startup_innovativa: boolean
          telefono: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anno_costituzione: number
          ateco_secondari?: string[]
          codice_ateco: string
          codice_istat?: string | null
          comune: string
          created_at?: string
          de_minimis_ultimi_3_anni?: number | null
          dimensione_impresa?: string | null
          disponibile_consorzio_europeo?: boolean
          email_referente?: string | null
          fatturato_annuo?: number
          forma_giuridica: Database["public"]["Enums"]["legal_form"]
          id?: string
          imprenditoria_femminile?: boolean
          impresa_giovanile?: boolean
          impresa_in_difficolta?: boolean
          investimenti_previsti?: string[]
          legale_rappresentante?: string | null
          numero_dipendenti?: number
          paese_sede?: string
          partita_iva: string
          pec?: string | null
          pmi_innovativa?: boolean
          provincia: string
          ragione_sociale: string
          regione: string
          spesa_prevista?: number | null
          startup_innovativa?: boolean
          telefono?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anno_costituzione?: number
          ateco_secondari?: string[]
          codice_ateco?: string
          codice_istat?: string | null
          comune?: string
          created_at?: string
          de_minimis_ultimi_3_anni?: number | null
          dimensione_impresa?: string | null
          disponibile_consorzio_europeo?: boolean
          email_referente?: string | null
          fatturato_annuo?: number
          forma_giuridica?: Database["public"]["Enums"]["legal_form"]
          id?: string
          imprenditoria_femminile?: boolean
          impresa_giovanile?: boolean
          impresa_in_difficolta?: boolean
          investimenti_previsti?: string[]
          legale_rappresentante?: string | null
          numero_dipendenti?: number
          paese_sede?: string
          partita_iva?: string
          pec?: string | null
          pmi_innovativa?: boolean
          provincia?: string
          ragione_sociale?: string
          regione?: string
          spesa_prevista?: number | null
          startup_innovativa?: boolean
          telefono?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_notifications: {
        Row: {
          body: string
          created_at: string
          emailed_at: string | null
          id: string
          notification_type: string
          opportunity_id: string
          payload: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          emailed_at?: string | null
          id?: string
          notification_type: string
          opportunity_id: string
          payload?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          emailed_at?: string | null
          id?: string
          notification_type?: string
          opportunity_id?: string
          payload?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      feed_cache: {
        Row: {
          fetched_at: string
          id: string
          payload: Json
          user_id: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          payload: Json
          user_id: string
        }
        Update: {
          fetched_at?: string
          id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          in_app_enabled: boolean
          morning_digest_enabled: boolean
          timezone: string
          updated_at: string
          urgent_enabled: boolean
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          in_app_enabled?: boolean
          morning_digest_enabled?: boolean
          timezone?: string
          updated_at?: string
          urgent_enabled?: boolean
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          in_app_enabled?: boolean
          morning_digest_enabled?: boolean
          timezone?: string
          updated_at?: string
          urgent_enabled?: boolean
          user_id?: string
        }
        Relationships: []
      }
      ueradar_billing_events: {
        Row: {
          attempts: number
          created_at: string
          error_code: string | null
          event_id: string
          event_type: string
          livemode: boolean
          object_id: string | null
          processed_at: string | null
          provider_customer_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_code?: string | null
          event_id: string
          event_type: string
          livemode?: boolean
          object_id?: string | null
          processed_at?: string | null
          provider_customer_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_code?: string | null
          event_id?: string
          event_type?: string
          livemode?: boolean
          object_id?: string | null
          processed_at?: string | null
          provider_customer_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ueradar_company_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          declared_role: string | null
          email: string
          first_name: string | null
          id: string
          invited_at: string
          last_name: string | null
          member_user_id: string | null
          owner_attested_at: string | null
          owner_user_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          declared_role?: string | null
          email: string
          first_name?: string | null
          id?: string
          invited_at?: string
          last_name?: string | null
          member_user_id?: string | null
          owner_attested_at?: string | null
          owner_user_id: string
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          declared_role?: string | null
          email?: string
          first_name?: string | null
          id?: string
          invited_at?: string
          last_name?: string | null
          member_user_id?: string | null
          owner_attested_at?: string | null
          owner_user_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ueradar_subscriptions: {
        Row: {
          billing_mode: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          latest_invoice_url: string | null
          plan_code: string
          plan_seats: number
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          stripe_price_id: string | null
          tax_id: string | null
          trial_consumed: boolean
          trial_ends_at: string
          trial_started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_mode?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          latest_invoice_url?: string | null
          plan_code?: string
          plan_seats?: number
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          stripe_price_id?: string | null
          tax_id?: string | null
          trial_consumed?: boolean
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_mode?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          latest_invoice_url?: string | null
          plan_code?: string
          plan_seats?: number
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          stripe_price_id?: string | null
          tax_id?: string | null
          trial_consumed?: boolean
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      legal_form:
        | "DITTA_INDIVIDUALE"
        | "SRL"
        | "SRLS"
        | "SPA"
        | "SAS"
        | "SNC"
        | "ALTRO"
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
      legal_form: [
        "DITTA_INDIVIDUALE",
        "SRL",
        "SRLS",
        "SPA",
        "SAS",
        "SNC",
        "ALTRO",
      ],
    },
  },
} as const
