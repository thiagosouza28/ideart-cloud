import { ReactNode } from 'react';

interface EmptyStateCardProps {
  title: string;
  description: string;
  actionLabel: string;
  icon: ReactNode;
}

export function EmptyStateCard({ title, description, actionLabel, icon }: EmptyStateCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <button className="text-sm font-semibold text-slate-500 hover:text-slate-700">
          Ver Fila Completa
        </button>
      </div>
      <div className="mt-8 flex flex-col items-center gap-3 text-center text-slate-500">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 text-slate-400">
          {icon}
        </div>
        <p className="text-base font-semibold text-slate-700">{title}</p>
        <p className="text-sm">{description}</p>
        <button className="mt-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
