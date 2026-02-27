export type AppRole = 'super_admin' | 'admin' | 'atendente' | 'caixa' | 'producao';
export type ProductType = 'produto' | 'confeccionado' | 'servico';
export type OrderStatus =
  | 'orcamento'
  | 'pendente'
  | 'produzindo_arte'
  | 'arte_aprovada'
  | 'em_producao'
  | 'finalizado'
  | 'pronto'
  | 'aguardando_retirada'
  | 'entregue'
  | 'cancelado';
export type StockMovementType = 'entrada' | 'saida' | 'ajuste';
export type PaymentMethod = 'dinheiro' | 'cartao' | 'pix' | 'boleto' | 'outro';
export type PaymentStatus = 'pendente' | 'parcial' | 'pago';
export type FinancialEntryType = 'receita' | 'despesa';
export type FinancialEntryStatus = 'pendente' | 'pago' | 'atrasado';
export type SubscriptionStatus = 'trial' | 'active' | 'cancelled' | 'expired' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete';
export type BillingPeriod = 'monthly' | 'yearly';

export interface ProductColor {
  name: string;
  hex: string;
  active: boolean;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  signature_image_url?: string | null;
  signature_responsible?: string | null;
  signature_role?: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  document?: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  instagram: string | null;
  facebook: string | null;
  is_active: boolean;
  minimum_order_value?: number | null;
  catalog_primary_color?: string | null;
  catalog_secondary_color?: string | null;
  catalog_accent_color?: string | null;
  catalog_text_color?: string | null;
  catalog_header_bg_color?: string | null;
  catalog_header_text_color?: string | null;
  catalog_footer_bg_color?: string | null;
  catalog_footer_text_color?: string | null;
  catalog_price_color?: string | null;
  catalog_badge_bg_color?: string | null;
  catalog_badge_text_color?: string | null;
  catalog_button_bg_color?: string | null;
  catalog_button_text_color?: string | null;
  catalog_button_outline_color?: string | null;
  catalog_card_bg_color?: string | null;
  catalog_card_border_color?: string | null;
  catalog_filter_bg_color?: string | null;
  catalog_filter_text_color?: string | null;
  catalog_title?: string | null;
  catalog_description?: string | null;
  catalog_share_image_url?: string | null;
  catalog_button_text?: string | null;
  catalog_show_prices?: boolean | null;
  catalog_show_contact?: boolean | null;
  catalog_contact_url?: string | null;
  whatsapp_message_template?: string | null;
  birthday_message_template?: string | null;
  catalog_font?: string | null;
  catalog_columns_mobile?: number | null;
  catalog_columns_desktop?: number | null;
  catalog_layout?: "grid" | "list" | null;
  plan_id: string | null;
  subscription_status: SubscriptionStatus | string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  owner_user_id?: string | null;
  trial_active?: boolean | null;
  trial_ends_at?: string | null;
  completed?: boolean | null;
  created_at: string;
  updated_at: string;
  plan?: Plan;
}

export interface Profile {
  id: string;
  full_name: string;
  cpf?: string | null;
  avatar_url: string | null;
  company_id: string | null;
  force_password_change?: boolean | null;
  must_change_password?: boolean | null;
  must_complete_onboarding?: boolean | null;
  must_complete_company?: boolean | null;
  password_defined?: boolean | null;
  created_at: string;
  updated_at: string;
  company?: Company;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attribute {
  id: string;
  name: string;
  created_at: string;
}

export interface AttributeValue {
  id: string;
  attribute_id: string;
  value: string;
  created_at: string;
  attribute?: Attribute;
}

export interface Supply {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  sale_price: number;
  image_url: string | null;
  stock_quantity: number;
  min_stock: number;
  track_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_period: BillingPeriod | string;
  period_days?: number | null;
  features: string[];
  max_users: number | null;
  is_active: boolean;
  cakto_plan_id?: string | null;
  stripe_price_id?: string | null;
  stripe_product_id?: string | null;
  yampi_sku_id?: string | null;
  yampi_product_id?: string | null;
  yampi_checkout_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  track_stock: boolean;
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  product_type: ProductType;
  category_id: string | null;
  company_id: string | null;
  owner_id?: string | null;
  is_public?: boolean;
  is_copy?: boolean;
  original_product_id?: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  unit: string;
  is_active: boolean;
  show_in_catalog: boolean;
  catalog_enabled?: boolean | null;
  catalog_featured?: boolean | null;
  catalog_min_order?: number | null;
  catalog_price?: number | null;
  catalog_short_description?: string | null;
  catalog_long_description?: string | null;
  catalog_sort_order?: number | null;
  slug?: string | null;
  product_colors?: ProductColor[] | null;
  personalization_enabled?: boolean | null;
  base_cost: number;
  labor_cost: number;
  waste_percentage: number;
  profit_margin: number;
  promo_price: number | null;
  promo_start_at: string | null;
  promo_end_at: string | null;
  final_price: number | null;
  stock_quantity: number;
  min_stock: number;
  min_order_quantity: number;
  yampi_sku_id?: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
  company?: Company;
}

export interface ProductAttribute {
  id: string;
  product_id: string;
  attribute_value_id: string;
  price_modifier: number;
  created_at: string;
  attribute_value?: AttributeValue;
}

export interface ProductSupply {
  id: string;
  product_id: string;
  supply_id: string;
  quantity: number;
  created_at: string;
  supply?: Supply;
}

export interface PriceTier {
  id: string;
  product_id: string;
  min_quantity: number;
  max_quantity: number | null;
  price: number;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  photo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  movement_type: StockMovementType;
  quantity: number;
  reason: string | null;
  user_id: string | null;
  created_at: string;
  product?: Product;
}

export interface Sale {
  id: string;
  company_id?: string | null;
  customer_id: string | null;
  user_id: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  amount_paid: number;
  change_amount: number;
  notes: string | null;
  created_at: string;
  customer?: Customer;
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  attributes: Record<string, string> | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: number;
  customer_id: string | null;
  customer_name: string | null;
  company_id: string | null;
  gateway?: string | null;
  gateway_order_id?: string | null;
  payment_link_id?: string | null;
  payment_link_url?: string | null;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  amount_paid: number;
  notes: string | null;
  cancel_reason: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  approved_at?: string | null;
  approved_by?: string | null;
  customer?: Customer;
  company?: Company;
  items?: OrderItem[];
  final_photos?: OrderFinalPhoto[];
  art_files?: OrderArtFile[];
}

export interface ExpenseCategory {
  id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
}

export interface FinancialEntry {
  id: string;
  company_id: string | null;
  type: FinancialEntryType;
  origin: string;
  category_id: string | null;
  amount: number;
  status: FinancialEntryStatus;
  payment_method: PaymentMethod | null;
  description: string | null;
  notes: string | null;
  occurred_at: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  created_by: string | null;
  category?: ExpenseCategory | null;
}

export interface OrderPublicLink {
  id: string;
  order_id: string;
  token: string;
  created_at: string;
  created_by: string | null;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  company_id: string | null;
  amount: number;
  status: PaymentStatus;
  method: PaymentMethod | null;
  paid_at: string | null;
  gateway?: string | null;
  gateway_order_id?: string | null;
  gateway_transaction_id?: string | null;
  raw_payload?: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
  notes: string | null;
}

export interface Subscription {
  id: string;
  user_id: string | null;
  company_id: string | null;
  plan_id: string | null;
  status: string;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  gateway: string;
  gateway_subscription_id: string | null;
  gateway_order_id: string | null;
  gateway_payment_link_id: string | null;
  payment_link_url: string | null;
  last_payment_status: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_document?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  gateway: string;
  event_id: string;
  event_type: string | null;
  payload: Record<string, unknown> | null;
  received_at: string;
  processed_at: string | null;
}

export interface OrderNotification {
  id: string;
  company_id: string | null;
  order_id: string | null;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
}

export interface PublicOrderPayload {
  order: Pick<
    Order,
    | 'id'
    | 'order_number'
    | 'status'
    | 'subtotal'
    | 'discount'
    | 'total'
    | 'payment_status'
    | 'payment_method'
    | 'amount_paid'
    | 'gateway'
    | 'gateway_order_id'
    | 'payment_link_id'
    | 'payment_link_url'
    | 'notes'
    | 'created_at'
    | 'approved_at'
  >;
  customer: {
    name: string | null;
    document: string | null;
    phone: string | null;
    email: string | null;
  };
  company: {
    name: string | null;
    logo_url: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  items: OrderItem[];
  history: OrderStatusHistory[];
  payments: OrderPayment[];
  final_photos: OrderFinalPhoto[];
  art_files: OrderArtFile[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  attributes: Record<string, string> | null;
  notes: string | null;
  created_at: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: OrderStatus;
  notes: string | null;
  user_id: string | null;
  created_at: string;
}

export interface OrderFinalPhoto {
  id: string;
  order_id: string;
  storage_path: string;
  created_by: string | null;
  created_at: string;
}

export interface OrderArtFile {
  id: string;
  order_id: string;
  storage_path: string;
  file_name: string;
  file_type: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  unit_price: number;
  discount: number;
  attributes: Record<string, string>;
  notes?: string;
}
