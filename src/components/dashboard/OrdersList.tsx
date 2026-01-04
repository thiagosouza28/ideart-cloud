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
  warning: 'bg-amber-100 text-amber-700',
  success: 'bg-emerald-100 text-emerald-700',
};

export function OrdersList({ items }: OrdersListProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">Últimos Pedidos</h3>
        <button className="text-sm font-semibold text-slate-500 hover:text-slate-700">Ver todos</button>
      </div>
      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Nenhum pedido recente.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-slate-100 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                {item.id}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{item.customer}</p>
                <p className="text-xs text-slate-400">{item.details}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.statusTone]}`}>
                {item.status}
              </span>
              <p className="text-sm font-semibold text-slate-900">{item.amount}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
