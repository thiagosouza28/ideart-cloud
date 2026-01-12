import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/types/database';
import { toast } from 'sonner';
import { normalizeDigits } from '@/components/ui/masked-input';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { calculateAge, formatDateBr } from '@/lib/birthdays';

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('id, name, document, phone, email, city, date_of_birth, photo_url')
      .order('name');
    setCustomers(data as Customer[] || []);
    setLoading(false);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const searchText = search.trim().toLowerCase();
  const searchDigits = normalizeDigits(search);
  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchText) ||
    (searchDigits
      ? (c.document?.includes(searchDigits) || c.phone?.includes(searchDigits))
      : false)
  );

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir cliente "${name}"?`)) return;
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir cliente');
      return;
    }
    toast.success('Cliente excluído');
    loadCustomers();
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
        <Button onClick={() => navigate('/clientes/novo')}><Plus className="mr-2 h-4 w-4" />Novo Cliente</Button>
      </div>
      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar clientes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Nascimento</TableHead>
                <TableHead>Idade</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado</TableCell></TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link to={`/clientes/${c.id}/historico`} className="flex items-center gap-2 text-primary hover:underline">
                      <Avatar className="h-8 w-8">
                        {c.photo_url ? (
                          <AvatarImage src={ensurePublicStorageUrl('customer-photos', c.photo_url) || undefined} alt={c.name} />
                        ) : null}
                        <AvatarFallback className="bg-muted text-[10px]">
                          {c.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CL'}
                        </AvatarFallback>
                      </Avatar>
                      <span>{c.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>{c.document || '-'}</TableCell>
                  <TableCell>{c.phone || '-'}</TableCell>
                  <TableCell>{c.email || '-'}</TableCell>
                  <TableCell>{formatDateBr(c.date_of_birth)}</TableCell>
                  <TableCell>{calculateAge(c.date_of_birth) ?? '-'}</TableCell>
                  <TableCell>{c.city || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/clientes/${c.id}`)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id, c.name)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

