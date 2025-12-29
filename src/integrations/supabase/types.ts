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
          created_at: string
          description: string | null
          email: string | null
          facebook: string | null
          id: string
            instagram: string | null
            is_active: boolean
            logo_url: string | null
            minimum_order_value: number | null
            name: string
            phone: string | null
          plan_id: string | null
          slug: string
          state: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_end_date: string | null
          subscription_start_date: string | null
          subscription_status: string | null
          updated_at: string
          whatsapp: string | null
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
          created_at?: string
          description?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
            instagram?: string | null
            is_active?: boolean
            logo_url?: string | null
            minimum_order_value?: number | null
            name: string
            phone?: string | null
          plan_id?: string | null
          slug: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          updated_at?: string
          whatsapp?: string | null
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
          created_at?: string
          description?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
            instagram?: string | null
            is_active?: boolean
            logo_url?: string | null
            minimum_order_value?: number | null
            name?: string
            phone?: string | null
          plan_id?: string | null
          slug?: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          subscription_status?: string | null
          updated_at?: string
          whatsapp?: string | null
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
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
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
          notes: string | null
          occurred_at: string
          origin: string
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          status: Database["public"]["Enums"]["financial_entry_status"]
          type: Database["public"]["Enums"]["financial_entry_type"]
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
          notes?: string | null
          occurred_at?: string
          origin?: string
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["financial_entry_status"]
          type: Database["public"]["Enums"]["financial_entry_type"]
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
          notes?: string | null
          occurred_at?: string
          origin?: string
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["financial_entry_status"]
          type?: Database["public"]["Enums"]["financial_entry_type"]
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
            customer_name: string | null
            discount: number
            gateway: string | null
            gateway_order_id: string | null
            id: string
            notes: string | null
            order_number: number
            payment_method: Database["public"]["Enums"]["payment_method"] | null
            payment_link_id: string | null
            payment_link_url: string | null
            payment_status: Database["public"]["Enums"]["payment_status"]
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
            customer_name?: string | null
            discount?: number
            gateway?: string | null
            gateway_order_id?: string | null
            id?: string
            notes?: string | null
            order_number?: number
            payment_method?: Database["public"]["Enums"]["payment_method"] | null
            payment_link_id?: string | null
            payment_link_url?: string | null
            payment_status?: Database["public"]["Enums"]["payment_status"]
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
            customer_name?: string | null
            discount?: number
            gateway?: string | null
            gateway_order_id?: string | null
            id?: string
            notes?: string | null
            order_number?: number
            payment_method?: Database["public"]["Enums"]["payment_method"] | null
            payment_link_id?: string | null
            payment_link_url?: string | null
            payment_status?: Database["public"]["Enums"]["payment_status"]
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
            created_at: string
            description: string | null
            features: Json
            id: string
            is_active: boolean
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
            created_at?: string
            description?: string | null
            features?: Json
            id?: string
            is_active?: boolean
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
            created_at?: string
            description?: string | null
            features?: Json
            id?: string
            is_active?: boolean
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
      products: {
        Row: {
          base_cost: number
          category_id: string | null
          company_id: string | null
          created_at: string
          description: string | null
          final_price: number | null
          id: string
          image_url: string | null
          is_active: boolean
          labor_cost: number
          min_order_quantity: number
          min_stock: number
          name: string
          product_type: Database["public"]["Enums"]["product_type"]
          profit_margin: number
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
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          final_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          labor_cost?: number
          min_order_quantity?: number
          min_stock?: number
          name: string
          product_type?: Database["public"]["Enums"]["product_type"]
          profit_margin?: number
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
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          final_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          labor_cost?: number
          min_order_quantity?: number
          min_stock?: number
          name?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          profit_margin?: number
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
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
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
        subscriptions: {
          Row: {
            company_id: string
            created_at: string
            current_period_ends_at: string | null
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
        approve_order_by_token: {
          Args: { p_token: string }
          Returns: Json
        }
        create_public_order: {
          Args: {
            p_company_id: string
            p_customer_document: string
            p_customer_name: string
            p_customer_phone: string
            p_items: Json
            p_payment_method: Database["public"]["Enums"]["payment_method"]
          }
          Returns: Json
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
      app_role: "admin" | "atendente" | "caixa" | "producao" | "super_admin"
      financial_entry_status: "pendente" | "pago" | "atrasado"
      financial_entry_type: "receita" | "despesa"
      order_status:
        | "orcamento"
        | "pendente"
        | "em_producao"
        | "pronto"
        | "aguardando_retirada"
        | "entregue"
        | "cancelado"
      payment_method: "dinheiro" | "cartao" | "pix" | "boleto" | "outro"
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
      app_role: ["admin", "atendente", "caixa", "producao", "super_admin"],
      order_status: [
        "orcamento",
        "pendente",
        "em_producao",
        "pronto",
        "aguardando_retirada",
        "entregue",
        "cancelado",
      ],
      payment_method: ["dinheiro", "cartao", "pix", "boleto", "outro"],
      payment_status: ["pendente", "parcial", "pago"],
      financial_entry_status: ["pendente", "pago", "atrasado"],
      financial_entry_type: ["receita", "despesa"],
      product_type: ["produto", "confeccionado", "servico"],
      stock_movement_type: ["entrada", "saida", "ajuste"],
    },
  },
} as const
