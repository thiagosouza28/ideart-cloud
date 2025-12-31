import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, ArrowDown, ArrowUp, RefreshCw, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { StockMovement, Product, StockMovementType } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const typeLabels: Record<StockMovementType, string> = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste' };
const typeColors: Record<StockMovementType, string> = {
  entrada: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
  saida: 'bg-destructive/10 text-destructive border-destructive/20',
  ajuste: 'bg-primary/10 text-primary border-primary/20'
};

export default function Stock() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'products' | 'movements' | 'form'>('products');
  const [previousView, setPreviousView] = useState<'products' | 'movements'>('products');
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    movement_type: '' as StockMovementType | '',
    quantity: '',
    reason: ''
  });

  const latestMovementByProduct = useMemo(() => {
    const map = new Map<string, StockMovement>();
    movements.forEach((movement) => {
      if (!map.has(movement.product_id)) {
        map.set(movement.product_id, movement);
      }
    });
    return map;
  }, [movements]);

  const isLatestMovement = (movement: StockMovement) =>
    latestMovementByProduct.get(movement.product_id)?.id === movement.id;

  const isEditingMovement = Boolean(editingMovement);

  const loadData = async () => {
    const [p, m] = await Promise.all([
      supabase.from('products').select('*').eq('track_stock', true).order('name'),
      supabase.from('stock_movements').select('*, product:products(name)').order('created_at', { ascending: false }).limit(50)
    ]);
    setProducts(p.data as Product[] || []);
    setMovements(m.data as StockMovement[] || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const formatDate = (d: string) => new Date(d).toLocaleString('pt-BR');

  const openForm = (type?: StockMovementType, productId?: string) => {
    setPreviousView(view === 'form' ? 'products' : view);
    setEditingMovement(null);
    setForm({
      product_id: productId || '',
      movement_type: type || '',
      quantity: '',
      reason: ''
    });
    setView('form');
  };

  const openEditForm = (movement: StockMovement) => {
    if (!isLatestMovement(movement)) {
      toast.error('Apenas a última movimentação do produto pode ser editada');
      return;
    }
    setPreviousView(view === 'form' ? 'movements' : view);
    setEditingMovement(movement);
    setForm({
      product_id: movement.product_id,
      movement_type: movement.movement_type,
      quantity: String(movement.quantity),
      reason: movement.reason || ''
    });
    setView('form');
  };

  const handleSubmit = async () => {
    if (!form.product_id || !form.movement_type || !form.quantity) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const quantity = parseFloat(form.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Quantidade deve ser maior que zero');
      return;
    }

    const product = products.find(p => p.id === form.product_id);
    if (!product) return;

    if (isEditingMovement && editingMovement) {
      setSaving(true);
      const previousQuantity = Number(editingMovement.quantity);

      let newStock = product.stock_quantity;
      if (editingMovement.movement_type === 'entrada') {
        newStock = product.stock_quantity - previousQuantity + quantity;
      } else if (editingMovement.movement_type === 'saida') {
        const stockBefore = product.stock_quantity + previousQuantity;
        if (quantity > stockBefore) {
          toast.error('Quantidade maior que o estoque disponível');
          setSaving(false);
          return;
        }
        newStock = stockBefore - quantity;
      } else {
        newStock = quantity;
      }

      if (newStock < 0) {
        toast.error('Quantidade inválida para o estoque atual');
        setSaving(false);
        return;
      }

      const { error: movementError } = await supabase
        .from('stock_movements')
        .update({
          quantity,
          reason: form.reason || null,
        })
        .eq('id', editingMovement.id);

      if (movementError) {
        toast.error('Erro ao atualizar movimentação');
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('products')
        .update({ stock_quantity: newStock })
        .eq('id', editingMovement.product_id);

      if (updateError) {
        await supabase
          .from('stock_movements')
          .update({
            quantity: previousQuantity,
            reason: editingMovement.reason || null,
          })
          .eq('id', editingMovement.id);
        toast.error('Erro ao atualizar estoque');
        setSaving(false);
        return;
      }

      toast.success('Movimentação atualizada com sucesso');
      setView(previousView);
      setEditingMovement(null);
      setSaving(false);
      loadData();
      return;
    }

    // Check if there's enough stock for exit
    if (form.movement_type === 'saida' && quantity > product.stock_quantity) {
      toast.error('Quantidade maior que o estoque disponível');
      return;
    }

    setSaving(true);

    // Insert movement
    const { error: movementError } = await supabase.from('stock_movements').insert({
      product_id: form.product_id,
      movement_type: form.movement_type,
      quantity: quantity,
      reason: form.reason || null,
      user_id: user?.id || null
    });

    if (movementError) {
      toast.error('Erro ao registrar movimentação');
      setSaving(false);
      return;
    }

    // Update product stock
    let newStock = product.stock_quantity;
    if (form.movement_type === 'entrada') {
      newStock += quantity;
    } else if (form.movement_type === 'saida') {
      newStock -= quantity;
    } else {
      newStock = quantity; // Ajuste sets the exact value
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({ stock_quantity: newStock })
      .eq('id', form.product_id);

    if (updateError) {
      toast.error('Erro ao atualizar estoque');
      setSaving(false);
      return;
    }

    toast.success('Movimentação registrada com sucesso');
    setView(previousView);
    setEditingMovement(null);
    setSaving(false);
    loadData();
  };

  const selectedProduct = products.find(p => p.id === form.product_id);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Controle de Estoque</h1>
        <div className="flex gap-2">
          {view !== 'form' ? (
            <>
              <Button variant={view === 'products' ? 'default' : 'outline'} onClick={() => setView('products')}>
                Produtos
              </Button>
              <Button variant={view === 'movements' ? 'default' : 'outline'} onClick={() => setView('movements')}>
                Movimentações
              </Button>
              <Button onClick={() => openForm()}>
                <Plus className="mr-2 h-4 w-4" />Nova Movimentação
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setView(previousView)}>
              Voltar
            </Button>
          )}
        </div>
      </div>

      {view === 'form' ? (
        <Card>
          <CardHeader>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {form.movement_type === 'entrada' && <ArrowDown className="h-5 w-5 text-chart-2" />}
              {form.movement_type === 'saida' && <ArrowUp className="h-5 w-5 text-destructive" />}
              {form.movement_type === 'ajuste' && <RefreshCw className="h-5 w-5 text-primary" />}
              {isEditingMovement && 'Editar Movimentação'}
              {!isEditingMovement && !form.movement_type && 'Nova Movimentação'}
              {form.movement_type === 'entrada' && 'Entrada de Estoque'}
              {form.movement_type === 'saida' && 'Saída de Estoque'}
              {form.movement_type === 'ajuste' && 'Ajuste de Estoque'}
            </h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Tipo de Movimentação *</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "flex-1",
                    form.movement_type === 'entrada' ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600" : "hover:bg-emerald-50 text-emerald-600 border-emerald-200"
                  )}
                  onClick={() => setForm(prev => ({ ...prev, movement_type: 'entrada' }))}
                  disabled={isEditingMovement}
                >
                  <ArrowDown className="h-4 w-4 mr-2" />
                  Entrada
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "flex-1",
                    form.movement_type === 'saida' ? "bg-destructive hover:bg-destructive/90 text-white border-destructive" : "hover:bg-destructive/10 text-destructive border-destructive/20"
                  )}
                  onClick={() => setForm(prev => ({ ...prev, movement_type: 'saida' }))}
                  disabled={isEditingMovement}
                >
                  <ArrowUp className="h-4 w-4 mr-2" />
                  Saída
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "flex-1",
                    form.movement_type === 'ajuste' ? "bg-primary hover:bg-primary/90 text-white border-primary" : "hover:bg-primary/10 text-primary border-primary/20"
                  )}
                  onClick={() => setForm(prev => ({ ...prev, movement_type: 'ajuste' }))}
                  disabled={isEditingMovement}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Ajuste
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Produto *</Label>
                <Select
                  value={form.product_id}
                  onValueChange={(v) => setForm(prev => ({ ...prev, product_id: v }))}
                  disabled={isEditingMovement}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {form.movement_type === 'ajuste' ? 'Novo Estoque *' : 'Quantidade *'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.quantity}
                  onChange={(e) => setForm(prev => ({ ...prev, quantity: e.target.value }))}
                  placeholder={form.movement_type === 'ajuste' ? 'Estoque total' : 'Quantidade'}
                />
              </div>
            </div>

            {selectedProduct && (
              <div className="p-4 rounded-lg bg-muted/40 border text-sm grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground mb-1">Estoque atual:</p>
                  <p className="font-bold text-lg">{selectedProduct.stock_quantity} {selectedProduct.unit}</p>
                </div>
                {form.movement_type === 'ajuste' && form.quantity && (
                  <div>
                    <p className="text-muted-foreground mb-1">Diferença:</p>
                    <p className={cn(
                      "font-bold text-lg",
                      parseFloat(form.quantity) - selectedProduct.stock_quantity >= 0 ? "text-chart-2" : "text-destructive"
                    )}>
                      {parseFloat(form.quantity) - selectedProduct.stock_quantity > 0 ? '+' : ''}
                      {(parseFloat(form.quantity) - selectedProduct.stock_quantity).toFixed(2)} {selectedProduct.unit}
                    </p>
                  </div>
                )}
                {selectedProduct.min_stock > 0 && (
                  <div className="col-span-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground">Estoque mínimo configurado: {selectedProduct.min_stock} {selectedProduct.unit}</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Motivo / Observação</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Ex: Compra de fornecedor, Venda avulsa, Inventário..."
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setView(previousView)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={saving} className="min-w-[120px]">
                {saving ? 'Salvando...' : isEditingMovement ? 'Salvar Alterações' : 'Confirmar Movimentação'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            {view === 'products' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Estoque Atual</TableHead>
                    <TableHead>Estoque Mínimo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[260px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow>
                  ) : filteredProducts.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado</TableCell></TableRow>
                  ) : filteredProducts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.stock_quantity} {p.unit}</TableCell>
                      <TableCell>{p.min_stock} {p.unit}</TableCell>
                      <TableCell>
                        <Badge variant={p.stock_quantity <= p.min_stock ? 'destructive' : 'default'}>
                          {p.stock_quantity <= p.min_stock ? 'Baixo' : 'OK'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-chart-2 hover:text-chart-2 border-chart-2/20"
                            onClick={() => openForm('entrada', p.id)}
                          >
                            <ArrowDown className="h-3 w-3 mr-1" />
                            Entrada
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive border-destructive/20"
                            onClick={() => openForm('saida', p.id)}
                          >
                            <ArrowUp className="h-3 w-3 mr-1" />
                            Saída
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-primary hover:text-primary"
                            onClick={() => openForm('ajuste', p.id)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Ajuste
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="w-16">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma movimentação registrada</TableCell></TableRow>
                  ) : movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{formatDate(m.created_at)}</TableCell>
                      <TableCell className="font-medium">{(m as any).product?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={typeColors[m.movement_type]}>
                          {typeLabels[m.movement_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className={m.movement_type === 'entrada' ? 'text-chart-2 font-medium' : m.movement_type === 'saida' ? 'text-destructive font-medium' : ''}>
                        {m.movement_type === 'entrada' ? '+' : m.movement_type === 'saida' ? '-' : ''}{m.quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.reason || '-'}</TableCell>
                      <TableCell>
                        <span title={isLatestMovement(m) ? 'Editar movimentação' : 'Apenas a última movimentação pode ser editada'}>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!isLatestMovement(m)}
                            onClick={() => openEditForm(m)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
