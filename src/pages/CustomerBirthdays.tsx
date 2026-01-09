import { useEffect, useMemo, useState } from 'react';
import { Calendar, Gift, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Customer } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { cn } from '@/lib/utils';
import {
  formatMonthDay,
  getAgeAtYear,
  getBirthDay,
  isBirthdayInMonth,
  isBirthdayToday,
  isBirthdayWithinDays,
} from '@/lib/birthdays';
import { toast } from 'sonner';
import { normalizeDigits } from '@/components/ui/masked-input';

const MONTHS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Marco' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

export default function CustomerBirthdays() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const { company } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);

  useEffect(() => {
    const loadCustomers = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, date_of_birth, photo_url, phone')
        .not('date_of_birth', 'is', null)
        .order('name');

      if (error) {
        toast.error('Erro ao carregar aniversariantes');
        setCustomers([]);
      } else {
        setCustomers((data as Customer[]) || []);
      }
      setLoading(false);
    };

    loadCustomers();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers
      .filter((customer) => isBirthdayInMonth(customer.date_of_birth, selectedMonth))
      .filter((customer) => (term ? customer.name.toLowerCase().includes(term) : true))
      .sort((a, b) => {
        const dayA = getBirthDay(a.date_of_birth) ?? 0;
        const dayB = getBirthDay(b.date_of_birth) ?? 0;
        return dayA - dayB;
      });
  }, [customers, search, selectedMonth]);

  const buildBirthdayMessage = (customer: Customer) => {
    const template =
      company?.birthday_message_template?.trim() ||
      'Ola {cliente_nome}, feliz aniversario! Que seu dia seja especial. {empresa_nome}';
    const ageToComplete = getAgeAtYear(customer.date_of_birth, currentYear);
    const birthdayDate = formatMonthDay(customer.date_of_birth);
    const replacements: Record<string, string> = {
      '{cliente_nome}': customer.name,
      '{cliente_telefone}': customer.phone || '',
      '{cliente_idade}': ageToComplete !== null ? String(ageToComplete) : '',
      '{aniversario_data}': birthdayDate,
      '{empresa_nome}': company?.name || '',
    };

    return Object.entries(replacements).reduce(
      (message, [key, value]) => message.split(key).join(value),
      template,
    );
  };

  const handleSendMessage = (customer: Customer) => {
    const digits = normalizeDigits(customer.phone || '');
    if (!digits) {
      toast.error('Cliente sem telefone cadastrado.');
      return;
    }
    const text = encodeURIComponent(buildBirthdayMessage(customer));
    const url = `https://api.whatsapp.com/send/?phone=${digits}&text=${text}`;
    window.open(url, '_blank');
  };

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Aniversariantes do Mes</h1>
          <p className="text-sm text-muted-foreground">
            Consulte clientes que fazem aniversario no mes selecionado.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="min-w-[200px]">
            <Select value={String(selectedMonth)} onValueChange={(value) => setSelectedMonth(Number(value))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o mes" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month) => (
                  <SelectItem key={month.value} value={String(month.value)}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Carregando aniversariantes...
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum aniversariante encontrado para este mes.
            </CardContent>
          </Card>
        ) : (
          filtered.map((customer) => {
            const birthdayToday = isBirthdayToday(customer.date_of_birth, now);
            const birthdayWeek =
              selectedMonth === currentMonth &&
              !birthdayToday &&
              isBirthdayWithinDays(customer.date_of_birth, 7, now);
            const ageToComplete = getAgeAtYear(customer.date_of_birth, currentYear);
            const cardTone = birthdayToday
              ? 'border-emerald-200 bg-emerald-50'
              : birthdayWeek
                ? 'border-sky-200 bg-sky-50'
                : 'border-slate-200';

            return (
              <Card key={customer.id} className={cn('border', cardTone)}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      {customer.photo_url ? (
                        <AvatarImage
                          src={ensurePublicStorageUrl('customer-photos', customer.photo_url) || undefined}
                          alt={customer.name}
                        />
                      ) : null}
                      <AvatarFallback className="bg-muted text-xs">
                        {customer.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CL'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{customer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Dia {formatMonthDay(customer.date_of_birth)} | Completa {ageToComplete ?? '-'} anos
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {birthdayToday && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Hoje
                          </span>
                        )}
                        {birthdayWeek && (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                            Esta semana
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!customer.phone}
                          className={!customer.phone ? 'pointer-events-none' : ''}
                          onClick={() => handleSendMessage(customer)}
                        >
                          <Gift className="mr-2 h-4 w-4" />
                          Enviar WhatsApp
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!customer.phone && (
                      <TooltipContent>Cliente sem telefone cadastrado.</TooltipContent>
                    )}
                  </Tooltip>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
