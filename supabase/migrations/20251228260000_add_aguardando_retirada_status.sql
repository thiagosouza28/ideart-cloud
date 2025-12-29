-- Add aguardando_retirada status after pronto.
alter type public.order_status
  add value if not exists 'aguardando_retirada' before 'entregue';
