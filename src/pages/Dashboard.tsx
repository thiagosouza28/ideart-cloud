import {
  Activity,
  BadgeDollarSign,
  BarChart2,
  ClipboardCheck,
  Filter,
  Plus,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { OrdersList } from '@/components/dashboard/OrdersList';
import { EmptyStateCard } from '@/components/dashboard/EmptyStateCard';

const kpiCards = [
  {
    title: 'Vendas Hoje',
    value: 'R$ 0,00',
    badge: 'Hoje',
    icon: <ShoppingBag className="h-5 w-5" />,
  },
  {
    title: 'Faturamento (7d)',
    value: 'R$ 77,50',
    badge: '+12%',
    badgeTone: 'success' as const,
    icon: <Activity className="h-5 w-5" />,
  },
  {
    title: 'Faturamento (Mes)',
    value: 'R$ 77,50',
    badge: '30 dias',
    icon: <BarChart2 className="h-5 w-5" />,
  },
  {
    title: 'Clientes Ativos',
    value: '2',
    icon: <Users className="h-5 w-5" />,
  },
];

const summaryCards = [
  {
    title: 'Orcamentos',
    value: '0',
    subtitle: 'aguardando aprovacao',
    icon: <ClipboardCheck className="h-5 w-5" />,
    tone: 'blue' as const,
  },
  {
    title: 'Em Producao',
    value: '0',
    subtitle: 'em andamento',
    icon: <Activity className="h-5 w-5" />,
    tone: 'orange' as const,
  },
  {
    title: 'Prontos',
    value: '0',
    subtitle: 'aguardando entrega',
    icon: <BadgeDollarSign className="h-5 w-5" />,
    tone: 'green' as const,
  },
];

const recentOrders = [
  {
    id: '#05',
    customer: 'Cliente teste',
    details: 'Cartao de visita | Pix',
    status: 'AGUARDANDO RETIRADA',
    statusTone: 'warning' as const,
    amount: 'R$ 40,00',
  },
  {
    id: '#04',
    customer: 'Cliente teste',
    details: 'Mini-calendarios | Cartao',
    status: 'ENTREGUE',
    statusTone: 'success' as const,
    amount: 'R$ 100,00',
  },
  {
    id: '#03',
    customer: 'Cliente teste',
    details: 'Agendas personalizadas | Pix',
    status: 'ENTREGUE',
    statusTone: 'success' as const,
    amount: 'R$ 71,50',
  },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Visao geral do sistema</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
          Atualizado agora
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
          <Filter className="h-4 w-4" />
          Filtro
        </button>
        <button className="flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm">
          <Plus className="h-4 w-4" />
          Novo Pedido
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <StatCard
            key={card.title}
            title={card.title}
            value={card.value}
            badge={card.badge}
            badgeTone={card.badgeTone}
            icon={card.icon}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <SummaryCard
            key={card.title}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            tone={card.tone}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_1.2fr]">
        <EmptyStateCard
          title="Fila de Producao"
          description="Tudo limpo! Nao ha pedidos aguardando producao."
          actionLabel="Ver Fila Completa"
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <OrdersList items={recentOrders} />
      </div>
    </div>
  );
}
