import { useEffect, useMemo, useState } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Eye, GripVertical, Loader2, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { fetchOrderStatuses, updateOrderStatus } from '@/services/orders';
import type { Customer, Order, OrderItem, OrderStatus, PaymentMethod } from '@/types/database';
import { useNavigate } from 'react-router-dom';

const statusOrder: OrderStatus[] = [
  'orcamento',
  'pendente',
  'em_producao',
  'pronto',
  'aguardando_retirada',
  'entregue',
  'cancelado',
];

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orçamento',
  pendente: 'Pendente',
  em_producao: 'Em Produção',
  pronto: 'Pronto',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const statusColors: Record<OrderStatus, string> = {
  orcamento: 'bg-blue-100 text-blue-800',
  pendente: 'bg-orange-100 text-orange-800',
  em_producao: 'bg-yellow-100 text-yellow-800',
  pronto: 'bg-green-100 text-green-800',
  aguardando_retirada: 'bg-sky-100 text-sky-800',
  entregue: 'bg-gray-100 text-gray-800',
  cancelado: 'bg-red-100 text-red-800',
};

type ColumnConfig = {
  id: string;
  label: string;
  color: string;
};

type KanbanOrder = Order & {
  customer?: Pick<Customer, 'name' | 'phone' | 'document'> | null;
  items?: Array<Pick<OrderItem, 'product_name' | 'quantity'>>;
};

const formatStatusLabel = (value: string) => {
  const normalized = value.replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getStatusMeta = (status: string) => ({
  label: statusLabels[status as OrderStatus] ?? formatStatusLabel(status),
  color: statusColors[status as OrderStatus] ?? 'bg-muted text-muted-foreground',
});

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('pt-BR');

const formatPaymentMethod = (value?: PaymentMethod | null) => {
  if (!value) return '-';
  const labels: Record<PaymentMethod, string> = {
    dinheiro: 'Dinheiro',
    cartao: 'Cartao',
    pix: 'Pix',
    boleto: 'Boleto',
    outro: 'Outro',
  };
  return labels[value] || value;
};

const formatOrderItems = (
  items?: Array<Pick<OrderItem, 'product_name' | 'quantity'>> | null
) => {
  if (!items || items.length === 0) return 'Sem produtos';
  const preview = items.slice(0, 2).map((item) => {
    const qty = Number(item.quantity);
    const qtyLabel = Number.isFinite(qty) ? String(qty) : String(item.quantity);
    return `${item.product_name} x${qtyLabel}`;
  });
  const remaining = items.length - preview.length;
  return remaining > 0 ? `${preview.join(', ')} +${remaining}` : preview.join(', ');
};

type OrderCardProps = {
  order: KanbanOrder;
  statusLabel: string;
  statusColor: string;
  isUpdating?: boolean;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  onOpen?: () => void;
  isOverlay?: boolean;
};

const OrderCard = ({
  order,
  statusLabel,
  statusColor,
  isUpdating,
  dragHandleProps,
  onOpen,
  isOverlay,
}: OrderCardProps) => (
  <div
    className={cn(
      'rounded-lg border bg-card p-3 shadow-sm transition-shadow',
      isUpdating && 'opacity-60',
      isOverlay && 'shadow-lg'
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-sm font-semibold">#{formatOrderNumber(order.order_number)}</p>
        <p className="text-xs text-muted-foreground">
          {order.customer_name || order.customer?.name || 'Sem cliente'}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {dragHandleProps && (
          <button
            type="button"
            {...dragHandleProps}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label="Arrastar pedido"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {onOpen && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
    <div className="mt-2 flex items-center justify-between">
      <span className={cn('status-badge', statusColor)}>{statusLabel}</span>
      {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span>Telefone</span>
        <span className="max-w-[140px] truncate">{order.customer?.phone || '-'}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span>CPF</span>
        <span className="max-w-[140px] truncate">{order.customer?.document || '-'}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span>Pagamento</span>
        <span className="max-w-[140px] truncate">{formatPaymentMethod(order.payment_method)}</span>
      </div>
    </div>
    <div className="mt-2 text-xs text-muted-foreground">
      Produtos: <span className="font-medium text-foreground/80">{formatOrderItems(order.items)}</span>
    </div>
    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
      <span>{formatCurrency(Number(order.total))}</span>
      <span>{formatDate(order.created_at)}</span>
    </div>
  </div>
);

type DraggableOrderCardProps = {
  order: KanbanOrder;
  isUpdating?: boolean;
  onOpen?: () => void;
};

const DraggableOrderCard = ({ order, isUpdating, onOpen }: DraggableOrderCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: order.id,
      data: { status: order.status },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };

  const statusMeta = getStatusMeta(order.status);

  return (
    <div ref={setNodeRef} style={style}>
      <OrderCard
        order={order}
        statusLabel={statusMeta.label}
        statusColor={statusMeta.color}
        isUpdating={isUpdating}
        dragHandleProps={{ ...listeners, ...attributes }}
        onOpen={onOpen}
      />
    </div>
  );
};

type KanbanColumnProps = {
  column: ColumnConfig;
  orders: KanbanOrder[];
  updatingIds: Set<string>;
  onOpenOrder: (orderId: string) => void;
};

const KanbanColumn = ({ column, orders, updatingIds, onOpenOrder }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full w-full min-w-0 flex-col rounded-lg border bg-muted/20',
        isOver && 'ring-2 ring-primary/40'
      )}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{column.label}</span>
        </div>
        <Badge variant="secondary">{orders.length}</Badge>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3 pt-2 scrollbar-thin">
        {orders.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
            Sem pedidos
          </div>
        ) : (
          orders.map((order) => (
            <DraggableOrderCard
              key={order.id}
              order={order}
              isUpdating={updatingIds.has(order.id)}
              onOpen={() => onOpenOrder(order.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default function OrdersKanban() {
  const { toast } = useToast();
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<KanbanOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>(statusOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const loadOrders = async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, customer_id, customer_name, status, total, created_at, payment_method, customer:customers(name, phone, document), items:order_items(product_name, quantity)'
      )
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Erro ao carregar pedidos',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setOrders((data as KanbanOrder[]) || []);
    }

    setLoading(false);
    setRefreshing(false);
  };

  const loadStatuses = async () => {
    try {
      const statuses = await fetchOrderStatuses();
      if (statuses.length > 0) {
        setAvailableStatuses(statuses);
      }
    } catch (error) {
      console.warn('Failed to load order statuses', error);
    }
  };

  useEffect(() => {
    loadOrders();
    loadStatuses();

    if (!user?.id) return;

    const channel = supabase
      .channel('kanban-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          // Debounce or just refresh
          loadOrders(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) => {
      const numberMatch = order.order_number.toString().includes(term);
      const customerName = order.customer_name || order.customer?.name || '';
      const customerMatch = customerName.toLowerCase().includes(term);
      return numberMatch || customerMatch;
    });
  }, [orders, search]);

  const columns = useMemo<ColumnConfig[]>(() => {
    const presentStatuses = new Set<string>(
      filteredOrders.map((order) => order.status as string)
    );
    const base = (availableStatuses.length > 0 ? availableStatuses : statusOrder).map(
      (status) => status as string
    );
    const extra = [...presentStatuses].filter((status) => !base.includes(status));
    const ordered = [...base, ...extra];
    return ordered.map((status) => ({
      id: status,
      ...getStatusMeta(status),
    }));
  }, [availableStatuses, filteredOrders]);

  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, KanbanOrder[]> = {};
    columns.forEach((column) => {
      grouped[column.id] = [];
    });
    filteredOrders.forEach((order) => {
      const key = order.status as string;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(order);
    });
    return grouped;
  }, [columns, filteredOrders]);

  const activeOrder = useMemo(
    () => orders.find((order) => order.id === activeOrderId) || null,
    [activeOrderId, orders]
  );

  const handleDragStart = (event: { active: { id: string | number } }) => {
    setActiveOrderId(String(event.active.id));
  };

  const handleDragCancel = () => {
    setActiveOrderId(null);
  };

  const handleDragEnd = async (event: { active: { id: string | number }; over?: { id: string | number } | null }) => {
    setActiveOrderId(null);
    if (!event.over) return;

    const orderId = String(event.active.id);
    const targetStatus = String(event.over.id);
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    if (String(order.status) === targetStatus) return;

    if (
      order.status === 'cancelado' &&
      targetStatus === 'pendente' &&
      !hasPermission(['admin', 'atendente'])
    ) {
      toast({
        title: 'Sem permissão',
        description: 'Apenas Admin ou Atendente podem reativar pedidos cancelados.',
        variant: 'destructive',
      });
      return;
    }

    const previousStatus = order.status;
    setOrders((prev) =>
      prev.map((item) =>
        item.id === orderId
          ? { ...item, status: targetStatus as OrderStatus }
          : item
      )
    );

    setUpdatingIds((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });

    try {
      await updateOrderStatus({
        orderId,
        status: targetStatus as OrderStatus,
        userId: user?.id,
      });
    } catch (error) {
      setOrders((prev) =>
        prev.map((item) =>
          item.id === orderId ? { ...item, status: previousStatus } : item
        )
      );
      const message = error instanceof Error ? error.message : 'Erro ao atualizar status';
      toast({
        title: 'Erro ao atualizar status',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Kanban de Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Arraste os pedidos entre colunas para atualizar o status.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por numero ou cliente..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              loadOrders(false);
              loadStatuses();
            }}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border bg-card py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando pedidos...
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <div className="kanban-board grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                orders={ordersByStatus[column.id] || []}
                updatingIds={updatingIds}
                onOpenOrder={(orderId) => navigate(`/pedidos/${orderId}`)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeOrder ? (
              <OrderCard
                order={activeOrder}
                statusLabel={getStatusMeta(activeOrder.status).label}
                statusColor={getStatusMeta(activeOrder.status).color}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
