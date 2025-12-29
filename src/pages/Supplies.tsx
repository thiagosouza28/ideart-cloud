import { useEffect, useState, useRef } from 'react';
import { Package, Search, Plus, Pencil, Trash2, Upload, Image as ImageIcon, ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Supply } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';

const units = ['un', 'kg', 'g', 'm', 'cm', 'ml', 'L', 'folha', 'rolo', 'pacote', 'caixa'];

export default function Supplies() {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSupply, setSelectedSupply] = useState<Supply | null>(null);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    loadSupplies();
  }, []);

  const loadSupplies = async () => {
    const { data, error } = await supabase
      .from('supplies')
      .select('*')
      .order('name');

    if (error) {
      toast.error('Erro ao carregar insumos');
      return;
    }

    const mapped = (data || []).map((supply) => ({
      ...(supply as Supply),
      image_url: ensurePublicStorageUrl('product-images', supply.image_url),
    }));
    setSupplies(mapped as Supply[]);
    setLoading(false);
  };

  const filtered = supplies.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

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
    setDialogOpen(true);
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

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Imagem deve ter no máximo 2MB');
      return;
    }

    setUploading(true);

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `supplies/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error('Supplies image upload failed', uploadError);
      const message = uploadError.message || 'Erro ao fazer upload da imagem';
      const hint = uploadError.message?.toLowerCase().includes('bucket')
        ? ' Verifique se o bucket "product-images" existe e se as policies permitem upload.'
        : '';
      toast.error(`${message}${hint}`);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    const normalizedUrl = ensurePublicStorageUrl('product-images', publicUrl);
    setFormData({ ...formData, image_url: normalizedUrl || '' });
    setUploading(false);
    toast.success('Imagem enviada com sucesso');
  };

  const removeImage = () => {
    setFormData({ ...formData, image_url: '' });
  };

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
    loadSupplies();
  };

  const handleDelete = async () => {
    if (!selectedSupply) return;

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
    loadSupplies();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const calculateMargin = (cost: number, sale: number) => {
    if (cost === 0) return 0;
    return ((sale - cost) / cost) * 100;
  };

  const profitPerUnit = formData.sale_price - formData.cost_per_unit;
  const marginPercent = calculateMargin(formData.cost_per_unit, formData.sale_price);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestão de Insumos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie os insumos e matérias-primas utilizados nos produtos
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Insumo
        </Button>
        <Button variant="outline" onClick={handlePrint} className="ml-2">
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
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
                <TableHead className="w-[100px]"></TableHead>
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

      {/* Create/Edit Form (Inline) */}
      {(dialogOpen || !supplies.length && supplies.length === 0 && false) ? ( // showing form if dialogOpen is true. Using dialogState for compatibility logic
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
            <div className="grid gap-6 md:grid-cols-[240px_1fr] max-w-5xl mx-auto">
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
                    <h3 className="text-sm font-semibold">Informacoes basicas</h3>
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
                      <Label>Estoque minimo</Label>
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
      ) : null}

      {/* List View - Hidden when Dialog (Edit Mode) is Open */}
      <div className={dialogOpen ? 'hidden' : 'block'}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Gestão de Insumos</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie os insumos e matérias-primas utilizados nos produtos
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Insumo
          </Button>
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
                  <TableHead className="w-[100px]"></TableHead>
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
      </div>

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
