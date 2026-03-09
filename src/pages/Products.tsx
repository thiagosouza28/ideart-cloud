import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Edit, Trash2, Filter, Upload, Download, FileSpreadsheet, Loader2, X, CheckCircle2, AlertCircle, Tag, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Category, Expense, OrderItem, Product, ProductSupply, ProductType, SaleItem } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { buildProductProfitabilityRows, buildSoldUnitsMap } from '@/lib/finance';
import { isPromotionActive } from '@/lib/pricing';
import { isValidCode128, isValidEan13, normalizeBarcode } from '@/lib/barcode';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { deleteFile } from '@/lib/upload';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CSVRow {
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  product_type: ProductType;
  category?: string;
  unit: string;
  base_cost: number;
  labor_cost: number;
  profit_margin: number;
  stock_quantity: number;
  min_stock: number;
  is_active: boolean;
}

interface ImportResult {
  row: number;
  name: string;
  status: 'success' | 'error';
  message?: string;
}

type ProductWithSupplies = Product & {
  product_supplies?: Array<{
    quantity: number;
    supply?: { cost_per_unit: number | null } | null;
  }>;
};

export default function Products() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, company } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<ProductWithSupplies[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'results'>('upload');

  useEffect(() => {
    fetchData();
  }, [profile?.company_id]);

  const fetchData = async () => {
    let productsQuery = supabase
      .from('products')
      .select('*, category:categories(name), product_supplies(quantity, supply:supplies(cost_per_unit))')
      .order('name');
    let categoriesQuery = supabase.from('categories').select('*').order('name');
    let expensesQuery = supabase.from('expenses').select('*').order('created_at', { ascending: false });
    let ordersQuery = supabase
      .from('orders')
      .select('id, status')
      .order('created_at', { ascending: false })
      .limit(500);
    let salesQuery = supabase
      .from('sales')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(500);

    if (profile?.company_id) {
      productsQuery = productsQuery.eq('company_id', profile.company_id);
      categoriesQuery = categoriesQuery.eq('company_id', profile.company_id);
      expensesQuery = expensesQuery.eq('company_id', profile.company_id);
      ordersQuery = ordersQuery.eq('company_id', profile.company_id);
      salesQuery = salesQuery.eq('company_id', profile.company_id);
    }

    const [productsResult, categoriesResult, expensesResult, ordersResult, salesResult] = await Promise.all([
      productsQuery,
      categoriesQuery,
      expensesQuery,
      ordersQuery,
      salesQuery,
    ]);

    const nextProducts = (productsResult.data as unknown as ProductWithSupplies[]) || [];
    setProducts(nextProducts);
    setCategories((categoriesResult.data as Category[]) || []);
    setExpenses((expensesResult.data as Expense[]) || []);

    const validOrderIds = ((ordersResult.data as Array<{ id: string; status: string }>) || [])
      .filter((order) => !['orcamento', 'pendente', 'cancelado'].includes(order.status))
      .map((order) => order.id);
    const saleIds = ((salesResult.data as Array<{ id: string }>) || []).map((sale) => sale.id);

    const [orderItemsResult, saleItemsResult] = await Promise.all([
      validOrderIds.length
        ? supabase
          .from('order_items')
          .select('id, order_id, product_id, product_name, quantity, unit_price, discount, total, attributes, notes, created_at')
          .in('order_id', validOrderIds)
        : Promise.resolve({ data: [] }),
      saleIds.length
        ? supabase
          .from('sale_items')
          .select('id, sale_id, product_id, product_name, quantity, unit_price, discount, total, attributes, created_at')
          .in('sale_id', saleIds)
        : Promise.resolve({ data: [] }),
    ]);

    setOrderItems((orderItemsResult.data as OrderItem[]) || []);
    setSaleItems((saleItemsResult.data as SaleItem[]) || []);
    setLoading(false);
  };

  const toggleCatalogVisibility = async (productId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ show_in_catalog: !currentStatus })
        .eq('id', productId);

      if (error) throw error;

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, show_in_catalog: !currentStatus } : p))
      );

      toast({
        title: !currentStatus ? 'Produto visível no catálogo' : 'Produto oculto no catálogo',
        duration: 2000,
      });
    } catch (error) {
      console.error('Error updating catalog visibility:', error);
      toast({
        title: 'Erro ao atualizar visibilidade',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    const productToDelete = products.find((p) => p.id === deleteId);
    if (productToDelete) {
      if (productToDelete.image_url) {
        if (productToDelete.image_url.startsWith('/uploads/')) {
          await deleteFile(productToDelete.image_url);
        } else {
          await supabase.storage.from('product-images').remove([productToDelete.image_url]);
        }
      }

      if (Array.isArray(productToDelete.image_urls)) {
        for (const url of productToDelete.image_urls) {
          if (typeof url === 'string') {
            if (url.startsWith('/uploads/')) {
              await deleteFile(url);
            } else {
              await supabase.storage.from('product-images').remove([url]);
            }
          }
        }
      }
    }

    let deleteQuery = supabase.from('products').delete().eq('id', deleteId);
    if (profile?.id) {
      deleteQuery = deleteQuery.eq('owner_id', profile.id);
    }
    const { error } = await deleteQuery;

    if (error) {
      toast({ title: 'Erro ao excluir produto', variant: 'destructive' });
    } else {
      toast({ title: 'Produto excluído com sucesso' });
      fetchData();
    }
    setDeleteId(null);
  };

  const filteredProducts = products.filter(p => {
    const term = search.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(term) ||
      p.sku?.toLowerCase().includes(term) ||
      p.barcode?.toLowerCase().includes(term);
    const matchesCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
    const matchesType = typeFilter === 'all' || p.product_type === typeFilter;
    return matchesSearch && matchesCategory && matchesType;
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getProductCost = (product: ProductWithSupplies) => {
    const suppliesCost = (product.product_supplies || []).reduce((acc, item) => {
      const unitCost = Number(item.supply?.cost_per_unit || 0);
      return acc + unitCost * Number(item.quantity || 0);
    }, 0);

    return Number(product.base_cost || 0) + Number(product.labor_cost || 0) + suppliesCost;
  };

  const productSupplies = useMemo<ProductSupply[]>(
    () =>
      products.flatMap((product) =>
        (product.product_supplies || []).map((item, index) => ({
          id: `${product.id}-${index}`,
          product_id: product.id,
          supply_id: `supply-${index}`,
          quantity: Number(item.quantity || 0),
          created_at: product.created_at,
          supply: item.supply as any,
        })),
      ),
    [products],
  );

  const profitabilityByProduct = useMemo(() => {
    const soldUnitsByProduct = buildSoldUnitsMap({ orderItems, saleItems });
    const rows = buildProductProfitabilityRows({
      products,
      productSupplies,
      expenses,
      soldUnitsByProduct,
    });

    return rows.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {} as Record<string, (typeof rows)[number]>);
  }, [expenses, orderItems, productSupplies, products, saleItems]);

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = { produto: 'Produto', confeccionado: 'Confeccionado', servico: 'Serviço' };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      produto: 'bg-blue-100 text-blue-800',
      confeccionado: 'bg-purple-100 text-purple-800',
      servico: 'bg-green-100 text-green-800'
    };
    return colors[type] || '';
  };

  const getProductThumbnail = (product: ProductWithSupplies) => {
    const urls = Array.isArray(product.image_urls) ? product.image_urls : [];
    const firstImage = urls.find((url) => typeof url === 'string' && url.trim() !== '');
    const source = firstImage || product.image_url;
    return ensurePublicStorageUrl('product-images', source) || '/placeholder.svg';
  };

  const normalizeBarcodeValue = (value: string) => normalizeBarcode(value);

  const validateBarcodeValue = (value: string) => {
    if (!value) return null;
    if (isValidEan13(value) || isValidCode128(value)) return null;
    return 'Código de barras inválido. Use EAN-13 ou Code 128.';
  };

  // CSV Import Functions
  const downloadTemplate = () => {
    const headers = ['nome', 'sku', 'barcode', 'descricao', 'tipo', 'categoria', 'unidade', 'custo_base', 'custo_mao_obra', 'margem_lucro', 'estoque', 'estoque_minimo', 'ativo'];
    const exampleRow = ['Produto Exemplo', 'SKU001', '7891234567895', 'Descrição do produto', 'produto', 'Categoria 1', 'un', '10.00', '5.00', '30', '100', '10', 'sim'];

    const csvContent = [
      headers.join(';'),
      exampleRow.join(';'),
      '# Código de barras: EAN-13 (13 dígitos) ou Code 128',
      '# Tipos válidos: produto, confeccionado, servico',
      '# Ativo: sim ou não',
      '# Use ponto para decimais (ex: 10.50)',
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_importacao_produtos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({ title: 'Selecione um arquivo CSV', variant: 'destructive' });
      return;
    }

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('#'));

    if (lines.length < 2) {
      toast({ title: 'Arquivo vazio ou inválido', variant: 'destructive' });
      return;
    }

    const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';').map(v => v.trim());
      if (values.length < 7) continue;

      const getValue = (index: number) => values[index] || '';
      const getNumber = (index: number) => parseFloat(values[index]?.replace(',', '.')) || 0;

      const typeValue = getValue(4).toLowerCase();
      const validType: ProductType = ['produto', 'confeccionado', 'servico'].includes(typeValue)
        ? typeValue as ProductType
        : 'produto';

      const activeValue = getValue(12).toLowerCase();
      rows.push({
        name: getValue(0),
        sku: getValue(1) || undefined,
        barcode: normalizeBarcodeValue(getValue(2)) || undefined,
        description: getValue(3) || undefined,
        product_type: validType,
        category: getValue(5) || undefined,
        unit: getValue(6) || 'un',
        base_cost: getNumber(7),
        labor_cost: getNumber(8),
        profit_margin: getNumber(9) || 30,
        stock_quantity: getNumber(10),
        min_stock: getNumber(11),
        is_active: activeValue !== 'nao' && activeValue !== 'não',
      });
    }

    if (rows.length === 0) {
      toast({ title: 'Nenhum produto válido encontrado no arquivo', variant: 'destructive' });
      return;
    }

    setCsvData(rows);
    setImportStep('preview');

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processImport = async () => {
    if (csvData.length === 0) return;

    setImporting(true);
    const results: ImportResult[] = [];
    const barcodeSeen = new Set<string>();

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];

      try {
        if (!row.name || row.name.length < 2) {
          results.push({ row: i + 1, name: row.name || '(sem nome)', status: 'error', message: 'Nome inválido' });
          continue;
        }

        const normalizedBarcode = normalizeBarcodeValue(row.barcode ?? '');
        const barcodeError = validateBarcodeValue(normalizedBarcode);
        if (barcodeError) {
          results.push({ row: i + 1, name: row.name, status: 'error', message: barcodeError });
          continue;
        }
        if (normalizedBarcode) {
          if (barcodeSeen.has(normalizedBarcode)) {
            results.push({ row: i + 1, name: row.name, status: 'error', message: 'Código de barras duplicado no arquivo' });
            continue;
          }
          barcodeSeen.add(normalizedBarcode);

          let barcodeQuery = supabase
            .from('products')
            .select('id')
            .eq('barcode', normalizedBarcode);
          if (profile?.company_id) {
            barcodeQuery = barcodeQuery.eq('company_id', profile.company_id);
          }
          const { data: barcodeExists, error: barcodeLookupError } = await barcodeQuery.maybeSingle();
          if (barcodeLookupError) {
            results.push({ row: i + 1, name: row.name, status: 'error', message: barcodeLookupError.message });
            continue;
          }
          if (barcodeExists) {
            results.push({ row: i + 1, name: row.name, status: 'error', message: 'Código de barras já está em uso' });
            continue;
          }
        }

        // Find category ID if provided
        let categoryId: string | null = null;
        if (row.category) {
          const cat = categories.find(c => c.name.toLowerCase() === row.category?.toLowerCase());
          if (cat) {
            categoryId = cat.id;
          }
        }

        const { error } = await supabase.from('products').insert({
          name: row.name,
          sku: row.sku || null,
          barcode: normalizedBarcode || null,
          description: row.description || null,
          product_type: row.product_type,
          category_id: categoryId,
          company_id: profile?.company_id || null,
          owner_id: profile?.id || null,
          is_public: false,
          is_copy: false,
          original_product_id: null,
          unit: row.unit,
          base_cost: row.base_cost,
          labor_cost: row.labor_cost,
          profit_margin: row.profit_margin,
          stock_quantity: row.stock_quantity,
          min_stock: row.min_stock,
          is_active: row.is_active,
        });

        if (error) {
          results.push({ row: i + 1, name: row.name, status: 'error', message: error.message });
        } else {
          results.push({ row: i + 1, name: row.name, status: 'success' });
        }
      } catch (err) {
        results.push({ row: i + 1, name: row.name, status: 'error', message: 'Erro inesperado' });
      }
    }

    setImportResults(results);
    setImportStep('results');
    setImporting(false);
    fetchData();
  };

  const closeImportDialog = () => {
    setImportDialogOpen(false);
    setCsvData([]);
    setImportResults([]);
    setImportStep('upload');
  };

  const successCount = importResults.filter(r => r.status === 'success').length;
  const errorCount = importResults.filter(r => r.status === 'error').length;

  // Export CSV function
  const exportToCSV = () => {
    if (filteredProducts.length === 0) {
      toast({ title: 'Nenhum produto para exportar', variant: 'destructive' });
      return;
    }

    const headers = ['nome', 'sku', 'barcode', 'descricao', 'tipo', 'categoria', 'unidade', 'custo_base', 'custo_mao_obra', 'margem_lucro', 'estoque', 'estoque_minimo', 'ativo'];

    const rows = filteredProducts.map(product => {
      const categoryName = (product as any).category?.name || '';
      return [
        product.name,
        product.sku || '',
        product.barcode || '',
        product.description || '',
        product.product_type,
        categoryName,
        product.unit,
        product.base_cost.toString().replace('.', ','),
        product.labor_cost.toString().replace('.', ','),
        product.profit_margin.toString(),
        product.stock_quantity.toString(),
        product.min_stock.toString(),
        product.is_active ? 'sim' : 'não'
      ].map(v => `"${v}"`).join(';');
    });

    const csvContent = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `produtos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({ title: `${filteredProducts.length} produtos exportados com sucesso` });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Produtos</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/produtos/simulador-preco')}>
            <Tag className="mr-2 h-4 w-4" />
            Simulador de Preço
          </Button>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button onClick={() => navigate('/produtos/novo')}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Produto
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, SKU ou código de barras..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="produto">Produto</SelectItem>
                  <SelectItem value="confeccionado">Confeccionado</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[84px]">Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Custo real</TableHead>
                <TableHead className="text-right">Lucro real</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Catálogo</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8">Carregando...</TableCell>
                </TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    Nenhum produto encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <img
                        src={getProductThumbnail(product)}
                        alt={product.name}
                        className="h-12 w-12 rounded-md border object-cover bg-muted"
                        onError={(event) => {
                          if (event.currentTarget.dataset.fallbackApplied === 'true') return;
                          event.currentTarget.dataset.fallbackApplied = 'true';
                          event.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          {product.name}
                          {product.is_public && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200 py-0 h-5 px-1.5">
                              Público
                            </Badge>
                          )}
                          {product.is_copy && (
                            <Badge variant="secondary" className="bg-violet-100 text-violet-800 hover:bg-violet-100 border-violet-200 py-0 h-5 px-1.5">
                              Cópia
                            </Badge>
                          )}
                          {isPromotionActive(product) && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 py-0 h-5 px-1.5 gap-1">
                              <Tag className="h-3 w-3" />
                              Promo
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{product.sku || '-'}</TableCell>
                    <TableCell>
                      <span className={`status-badge ${getTypeColor(product.product_type)}`}>
                        {getTypeLabel(product.product_type)}
                      </span>
                    </TableCell>
                    <TableCell>{(product as any).category?.name || '-'}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(product.final_price ?? product.catalog_price ?? 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-1">
                        <p>{formatCurrency(profitabilityByProduct[product.id]?.totalRealCost ?? getProductCost(product))}</p>
                        <p className="text-xs text-muted-foreground">
                          Direto {formatCurrency(profitabilityByProduct[product.id]?.directCost ?? getProductCost(product))}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-1">
                        <p>{formatCurrency(profitabilityByProduct[product.id]?.profitPerUnit ?? 0)}</p>
                        <p className="text-xs text-muted-foreground">
                          {(profitabilityByProduct[product.id]?.marginPct ?? 0).toFixed(1)}%
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className={product.track_stock && product.stock_quantity <= product.min_stock ? 'text-destructive font-medium' : ''}>
                      {product.track_stock ? (
                        `${product.stock_quantity} ${product.unit}`
                      ) : (
                        <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">
                          Não controla estoque
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.is_active ? 'default' : 'secondary'}>
                        {product.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={product.show_in_catalog ? 'Ocultar no catálogo' : 'Mostrar no catálogo'}
                        onClick={() => toggleCatalogVisibility(product.id, !!product.show_in_catalog)}
                      >
                        {product.show_in_catalog ? (
                          <Eye className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-slate-400" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/produtos/${product.id}`)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver no catálogo"
                          onClick={() => {
                            const productSlug = product.slug || product.id;
                            const url = company?.slug
                              ? `/catalogo/${company.slug}/produto/${productSlug}`
                              : `/catalogo/produto/${productSlug}`;
                            window.open(url, '_blank');
                          }}
                        >
                          <ExternalLink className="h-4 w-4 text-blue-500" />
                        </Button>
                        {product.owner_id === profile?.id && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(product.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import CSV Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={closeImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importar Produtos via CSV
            </DialogTitle>
            <DialogDescription>
              Importe múltiplos produtos de uma vez usando um arquivo CSV
            </DialogDescription>
          </DialogHeader>

          {importStep === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  Arraste um arquivo CSV ou clique para selecionar
                </p>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Selecionar Arquivo
                </Button>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Formato do arquivo CSV:</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  O arquivo deve usar ponto e vírgula (;) como separador e conter as seguintes colunas:
                </p>
                <code className="text-xs block bg-background p-2 rounded overflow-x-auto">
                  nome;sku;barcode;descricao;tipo;categoria;unidade;custo_base;custo_mao_obra;margem_lucro;estoque;estoque_minimo;ativo
                </code>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Modelo
                </Button>
              </DialogFooter>
            </div>
          )}

          {importStep === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {csvData.length} produtos encontrados no arquivo
                </p>
                <Button variant="ghost" size="sm" onClick={() => setImportStep('upload')}>
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              </div>

              <ScrollArea className="h-[300px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Código de barras</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Custo</TableHead>
                      <TableHead>Estoque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-muted-foreground">{row.sku || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{row.barcode || '-'}</TableCell>
                        <TableCell>{getTypeLabel(row.product_type)}</TableCell>
                        <TableCell>{formatCurrency(row.base_cost)}</TableCell>
                        <TableCell>{row.stock_quantity} {row.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <DialogFooter>
                <Button variant="outline" onClick={() => setImportStep('upload')}>
                  Voltar
                </Button>
                <Button onClick={processImport} disabled={importing}>
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Importar {csvData.length} Produtos
                </Button>
              </DialogFooter>
            </div>
          )}

          {importStep === 'results' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">{successCount} importados</span>
                </div>
                {errorCount > 0 && (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium">{errorCount} erros</span>
                  </div>
                )}
              </div>

              <ScrollArea className="h-[300px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Mensagem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResults.map((result, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-muted-foreground">{result.row}</TableCell>
                        <TableCell className="font-medium">{result.name}</TableCell>
                        <TableCell>
                          {result.status === 'success' ? (
                            <Badge variant="default" className="bg-green-600">Sucesso</Badge>
                          ) : (
                            <Badge variant="destructive">Erro</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{result.message || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <DialogFooter>
                <Button onClick={closeImportDialog}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
