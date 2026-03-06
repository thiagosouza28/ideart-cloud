interface OrderItem {
  id: string;
  customer: string;
  details: string;
  status: string;
  amount: string;
  statusTone: 'warning' | 'success';
}

interface OrdersListProps {
  items: OrderItem[];
}

const statusStyles: Record<OrderItem['statusTone'], string> = {
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
};

export function OrdersList({ items }: OrdersListProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Últimos Pedidos</h3>
        <button className="text-sm font-semibold text-muted-foreground hover:text-foreground">Ver todos</button>
      </div>
      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum pedido recente.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-border/80 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                {item.id}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{item.customer}</p>
                <p className="text-xs text-muted-foreground">{item.details}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.statusTone]}`}>
                {item.status}
              </span>
              <p className="text-sm font-semibold text-foreground">{item.amount}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
