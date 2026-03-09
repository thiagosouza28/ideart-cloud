import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Package,
  Search,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Image as ImageIcon,
  ArrowLeft,
  Printer,
  ArrowDown,
  ArrowUp,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { StockMovementType, Supply, SupplyStockMovement } from '@/types/database';
import { ensurePublicStorageUrl, getStoragePathFromUrl } from '@/lib/storage';
import { uploadFile, deleteFile } from '@/lib/upload';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const units = ['un', 'kg', 'g', 'm', 'cm', 'ml', 'L', 'folha', 'rolo', 'pacote', 'caixa'];
const movementTypeLabels: Record<StockMovementType, string> = {
  entrada: 'Entrada',
  saida: 'Saida',
  ajuste: 'Ajuste',
};
const movementTypeColors: Record<StockMovementType, string> = {
  entrada: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
  saida: 'bg-destructive/10 text-destructive border-destructive/20',
  ajuste: 'bg-primary/10 text-primary border-primary/20',
};

type SupplyMovementRow = SupplyStockMovement & {
  supply?: Pick<Supply, 'id' | 'name' | 'unit'> | null;
};

export default function Supplies() {
  const { user, profile } = useAuth();
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [movements, setMovements] = useState<SupplyMovementRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSupply, setSelectedSupply] = useState<Supply | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingMovement, setSavingMovement] = useState(false);
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    unit: 'un',
    cost_per_unit: 0,
    sale_price: 0,
    stock_quantity: 0,
    min_stock: 0,
    image_url: '',
  });
  const [movementForm, setMovementForm] = useState({
    supply_id: '',
    movement_type: 'entrada' as StockMovementType,
    quantity: '',
    reason: '',
  });

  useEffect(() => {
    void loadData();
  }, [profile?.company_id]);

  const loadData = async () => {
    setLoading(true);

    let suppliesQuery = supabase
      .from('supplies')
      .select('*')
      .order('name');

    if (profile?.company_id) {
      suppliesQuery = suppliesQuery.eq('company_id', profile.company_id);
    }

    let movementsQuery = supabase
      .from('supply_stock_movements')
      .select('*, supply:supplies(id, name, unit)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (profile?.company_id) {
      movementsQuery = movementsQuery.eq('company_id', profile.company_id);
    }

    const [suppliesResult, movementsResult] = await Promise.all([
      suppliesQuery,
      movementsQuery,
    ]);

    if (suppliesResult.error || movementsResult.error) {
      toast.error('Erro ao carregar insumos');
      setLoading(false);
      return;
    }

    const mappedSupplies = (suppliesResult.data || []).map((supply) => ({
      ...(supply as Supply),
      image_url: ensurePublicStorageUrl('product-images', supply.image_url),
    }));

    setSupplies(mappedSupplies as Supply[]);
    setMovements((movementsResult.data as SupplyMovementRow[]) || []);
    setLoading(false);
  };

  const filtered = supplies.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredMovements = movements.filter((movement) => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return true;

    return [
      movement.supply?.name || '',
      movement.reason || '',
      movementTypeLabels[movement.movement_type] || '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  });
  const selectedMovementSupply = supplies.find((supply) => supply.id === movementForm.supply_id);

  const openCreateDialog = () => {
    setSelectedSupply(null);
    setFormData({
      name: '',
      unit: 'un',
      cost_per_unit: 0,
      sale_price: 0,
      stock_quantity: 0,
      min_stock: 0,
      image_url: '',
    });
    setInitialFormSnapshot(JSON.stringify({ name: '', unit: 'un', cost_per_unit: 0, sale_price: 0, stock_quantity: 0, min_stock: 0, image_url: '' }));
    setDialogOpen(true);
  };

  const openMovementDialog = (movementType?: StockMovementType, supply?: Supply | null) => {
    setMovementForm({
      supply_id: supply?.id || '',
      movement_type: movementType || 'entrada',
      quantity: '',
      reason: '',
    });
    setMovementDialogOpen(true);
  };

  const openEditDialog = (supply: Supply) => {
    setSelectedSupply(supply);
    setFormData({
      name: supply.name,
      unit: supply.unit,
      cost_per_unit: supply.cost_per_unit,
      sale_price: supply.sale_price || 0,
      stock_quantity: supply.stock_quantity,
      min_stock: supply.min_stock,
      image_url: ensurePublicStorageUrl('product-images', supply.image_url) || '',
    });
    setInitialFormSnapshot(JSON.stringify({ name: supply.name, unit: supply.unit, cost_per_unit: supply.cost_per_unit, sale_price: supply.sale_price || 0, stock_quantity: supply.stock_quantity, min_stock: supply.min_stock, image_url: ensurePublicStorageUrl('product-images', supply.image_url) || '' }));
    setDialogOpen(true);
  };

  const openDeleteDialog = (supply: Supply) => {
    setSelectedSupply(supply);
    setDeleteDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem deve ter no máximo 5MB');
      return;
    }

    setUploading(true);

    try {
      const url = await uploadFile(file, 'insumos');
      setFormData({ ...formData, image_url: url });
      toast.success('Imagem enviada com sucesso');
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async () => {
    const targetUrl = formData.image_url;
    if (targetUrl) {
      if (targetUrl.startsWith('/uploads/')) {
        await deleteFile(targetUrl);
      } else {
        const path = getStoragePathFromUrl('product-images', targetUrl);
        if (path) {
          await supabase.storage.from('product-images').remove([path]);
        }
      }
    }
    setFormData({ ...formData, image_url: '' });
  };

  const formSnapshotJson = useMemo(() => JSON.stringify(formData), [formData]);
  const isDirty = dialogOpen && initialFormSnapshot !== null && initialFormSnapshot !== formSnapshotJson;

  useUnsavedChanges(isDirty && !saving);

  const handlePrint = () => {
    const rows = supplies.map(supply => ({
      Insumo: supply.name,
      Unidade: supply.unit,
      'Custo Unit.': new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(supply.cost_per_unit),
      'Preço Venda': new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(supply.sale_price || 0),
      Estoque: `${supply.stock_quantity} ${supply.unit}`,
      Status: supply.stock_quantity <= supply.min_stock ? 'Estoque Baixo' : 'OK',
    }));

    import('@/lib/report-export').then(({ printPdf }) => {
      printPdf('Relatório de Insumos', rows);
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);

    const supplyData = {
      name: formData.name.trim(),
      unit: formData.unit,
      cost_per_unit: formData.cost_per_unit,
      sale_price: formData.sale_price,
      stock_quantity: formData.stock_quantity,
      min_stock: formData.min_stock,
      image_url: formData.image_url || null,
    };

    if (selectedSupply) {
      const { error } = await supabase
        .from('supplies')
        .update(supplyData)
        .eq('id', selectedSupply.id);

      if (error) {
        toast.error('Erro ao atualizar insumo');
        setSaving(false);
        return;
      }

      toast.success('Insumo atualizado com sucesso');
    } else {
      const { error } = await supabase
        .from('supplies')
        .insert(supplyData);

      if (error) {
        toast.error('Erro ao criar insumo');
        setSaving(false);
        return;
      }

      toast.success('Insumo criado com sucesso');
    }

    setDialogOpen(false);
    setSaving(false);
    void loadData();
  };

  const handleDelete = async () => {
    if (!selectedSupply) return;

    if (selectedSupply.image_url) {
      if (selectedSupply.image_url.startsWith('/uploads/')) {
        await deleteFile(selectedSupply.image_url);
      } else {
        const path = getStoragePathFromUrl('product-images', selectedSupply.image_url);
        if (path) {
          await supabase.storage.from('product-images').remove([path]);
        }
      }
    }

    const { error } = await supabase
      .from('supplies')
      .delete()
      .eq('id', selectedSupply.id);

    if (error) {
      toast.error('Erro ao excluir insumo. Pode estar vinculado a produtos.');
      return;
    }

    toast.success('Insumo excluído com sucesso');
    setDeleteDialogOpen(false);
    void loadData();
  };

  const handleSaveMovement = async () => {
    if (!profile?.company_id) {
      toast.error('Empresa nao encontrada na sessao');
      return;
    }

    if (!movementForm.supply_id || !movementForm.quantity) {
      toast.error('Preencha os campos obrigatorios');
      return;
    }

    const quantity = parseFloat(movementForm.quantity);
    if (Number.isNaN(quantity) || quantity <= 0) {
      toast.error('Quantidade deve ser maior que zero');
      return;
    }

    const supply = supplies.find((item) => item.id === movementForm.supply_id);
    if (!supply) {
      toast.error('Selecione um insumo valido');
      return;
    }

    if (movementForm.movement_type === 'saida' && quantity > Number(supply.stock_quantity || 0)) {
      toast.error('Quantidade maior que o estoque disponivel');
      return;
    }

    setSavingMovement(true);

    const movementPayload = {
      company_id: profile.company_id,
      supply_id: supply.id,
      movement_type: movementForm.movement_type,
      quantity,
      reason: movementForm.reason.trim() || null,
      user_id: user?.id || null,
      origin: movementForm.movement_type === 'ajuste' ? 'ajuste' : 'manual',
    };

    const { data: insertedMovement, error: movementError } = await supabase
      .from('supply_stock_movements')
      .insert(movementPayload)
      .select('id')
      .single();

    if (movementError) {
      toast.error('Erro ao registrar movimentacao de insumo');
      setSavingMovement(false);
      return;
    }

    let nextStock = Number(supply.stock_quantity || 0);
    if (movementForm.movement_type === 'entrada') {
      nextStock += quantity;
    } else if (movementForm.movement_type === 'saida') {
      nextStock -= quantity;
    } else {
      nextStock = quantity;
    }

    const { error: updateError } = await supabase
      .from('supplies')
      .update({ stock_quantity: nextStock })
      .eq('id', supply.id);

    if (updateError) {
      if (insertedMovement?.id) {
        await supabase.from('supply_stock_movements').delete().eq('id', insertedMovement.id);
      }
      toast.error('Erro ao atualizar estoque do insumo');
      setSavingMovement(false);
      return;
    }

    toast.success('Movimentacao registrada com sucesso');
    setMovementDialogOpen(false);
    setSavingMovement(false);
    setMovementForm({
      supply_id: '',
      movement_type: 'entrada',
      quantity: '',
      reason: '',
    });
    void loadData();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR');

  const calculateMargin = (cost: number, sale: number) => {
    if (cost === 0) return 0;
    return ((sale - cost) / cost) * 100;
  };

  const profitPerUnit = formData.sale_price - formData.cost_per_unit;
  const marginPercent = calculateMargin(formData.cost_per_unit, formData.sale_price);

  return (
    <div className="page-container">
      {/* Create/Edit Form (Inline) - Visible when Dialog is open */}
      {dialogOpen ? (
        <div className="flex flex-col h-full bg-background animate-in slide-in-from-right-4 duration-300">
          <div className="border-b px-6 py-4 flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setDialogOpen(false)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-lg font-semibold">
                {selectedSupply ? 'Editar Insumo' : 'Novo Insumo'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedSupply ? 'Alterar dados do insumo' : 'Cadastrar novo insumo no sistema'}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="grid w-full min-w-0 gap-6 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
              {/* Image Upload */}
              <div className="space-y-4 md:sticky md:top-4 self-start">
                <div className="space-y-2">
                  <Label>Foto do Insumo</Label>
                  <div className="relative">
                    {formData.image_url ? (
                      <img
                        src={formData.image_url}
                        alt="Preview"
                        className="h-40 w-full rounded-xl object-cover border"
                      />
                    ) : (
                      <button
                        type="button"
                        className="h-40 w-full rounded-xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-xs">Adicionar imagem</span>
                      </button>
                    )}
                    {formData.image_url && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-7 w-7"
                        onClick={removeImage}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? 'Enviando...' : formData.image_url ? 'Trocar imagem' : 'Selecionar imagem'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: JPG ou PNG (max 2MB).
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Informações básicas</h3>
                    <p className="text-xs text-muted-foreground">
                      Dados principais do insumo e regras de reposicao.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Nome *</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ex: Papel A4, Tinta preta, Vinil adesivo"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unidade</Label>
                      <Select
                        value={formData.unit}
                        onValueChange={(value) => setFormData({ ...formData, unit: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {units.map((unit) => (
                            <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Estoque mínimo</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.min_stock}
                        onChange={(e) => setFormData({ ...formData, min_stock: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Custos e preços</h3>
                    <p className="text-xs text-muted-foreground">
                      Informe valores de compra e venda para calcular margem automaticamente.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Preço de custo (compra)</Label>
                      <CurrencyInput
                        value={formData.cost_per_unit}
                        onChange={(value) => setFormData({ ...formData, cost_per_unit: value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Preço de venda</Label>
                      <CurrencyInput
                        value={formData.sale_price}
                        onChange={(value) => setFormData({ ...formData, sale_price: value })}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Margem de lucro</span>
                      <span className={`font-semibold ${marginPercent >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                        {formData.cost_per_unit > 0 ? `${marginPercent.toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-muted-foreground">Lucro por unidade</span>
                      <span className="font-semibold">
                        {formData.sale_price > 0 ? formatCurrency(profitPerUnit) : '--'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Estoque</h3>
                    <p className="text-xs text-muted-foreground">
                      Controle a quantidade disponivel para este insumo.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade atual em estoque</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.stock_quantity}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t bg-background px-6 py-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      ) : (
        /* List View - Hidden when Form is Open */
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">Gestão de Insumos</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Gerencie os insumos e matérias-primas utilizados nos produtos
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => openMovementDialog('ajuste')}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Ajustar estoque
              </Button>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Insumo
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Insumos Cadastrados
                  </CardTitle>
                  <CardDescription>
                    {supplies.length} insumo{supplies.length !== 1 ? 's' : ''} no sistema
                  </CardDescription>
                </div>
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar insumos..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Foto</TableHead>
                    <TableHead>Insumo</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Venda</TableHead>
                    <TableHead>Margem</TableHead>
                    <TableHead>Estoque</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[180px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        {search ? 'Nenhum insumo encontrado' : 'Nenhum insumo cadastrado'}
                      </TableCell>
                    </TableRow>
                  ) : filtered.map((supply) => (
                    <TableRow key={supply.id}>
                      <TableCell>
                        {supply.image_url ? (
                          <img
                            src={supply.image_url}
                            alt={supply.name}
                            className="w-12 h-12 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{supply.name}</TableCell>
                      <TableCell>{supply.unit}</TableCell>
                      <TableCell>{formatCurrency(supply.cost_per_unit)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(supply.sale_price || 0)}</TableCell>
                      <TableCell>
                        {supply.sale_price > 0 ? (
                          <span className={calculateMargin(supply.cost_per_unit, supply.sale_price) >= 0 ? 'text-chart-2' : 'text-destructive'}>
                            {calculateMargin(supply.cost_per_unit, supply.sale_price).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{supply.stock_quantity} {supply.unit}</TableCell>
                      <TableCell>
                        <Badge
                          variant={supply.stock_quantity <= supply.min_stock ? 'destructive' : 'default'}
                        >
                          {supply.stock_quantity <= supply.min_stock ? 'Baixo' : 'OK'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => openMovementDialog('ajuste', supply)}>
                            Estoque
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(supply)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(supply)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Movimentacoes de estoque</CardTitle>
                  <CardDescription>
                    Historico recente de entradas, saidas e ajustes dos insumos.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openMovementDialog('entrada')}>
                    <ArrowDown className="h-4 w-4 mr-2" />
                    Entrada
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openMovementDialog('saida')}>
                    <ArrowUp className="h-4 w-4 mr-2" />
                    Saida
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openMovementDialog('ajuste')}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Ajuste
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : filteredMovements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhuma movimentacao registrada para os insumos.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="font-medium">
                          {movement.supply?.name || 'Insumo'}
                        </TableCell>
                        <TableCell>
                          <Badge className={movementTypeColors[movement.movement_type]}>
                            {movementTypeLabels[movement.movement_type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {movement.quantity} {movement.supply?.unit || ''}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {movement.reason || '-'}
                        </TableCell>
                        <TableCell>{formatDate(movement.created_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={movementDialogOpen}
        onOpenChange={(open) => {
          setMovementDialogOpen(open);
          if (!open) {
            setMovementForm({
              supply_id: '',
              movement_type: 'entrada',
              quantity: '',
              reason: '',
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {movementForm.movement_type === 'entrada' && <ArrowDown className="h-5 w-5 text-chart-2" />}
              {movementForm.movement_type === 'saida' && <ArrowUp className="h-5 w-5 text-destructive" />}
              {movementForm.movement_type === 'ajuste' && <RefreshCw className="h-5 w-5 text-primary" />}
              Movimentar estoque de insumo
            </DialogTitle>
            <DialogDescription>
              Registre entrada, saida ou ajuste do estoque de materias-primas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Tipo de movimentacao</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex-1',
                    movementForm.movement_type === 'entrada'
                      ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50',
                  )}
                  onClick={() => setMovementForm((prev) => ({ ...prev, movement_type: 'entrada' }))}
                >
                  <ArrowDown className="h-4 w-4 mr-2" />
                  Entrada
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex-1',
                    movementForm.movement_type === 'saida'
                      ? 'bg-destructive text-white border-destructive hover:bg-destructive/90'
                      : 'border-destructive/20 text-destructive hover:bg-destructive/10',
                  )}
                  onClick={() => setMovementForm((prev) => ({ ...prev, movement_type: 'saida' }))}
                >
                  <ArrowUp className="h-4 w-4 mr-2" />
                  Saida
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex-1',
                    movementForm.movement_type === 'ajuste'
                      ? 'bg-primary text-white border-primary hover:bg-primary/90'
                      : 'border-primary/20 text-primary hover:bg-primary/10',
                  )}
                  onClick={() => setMovementForm((prev) => ({ ...prev, movement_type: 'ajuste' }))}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Ajuste
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Insumo</Label>
                <Select
                  value={movementForm.supply_id}
                  onValueChange={(value) => setMovementForm((prev) => ({ ...prev, supply_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o insumo" />
                  </SelectTrigger>
                  <SelectContent>
                    {supplies.map((supply) => (
                      <SelectItem key={supply.id} value={supply.id}>
                        {supply.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{movementForm.movement_type === 'ajuste' ? 'Novo estoque' : 'Quantidade'}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={movementForm.quantity}
                  onChange={(event) => setMovementForm((prev) => ({ ...prev, quantity: event.target.value }))}
                  placeholder={movementForm.movement_type === 'ajuste' ? 'Estoque total' : 'Quantidade'}
                />
              </div>
            </div>

            {selectedMovementSupply && (
              <div className="grid gap-4 rounded-lg border bg-muted/40 p-4 text-sm md:grid-cols-2">
                <div>
                  <p className="mb-1 text-muted-foreground">Estoque atual</p>
                  <p className="text-lg font-bold">
                    {selectedMovementSupply.stock_quantity} {selectedMovementSupply.unit}
                  </p>
                </div>
                {movementForm.movement_type === 'ajuste' && movementForm.quantity && (
                  <div>
                    <p className="mb-1 text-muted-foreground">Diferenca</p>
                    <p
                      className={cn(
                        'text-lg font-bold',
                        parseFloat(movementForm.quantity) - selectedMovementSupply.stock_quantity >= 0
                          ? 'text-chart-2'
                          : 'text-destructive',
                      )}
                    >
                      {parseFloat(movementForm.quantity) - selectedMovementSupply.stock_quantity > 0 ? '+' : ''}
                      {(parseFloat(movementForm.quantity) - selectedMovementSupply.stock_quantity).toFixed(2)}{' '}
                      {selectedMovementSupply.unit}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Motivo / observacao</Label>
              <Textarea
                rows={4}
                value={movementForm.reason}
                onChange={(event) => setMovementForm((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="Ex.: compra de fornecedor, ajuste de inventario, perda de material..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialogOpen(false)} disabled={savingMovement}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMovement} disabled={savingMovement}>
              {savingMovement ? 'Salvando...' : 'Confirmar movimentacao'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Insumo</DialogTitle>
            <DialogDescription className="sr-only">Confirmação de exclusão de insumo</DialogDescription>
          </DialogHeader>
          <p className="py-4">
            Tem certeza que deseja excluir o insumo <strong>{selectedSupply?.name}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


