import { supabase } from '@/integrations/supabase/client';

type SoldProductItem = {
  product_id?: string | null;
  product_name?: string | null;
  quantity?: number | null;
};

type ConsumeProductSuppliesParams = {
  companyId?: string | null;
  items: SoldProductItem[];
  orderId?: string | null;
  saleId?: string | null;
  userId?: string | null;
  origin?: 'venda_produto' | 'manual' | 'ajuste';
};

const normalizeItems = (items: SoldProductItem[]) =>
  items
    .map((item) => ({
      product_id: item.product_id || null,
      product_name: item.product_name?.trim() || null,
      quantity: Number(item.quantity || 0),
    }))
    .filter((item) => item.product_id && item.quantity > 0);

export const consumeProductSupplies = async ({
  companyId,
  items,
  orderId = null,
  saleId = null,
  userId = null,
  origin = 'venda_produto',
}: ConsumeProductSuppliesParams) => {
  const normalizedItems = normalizeItems(items);

  if (!companyId || normalizedItems.length === 0) {
    return { movement_count: 0, supply_count: 0 };
  }

  const { data, error } = await supabase.rpc('consume_product_supplies', {
    p_company_id: companyId,
    p_items: normalizedItems,
    p_order_id: orderId,
    p_sale_id: saleId,
    p_user_id: userId,
    p_origin: origin,
  });

  if (error) {
    throw error;
  }

  return (data as { movement_count?: number; supply_count?: number } | null) || {
    movement_count: 0,
    supply_count: 0,
  };
};
