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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      attribute_values: {
        Row: {
          attribute_id: string
          created_at: string
          id: string
          value: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          id?: string
          value: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_values_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      attributes: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_settings: {
        Row: {
          accent_color: string
          accepted_payment_methods: Database["public"]["Enums"]["payment_method"][]
          badge_bg_color: string
          badge_text_color: string
          button_bg_color: string
          button_text: string
          button_outline_color: string
          button_text_color: string
          card_bg_color: string
          card_border_color: string
          catalog_description: string
          catalog_layout: string
          catalog_title: string
          contact_link: string | null
          created_at: string
          filter_bg_color: string
          filter_text_color: string
          footer_bg_color: string
          footer_text_color: string
          header_bg_color: string
          header_text_color: string
          id: string
          primary_color: string
          price_color: string
          secondary_color: string
          show_contact: boolean
          show_prices: boolean
          store_id: string
          text_color: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          accepted_payment_methods?: Database["public"]["Enums"]["payment_method"][]
          badge_bg_color?: string
          badge_text_color?: string
          button_bg_color?: string
          button_text?: string
          button_outline_color?: string
          button_text_color?: string
          card_bg_color?: string
          card_border_color?: string
          catalog_description?: string
          catalog_layout?: string
          catalog_title?: string
          contact_link?: string | null
          created_at?: string
          filter_bg_color?: string
          filter_text_color?: string
          footer_bg_color?: string
          footer_text_color?: string
          header_bg_color?: string
          header_text_color?: string
          id?: string
          primary_color?: string
          price_color?: string
          secondary_color?: string
          show_contact?: boolean
          show_prices?: boolean
          store_id: string
          text_color?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          accepted_payment_methods?: Database["public"]["Enums"]["payment_method"][]
          badge_bg_color?: string
          badge_text_color?: string
          button_bg_color?: string
          button_text?: string
          button_outline_color?: string
          button_text_color?: string
          card_bg_color?: string
          card_border_color?: string
          catalog_description?: string
          catalog_layout?: string
          catalog_title?: string
          contact_link?: string | null
          created_at?: string
          filter_bg_color?: string
          filter_text_color?: string
          footer_bg_color?: string
          footer_text_color?: string
          header_bg_color?: string
          header_text_color?: string
          id?: string
          primary_color?: string
          price_color?: string
          secondary_color?: string
          show_contact?: boolean
          show_prices?: boolean
          store_id?: string
          text_color?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          catalog_accent_color: string | null
          catalog_layout: string | null
          catalog_primary_color: string | null
          catalog_secondary_color: string | null
          catalog_text_color: string | null
          catalog_header_bg_color: string | null
          catalog_header_text_color: string | null
          catalog_footer_bg_color: string | null
          catalog_footer_text_color: string | null
          catalog_price_color: string | null
          catalog_badge_bg_color: string | null
          catalog_badge_text_color: string | null
          catalog_button_bg_color: string | null
          catalog_button_text_color: string | null
          catalog_button_outline_color: string | null
          catalog_card_bg_color: string | null
          catalog_card_border_color: string | null
          catalog_filter_bg_color: string | null
          catalog_filter_text_color: string | null
          city: string | null
          latitude: number | null
          longitude: number | null
          created_at: string
          description: string | null
          document: string | null
          email: string | null
          completed: boolean
          facebook: string | null
          id: string
          instagram: string | null
          is_active: boolean
          logo_url: string | null
          signature_image_url: string | null
          signature_responsible: string | null
          signature_role: string | null
          minimum_delivery_value: number | null
          minimum_order_value: number | null
          mp_access_token: string | null
          name: string
          owner_user_id: string | null
          pagseguro_token: string | null
          phone: string | null
          pix_beneficiary_name: string | null
          pix_enabled: boolean
          pix_gateway: string | null
          pix_key: string | null
          pix_key_type: string | null
          plan_id: string | null
          slug: string
          state: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_end_date: string | null
          subscription_start_date: string | null
          subscription_status: string | null
          trial_active: boolean
          trial_ends_at: string | null
          updated_at: string
          whatsapp: string | null
          whatsapp_message_template: string | null
          order_status_message_templates: Json | null
          order_status_customization: Json | null
          role_module_permissions: Json | null
          birthday_message_template: string | null
        }
        Insert: {
          address?: string | null
          catalog_accent_color?: string | null
          catalog_layout?: string | null
          catalog_primary_color?: string | null
          catalog_secondary_color?: string | null
          catalog_text_color?: string | null
          catalog_header_bg_color?: string | null
          catalog_header_text_color?: string | null
          catalog_footer_bg_color?: string | null
          catalog_footer_text_color?: string | null
          catalog_price_color?: string | null
          catalog_badge_bg_color?: string | null
          catalog_badge_text_color?: string | null
          catalog_button_bg_color?: string | null
          catalog_button_text_color?: string | null
          catalog_button_outline_color?: string | null
          catalog_card_bg_color?: string | null
          catalog_card_border_color?: string | null
          catalog_filter_bg_color?: string | null
          catalog_filter_text_color?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
          description?: string | null
          document?: string | null
          email?: string | null
          completed?: boolean
          facebook?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean
          logo_url?: string | null
          signature_image_url?: string | null
          signature_responsible?: string | null
          signature_role?: string | null
          minimum_delivery_value?: number | null
          minimum_order_value?: number | null
          mp_access_token?: string | null
          name: string
          owner_user_id?: string | null
          pagseguro_token?: string | null
          phone?: string | null
          pix_beneficiary_name?: string | null
          pix_enabled?: boolean
          pix_gateway?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          plan_id?: string | null
          slug: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          trial_active?: boolean
          trial_ends_at?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_message_template?: string | null
          order_status_message_templates?: Json | null
          order_status_customization?: Json | null
          role_module_permissions?: Json | null
          birthday_message_template?: string | null
        }
        Update: {
          address?: string | null
          catalog_accent_color?: string | null
          catalog_layout?: string | null
          catalog_primary_color?: string | null
          catalog_secondary_color?: string | null
          catalog_text_color?: string | null
          catalog_header_bg_color?: string | null
          catalog_header_text_color?: string | null
          catalog_footer_bg_color?: string | null
          catalog_footer_text_color?: string | null
          catalog_price_color?: string | null
          catalog_badge_bg_color?: string | null
          catalog_badge_text_color?: string | null
          catalog_button_bg_color?: string | null
          catalog_button_text_color?: string | null
          catalog_button_outline_color?: string | null
          catalog_card_bg_color?: string | null
          catalog_card_border_color?: string | null
          catalog_filter_bg_color?: string | null
          catalog_filter_text_color?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
          description?: string | null
          document?: string | null
          email?: string | null
          completed?: boolean
          facebook?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean
          logo_url?: string | null
          signature_image_url?: string | null
          signature_responsible?: string | null
          signature_role?: string | null
          minimum_delivery_value?: number | null
          minimum_order_value?: number | null
          mp_access_token?: string | null
          name?: string
          owner_user_id?: string | null
          pagseguro_token?: string | null
          phone?: string | null
          pix_beneficiary_name?: string | null
          pix_enabled?: boolean
          pix_gateway?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          plan_id?: string | null
          slug?: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          trial_active?: boolean
          trial_ends_at?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_message_template?: string | null
          order_status_message_templates?: Json | null
          order_status_customization?: Json | null
          role_module_permissions?: Json | null
          birthday_message_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      company_payment_tokens: {
        Row: {
          company_id: string
          created_at: string
          mp_access_token: string | null
          pagseguro_token: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          mp_access_token?: string | null
          pagseguro_token?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          mp_access_token?: string | null
          pagseguro_token?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_payment_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_theme: {
        Row: {
          background_color: string
          border_color: string
          border_radius: string
          border_size: string
          button_color: string
          button_hover_color: string
          button_style: string
          card_color: string
          created_at: string
          dark_palette: Json | null
          font_family: string
          id: string
          layout_density: string
          light_palette: Json | null
          menu_hover_color: string
          primary_color: string
          secondary_color: string
          store_id: string
          text_color: string
          theme_mode: string
          updated_at: string
        }
        Insert: {
          background_color?: string
          border_color?: string
          border_radius?: string
          border_size?: string
          button_color?: string
          button_hover_color?: string
          button_style?: string
          card_color?: string
          created_at?: string
          dark_palette?: Json | null
          font_family?: string
          id?: string
          layout_density?: string
          light_palette?: Json | null
          menu_hover_color?: string
          primary_color?: string
          secondary_color?: string
          store_id: string
          text_color?: string
          theme_mode?: string
          updated_at?: string
        }
        Update: {
          background_color?: string
          border_color?: string
          border_radius?: string
          border_size?: string
          button_color?: string
          button_hover_color?: string
          button_style?: string
          card_color?: string
          created_at?: string
          dark_palette?: Json | null
          font_family?: string
          id?: string
          layout_density?: string
          light_palette?: Json | null
          menu_hover_color?: string
          primary_color?: string
          secondary_color?: string
          store_id?: string
          text_color?: string
          theme_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_theme_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          company_id: string | null
          created_at: string
          date_of_birth: string | null
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          photo_url: string | null
          phone: string | null
          state: string | null
          updated_at: string
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          photo_url?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          photo_url?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number | null
          allocation_method: string
          apply_to_product_cost: boolean
          category: string | null
          company_id: string
          created_at: string
          description: string | null
          due_date: string | null
          due_day: number | null
          expense_date: string | null
          expense_type: string
          id: string
          monthly_amount: number | null
          name: string
          paid_amount: number | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          allocation_method?: string
          apply_to_product_cost?: boolean
          category?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_day?: number | null
          expense_date?: string | null
          expense_type: string
          id?: string
          monthly_amount?: number | null
          name: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          allocation_method?: string
          apply_to_product_cost?: boolean
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_day?: number | null
          expense_date?: string | null
          expense_type?: string
          id?: string
          monthly_amount?: number | null
          name?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_entries: {
        Row: {
          amount: number
          category_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          is_automatic: boolean
          notes: string | null
          occurred_at: string
          origin: Database["public"]["Enums"]["financial_entry_origin"]
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          related_id: string | null
          status: Database["public"]["Enums"]["financial_entry_status"]
          type: Database["public"]["Enums"]["financial_entry_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_automatic?: boolean
          notes?: string | null
          occurred_at?: string
          origin?: Database["public"]["Enums"]["financial_entry_origin"]
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          related_id?: string | null
          status?: Database["public"]["Enums"]["financial_entry_status"]
          type: Database["public"]["Enums"]["financial_entry_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_automatic?: boolean
          notes?: string | null
          occurred_at?: string
          origin?: Database["public"]["Enums"]["financial_entry_origin"]
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          related_id?: string | null
          status?: Database["public"]["Enums"]["financial_entry_status"]
          type?: Database["public"]["Enums"]["financial_entry_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          attributes: Json | null
          created_at: string
          discount: number
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          attributes?: Json | null
          created_at?: string
          discount?: number
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Update: {
          attributes?: Json | null
          created_at?: string
          discount?: number
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid: number
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_user_id: string | null
          customer_name: string | null
          delivered_at: string | null
          delivered_by: string | null
          discount: number
          estimated_delivery_date: string | null
          gateway: string | null
          gateway_order_id: string | null
          id: string
          notes: string | null
          order_number: number
          paid_at: string | null
          payment_copy_paste: string | null
          payment_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_qr_code: string | null
          payment_link_id: string | null
          payment_link_url: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          production_time_days_used: number | null
          show_notes_on_pdf: boolean
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_user_id?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          discount?: number
          estimated_delivery_date?: string | null
          gateway?: string | null
          gateway_order_id?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          paid_at?: string | null
          payment_copy_paste?: string | null
          payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_qr_code?: string | null
          payment_link_id?: string | null
          payment_link_url?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          production_time_days_used?: number | null
          show_notes_on_pdf?: boolean
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_user_id?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          discount?: number
          estimated_delivery_date?: string | null
          gateway?: string | null
          gateway_order_id?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          paid_at?: string | null
          payment_copy_paste?: string | null
          payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_qr_code?: string | null
          payment_link_id?: string | null
          payment_link_url?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          production_time_days_used?: number | null
          show_notes_on_pdf?: boolean
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_art_files: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          file_name: string
          file_type: string | null
          id: string
          order_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          file_name: string
          file_type?: string | null
          id?: string
          order_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          file_name?: string
          file_type?: string | null
          id?: string
          order_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_art_files_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_art_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notifications: {
        Row: {
          body: string | null
          company_id: string | null
          created_at: string
          id: string
          order_id: string | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string
          created_by: string | null
          gateway: string | null
          gateway_order_id: string | null
          gateway_transaction_id: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          order_id: string
          paid_at: string | null
          raw_payload: Json | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          gateway?: string | null
          gateway_order_id?: string | null
          gateway_transaction_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          order_id: string
          paid_at?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          gateway?: string | null
          gateway_order_id?: string | null
          gateway_transaction_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_public_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          order_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_public_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_period: string
          cakto_plan_id: string | null
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_orders_per_month: number | null
          max_products: number | null
          max_users: number | null
          name: string
          period_days: number
          price: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          yampi_checkout_url: string | null
          yampi_product_id: string | null
          yampi_sku_id: string | null
          updated_at: string
        }
        Insert: {
          billing_period?: string
          cakto_plan_id?: string | null
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_orders_per_month?: number | null
          max_products?: number | null
          max_users?: number | null
          name: string
          period_days?: number
          price?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          yampi_checkout_url?: string | null
          yampi_product_id?: string | null
          yampi_sku_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_period?: string
          cakto_plan_id?: string | null
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_orders_per_month?: number | null
          max_products?: number | null
          max_users?: number | null
          name?: string
          period_days?: number
          price?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          yampi_checkout_url?: string | null
          yampi_product_id?: string | null
          yampi_sku_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      price_tiers: {
        Row: {
          created_at: string
          id: string
          max_quantity: number | null
          min_quantity: number
          price: number
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_quantity?: number | null
          min_quantity?: number
          price: number
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_quantity?: number | null
          min_quantity?: number
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          fee_percentage: number
          id: string
          is_active: boolean
          name: string
          sort_order: number
          type: Database["public"]["Enums"]["payment_method"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          fee_percentage?: number
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          type: Database["public"]["Enums"]["payment_method"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          fee_percentage?: number
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["payment_method"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          attribute_value_id: string
          created_at: string
          id: string
          price_modifier: number
          product_id: string
        }
        Insert: {
          attribute_value_id: string
          created_at?: string
          id?: string
          price_modifier?: number
          product_id: string
        }
        Update: {
          attribute_value_id?: string
          created_at?: string
          id?: string
          price_modifier?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_attribute_value_id_fkey"
            columns: ["attribute_value_id"]
            isOneToOne: false
            referencedRelation: "attribute_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_supplies: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          supply_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          supply_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          supply_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_supplies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_supplies_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          company_id: string
          created_at: string
          id: string
          is_approved: boolean
          product_id: string
          rating: number
          review_image_urls: string[]
          reviewer_name: string
          reviewer_phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_approved?: boolean
          product_id: string
          rating: number
          review_image_urls?: string[]
          reviewer_name: string
          reviewer_phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_approved?: boolean
          product_id?: string
          rating?: number
          review_image_urls?: string[]
          reviewer_name?: string
          reviewer_phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_cost: number
          barcode: string | null
          category_id: string | null
          company_id: string | null
          created_at: string
          description: string | null
          expense_percentage: number
          final_price: number | null
          id: string
          image_url: string | null
          image_urls: Json
          is_copy: boolean
          is_active: boolean
          is_public: boolean
          labor_cost: number
          min_order_quantity: number
          min_stock: number
          name: string
          original_product_id: string | null
          owner_id: string
          product_type: Database["public"]["Enums"]["product_type"]
          personalization_enabled: boolean
          production_time_days: number | null
          product_colors: Json
          profit_margin: number
          promo_end_at: string | null
          promo_price: number | null
          promo_start_at: string | null
          service_base_price: number
          show_in_catalog: boolean
          sku: string | null
          stock_quantity: number
          track_stock: boolean
          unit: string
          updated_at: string
          waste_percentage: number
          yampi_sku_id: string | null
        }
        Insert: {
          base_cost?: number
          barcode?: string | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          expense_percentage?: number
          final_price?: number | null
          id?: string
          image_url?: string | null
          image_urls?: Json
          is_copy?: boolean
          is_active?: boolean
          is_public?: boolean
          labor_cost?: number
          min_order_quantity?: number
          min_stock?: number
          name: string
          original_product_id?: string | null
          owner_id?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          personalization_enabled?: boolean
          production_time_days?: number | null
          product_colors?: Json
          profit_margin?: number
          promo_end_at?: string | null
          promo_price?: number | null
          promo_start_at?: string | null
          service_base_price?: number
          show_in_catalog?: boolean
          sku?: string | null
          stock_quantity?: number
          track_stock?: boolean
          unit?: string
          updated_at?: string
          waste_percentage?: number
          yampi_sku_id?: string | null
        }
        Update: {
          base_cost?: number
          barcode?: string | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          expense_percentage?: number
          final_price?: number | null
          id?: string
          image_url?: string | null
          image_urls?: Json
          is_copy?: boolean
          is_active?: boolean
          is_public?: boolean
          labor_cost?: number
          min_order_quantity?: number
          min_stock?: number
          name?: string
          original_product_id?: string | null
          owner_id?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          personalization_enabled?: boolean
          production_time_days?: number | null
          product_colors?: Json
          profit_margin?: number
          promo_end_at?: string | null
          promo_price?: number | null
          promo_start_at?: string | null
          service_base_price?: number
          show_in_catalog?: boolean
          sku?: string | null
          stock_quantity?: number
          track_stock?: boolean
          unit?: string
          updated_at?: string
          waste_percentage?: number
          yampi_sku_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_original_product_id_fkey"
            columns: ["original_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      service_items: {
        Row: {
          base_price: number
          company_id: string
          created_at: string
          description: string | null
          id: string
          item_kind: string
          name: string
          service_product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          base_price?: number
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          item_kind?: string
          name: string
          service_product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          base_price?: number
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          item_kind?: string
          name?: string
          service_product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_items_service_product_id_fkey"
            columns: ["service_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      service_products: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          service_product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          service_product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          service_product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_products_service_product_id_fkey"
            columns: ["service_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cpf: string | null
          company_id: string | null
          created_at: string
          force_password_change: boolean
          full_name: string
          id: string
          must_change_password: boolean
          must_complete_company: boolean
          must_complete_onboarding: boolean
          password_defined: boolean
          updated_at: string
          }
        Insert: {
          avatar_url?: string | null
          cpf?: string | null
          company_id?: string | null
          created_at?: string
          force_password_change?: boolean
          full_name: string
          id: string
          must_change_password?: boolean
          must_complete_company?: boolean
          must_complete_onboarding?: boolean
          password_defined?: boolean
          updated_at?: string
          }
        Update: {
          avatar_url?: string | null
          cpf?: string | null
          company_id?: string | null
          created_at?: string
          force_password_change?: boolean
          full_name?: string
          id?: string
          must_change_password?: boolean
          must_complete_company?: boolean
          must_complete_onboarding?: boolean
          password_defined?: boolean
          updated_at?: string
          }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          attributes: Json | null
          created_at: string
          discount: number
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          total: number
          unit_price: number
        }
        Insert: {
          attributes?: Json | null
          created_at?: string
          discount?: number
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          total?: number
          unit_price?: number
        }
        Update: {
          attributes?: Json | null
          created_at?: string
          discount?: number
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          change_amount: number
          company_id: string | null
          created_at: string
          customer_id: string | null
          discount: number
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          subtotal: number
          total: number
          user_id: string
        }
        Insert: {
          amount_paid?: number
          change_amount?: number
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          subtotal?: number
          total?: number
          user_id: string
        }
        Update: {
          amount_paid?: number
          change_amount?: number
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          subtotal?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          product_id: string
          quantity: number
          reason: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          product_id: string
          quantity: number
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          product_id?: string
          quantity?: number
          reason?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplies: {
        Row: {
          company_id: string | null
          cost_per_unit: number
          created_at: string
          id: string
          image_url: string | null
          min_stock: number
          name: string
          sale_price: number
          stock_quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          cost_per_unit?: number
          created_at?: string
          id?: string
          image_url?: string | null
          min_stock?: number
          name: string
          sale_price?: number
          stock_quantity?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          cost_per_unit?: number
          created_at?: string
          id?: string
          image_url?: string | null
          min_stock?: number
          name?: string
          sale_price?: number
          stock_quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      supply_stock_movements: {
        Row: {
          company_id: string
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          order_id: string | null
          origin: string
          product_id: string | null
          quantity: number
          reason: string | null
          sale_id: string | null
          supply_id: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          order_id?: string | null
          origin?: string
          product_id?: string | null
          quantity: number
          reason?: string | null
          sale_id?: string | null
          supply_id: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          order_id?: string | null
          origin?: string
          product_id?: string | null
          quantity?: number
          reason?: string | null
          sale_id?: string | null
          supply_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_stock_movements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_stock_movements_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
        ]
      }
        subscriptions: {
          Row: {
            company_id: string
            created_at: string
            current_period_ends_at: string | null
            customer_document: string | null
            customer_email: string | null
            customer_name: string | null
            customer_phone: string | null
            gateway: string
            gateway_order_id: string | null
            gateway_payment_link_id: string | null
            gateway_subscription_id: string | null
            id: string
          last_payment_status: string | null
            payment_link_url: string | null
            plan_id: string | null
            status: string
            trial_ends_at: string | null
            updated_at: string
          }
          Insert: {
            company_id: string
            created_at?: string
            current_period_ends_at?: string | null
            customer_document?: string | null
            customer_email?: string | null
            customer_name?: string | null
            customer_phone?: string | null
            gateway?: string
            gateway_order_id?: string | null
            gateway_payment_link_id?: string | null
            gateway_subscription_id?: string | null
            id?: string
          last_payment_status?: string | null
            payment_link_url?: string | null
            plan_id?: string | null
            status?: string
            trial_ends_at?: string | null
            updated_at?: string
          }
          Update: {
            company_id?: string
            created_at?: string
            current_period_ends_at?: string | null
            customer_document?: string | null
            customer_email?: string | null
            customer_name?: string | null
            customer_phone?: string | null
            gateway?: string
            gateway_order_id?: string | null
            gateway_payment_link_id?: string | null
            gateway_subscription_id?: string | null
            id?: string
          last_payment_status?: string | null
            payment_link_url?: string | null
            plan_id?: string | null
            status?: string
            trial_ends_at?: string | null
            updated_at?: string
          }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      payment_webhook_logs: {
        Row: {
          company_id: string
          error_message: string | null
          event_type: string | null
          external_event_id: string | null
          gateway: string
          id: string
          order_id: string | null
          payload: Json | null
          payment_id: string | null
          processed_at: string | null
          received_at: string
          signature_valid: boolean | null
          status: string | null
        }
        Insert: {
          company_id: string
          error_message?: string | null
          event_type?: string | null
          external_event_id?: string | null
          gateway: string
          id?: string
          order_id?: string | null
          payload?: Json | null
          payment_id?: string | null
          processed_at?: string | null
          received_at?: string
          signature_valid?: boolean | null
          status?: string | null
        }
        Update: {
          company_id?: string
          error_message?: string | null
          event_type?: string | null
          external_event_id?: string | null
          gateway?: string
          id?: string
          order_id?: string | null
          payload?: Json | null
          payment_id?: string | null
          processed_at?: string | null
          received_at?: string
          signature_valid?: boolean | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_webhook_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_id: string
          event_type: string | null
          gateway: string
          id: string
          payload: Json | null
          processed_at: string | null
          received_at: string
        }
        Insert: {
          event_id: string
          event_type?: string | null
          gateway: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string | null
          gateway?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_art_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      approve_order_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      create_public_order: {
        Args: {
          p_company_id: string
          p_customer_address?: string
          p_customer_city?: string
          p_customer_document: string
          p_customer_email?: string
          p_customer_name: string
          p_order_notes?: string
          p_customer_phone: string
          p_customer_state?: string
          p_customer_zip_code?: string
          p_items: Json
          p_payment_method: Database["public"]["Enums"]["payment_method"]
        }
        Returns: Json
      }
      assert_company_order_limit: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      company_has_active_access: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      consume_product_supplies: {
        Args: {
          p_company_id: string
          p_items: Json
          p_order_id?: string | null
          p_origin?: string
          p_sale_id?: string | null
          p_user_id?: string | null
        }
        Returns: Json
      }
      company_pix_is_ready: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      get_company_checkout_payment_options: {
        Args: { p_company_id: string }
        Returns: Json
      }
      upsert_catalog_customer_profile: {
        Args: {
          p_company_id: string
          p_document?: string
          p_email?: string
          p_name?: string
          p_phone?: string
        }
        Returns: string
      }
      upsert_catalog_customer_checkout_profile: {
        Args: {
          p_address?: string
          p_city?: string
          p_company_id: string
          p_document?: string
          p_email?: string
          p_name?: string
          p_phone?: string
          p_state?: string
          p_zip_code?: string
        }
        Returns: string
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_public_order: {
        Args: { p_token: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pay_expense: {
        Args: {
          p_expense_id: string
          p_paid_amount: number
          p_paid_at: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_payment_notes?: string | null
        }
        Returns: Database["public"]["Tables"]["expenses"]["Row"]
      }
      record_order_payment_by_token: {
        Args: {
          p_amount: number
          p_method: Database["public"]["Enums"]["payment_method"]
          p_token: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "financeiro" | "atendente" | "caixa" | "producao" | "super_admin"
      financial_entry_origin:
      | "venda"
      | "assinatura"
      | "custo"
      | "reembolso"
      | "ajuste"
      | "manual"
      | "pdv"
      | "order_payment"
      | "order_payment_cancel"
      | "order_payment_delete"
      | "outros"
      financial_entry_status: "pendente" | "pago" | "atrasado"
      financial_entry_type: "receita" | "despesa"
      order_status:
      | "orcamento"
      | "pendente"
      | "produzindo_arte"
      | "arte_aprovada"
      | "em_producao"
      | "finalizado"
      | "pronto"
      | "aguardando_retirada"
      | "entregue"
      | "cancelado"
      payment_method:
      | "dinheiro"
      | "cartao"
      | "credito"
      | "debito"
      | "pix"
      | "boleto"
      | "transferencia"
      | "outro"
      payment_status: "pendente" | "parcial" | "pago"
      product_type: "produto" | "confeccionado" | "servico"
      stock_movement_type: "entrada" | "saida" | "ajuste"
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
      app_role: ["admin", "financeiro", "atendente", "caixa", "producao", "super_admin"],
      order_status: [
        "orcamento",
        "pendente",
        "produzindo_arte",
        "arte_aprovada",
        "em_producao",
        "finalizado",
        "pronto",
        "aguardando_retirada",
        "entregue",
        "cancelado",
      ],
      payment_method: ["dinheiro", "cartao", "credito", "debito", "pix", "boleto", "transferencia", "outro"],
      financial_entry_origin: [
        "venda",
        "assinatura",
        "custo",
        "reembolso",
        "ajuste",
        "manual",
        "pdv",
        "order_payment",
        "order_payment_cancel",
        "order_payment_delete",
        "outros",
      ],
      payment_status: ["pendente", "parcial", "pago"],
      financial_entry_status: ["pendente", "pago", "atrasado"],
      financial_entry_type: ["receita", "despesa"],
      product_type: ["produto", "confeccionado", "servico"],
      stock_movement_type: ["entrada", "saida", "ajuste"],
    },
  },
} as const
