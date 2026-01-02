import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface GraphPOSBreadcrumbProps {
  backLabel: string;
  backTo: string;
  currentLabel: string;
}

export default function GraphPOSBreadcrumb({ backLabel, backTo, currentLabel }: GraphPOSBreadcrumbProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <ChevronLeft className="h-4 w-4" />
      <Link to={backTo} className="hover:text-slate-700">
        {backLabel}
      </Link>
      <span>/</span>
      <span className="text-slate-700">{currentLabel}</span>
    </div>
  );
}
