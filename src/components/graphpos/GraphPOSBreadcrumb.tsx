import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface GraphPOSBreadcrumbProps {
  backLabel: string;
  backTo: string;
  currentLabel: string;
}

export default function GraphPOSBreadcrumb({ backLabel, backTo, currentLabel }: GraphPOSBreadcrumbProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <ChevronLeft className="h-4 w-4" />
      <Link to={backTo} className="transition-colors hover:text-foreground">
        {backLabel}
      </Link>
      <span>/</span>
      <span className="text-foreground">{currentLabel}</span>
    </div>
  );
}
