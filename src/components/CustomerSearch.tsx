import { useState, useEffect, useRef } from 'react';
import { Search, User, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/types/database';
import { cn } from '@/lib/utils';

interface CustomerSearchProps {
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer | null) => void;
}

export default function CustomerSearch({ selectedCustomer, onSelect }: CustomerSearchProps) {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchCustomers = async () => {
      if (search.length < 2) {
        setCustomers([]);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.%${search}%,document.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(10);
      setCustomers(data as Customer[] || []);
      setLoading(false);
    };

    const debounce = setTimeout(searchCustomers, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const handleSelect = (customer: Customer) => {
    onSelect(customer);
    setSearch('');
    setShowDropdown(false);
  };

  const handleClear = () => {
    onSelect(null);
    setSearch('');
  };

  if (selectedCustomer) {
    return (
      <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
        <User className="h-4 w-4 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{selectedCustomer.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {selectedCustomer.phone || selectedCustomer.document || selectedCustomer.email || 'Sem contato'}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClear}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente (nome, CPF, telefone)..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => search.length >= 2 && setShowDropdown(true)}
          className="pl-9"
        />
      </div>

      {showDropdown && search.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
          {loading ? (
            <div className="p-3 text-center text-sm text-muted-foreground">Buscando...</div>
          ) : customers.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">Nenhum cliente encontrado</div>
          ) : (
            customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => handleSelect(customer)}
                className={cn(
                  "w-full p-3 text-left hover:bg-accent flex items-center gap-2 transition-colors",
                  "border-b last:border-b-0"
                )}
              >
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{customer.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[customer.document, customer.phone, customer.email].filter(Boolean).join(' • ') || 'Sem informações adicionais'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
