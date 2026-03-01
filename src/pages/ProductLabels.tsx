import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Printer, Search, CheckSquare, XSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@/types/database';
import { resolveProductPrice } from '@/lib/pricing';
import { BarcodeSvg } from '@/components/BarcodeSvg';
import { buildBarcodeSvgMarkup, detectBarcodeFormat, normalizeBarcode } from '@/lib/barcode';
import { useAuth } from '@/contexts/AuthContext';

type LabelSize = {
  id: string;
  label: string;
  width: number;
  height: number;
};

const LABEL_SIZES: LabelSize[] = [
  { id: '33x22', label: '33 x 22 mm', width: 33, height: 22 },
  { id: '40x25', label: '40 x 25 mm', width: 40, height: 25 },
  { id: '50x30', label: '50 x 30 mm', width: 50, height: 30 },
];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getBarcodeSizing = (size: LabelSize) => {
  if (size.width >= 50) return { height: 40, moduleWidth: 1.5 };
  if (size.width >= 40) return { height: 34, moduleWidth: 1.3 };
  return { height: 28, moduleWidth: 1.1 };
};

export default function ProductLabels() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [labelSizeId, setLabelSizeId] = useState(LABEL_SIZES[1].id);
  const [showSku, setShowSku] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      let query = supabase.from('products').select('*').order('name');
      if (profile?.company_id) {
        query = query.eq('company_id', profile.company_id);
      }

      const { data, error } = await query;
      if (error) {
        toast({ title: 'Erro ao carregar produtos', variant: 'destructive' });
        setProducts([]);
        setLoading(false);
        return;
      }

      setProducts((data as Product[]) || []);
      setLoading(false);
    };

    void loadProducts();
  }, [profile?.company_id, toast]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(term) ||
      (product.sku || '').toLowerCase().includes(term) ||
      (product.barcode || '').toLowerCase().includes(term)
    );
  }, [products, search]);

  const labelSize = useMemo(
    () => LABEL_SIZES.find((size) => size.id === labelSizeId) ?? LABEL_SIZES[1],
    [labelSizeId]
  );

  const selectedProducts = useMemo(
    () => products.filter((product) => selected[product.id] !== undefined),
    [products, selected]
  );

  const labelItems = useMemo(
    () =>
      selectedProducts.flatMap((product) => {
        const quantity = Math.max(1, selected[product.id] || 1);
        return Array.from({ length: quantity }, () => product);
      }),
    [selectedProducts, selected]
  );

  const totalLabels = labelItems.length;
  const totalProducts = selectedProducts.length;
  const missingBarcodeCount = selectedProducts.filter((product) => !product.barcode).length;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const resolvePrice = (product: Product) => resolveProductPrice(product, 1, [], 0);

  const toggleProduct = (productId: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[productId]) {
        delete next[productId];
      } else {
        next[productId] = 1;
      }
      return next;
    });
  };

  const updateQuantity = (productId: string, value: number) => {
    const nextValue = Number.isFinite(value) ? Math.max(1, value) : 1;
    setSelected((prev) => ({ ...prev, [productId]: nextValue }));
  };

  const handleSelectAll = () => {
    setSelected((prev) => {
      const next = { ...prev };
      filteredProducts.forEach((product) => {
        if (!next[product.id]) next[product.id] = 1;
      });
      return next;
    });
  };

  const handleClear = () => setSelected({});

  const buildPrintHtml = () => {
    const { height: barcodeHeight, moduleWidth } = getBarcodeSizing(labelSize);

    const labelsHtml = labelItems
      .map((product) => {
        const barcodeValue = normalizeBarcode(product.barcode || '');
        const barcodeMarkup = barcodeValue
          ? buildBarcodeSvgMarkup({
              value: barcodeValue,
              format: detectBarcodeFormat(barcodeValue) ?? 'code128',
              height: barcodeHeight,
              moduleWidth,
            }) || ''
          : '';
        const hasSku = Boolean(showSku && product.sku);
        const skuLine = hasSku ? `SKU: ${escapeHtml(product.sku || '')}` : '&nbsp;';
        const barcodeText = barcodeValue
          ? `<div class="barcode-text">${escapeHtml(barcodeValue)}</div>`
          : '<div class="barcode-text missing">Sem codigo</div>';
        const price = formatCurrency(resolvePrice(product));

        return `
          <div class="label">
            <div class="label-grid">
              <div class="name">${escapeHtml(product.name)}</div>
              <div class="sku ${hasSku ? '' : 'sku-empty'}">${skuLine}</div>
              <div class="barcode">${barcodeMarkup || '<div class="barcode-empty">Sem codigo</div>'}</div>
              ${barcodeText}
              <div class="price-row">
                <span class="price">${price}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Etiquetas de Produtos</title>
          <style>
            @page { margin: 6mm; }
            body {
              margin: 0;
              padding: 6mm;
              font-family: "Segoe UI", Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
            }
            .sheet {
              display: grid;
              gap: 2.5mm;
              align-content: start;
              grid-template-columns: repeat(auto-fill, ${labelSize.width}mm);
            }
            .label {
              width: ${labelSize.width}mm;
              height: ${labelSize.height}mm;
              border: 0.2mm solid #cbd5e1;
              border-radius: 1.4mm;
              background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
              padding: 1.5mm;
              box-sizing: border-box;
              overflow: hidden;
            }
            .label-grid {
              display: grid;
              grid-template-rows: auto auto minmax(0, 1fr) auto auto;
              gap: 0.8mm;
              height: 100%;
              min-height: 0;
            }
            .name {
              font-size: 7.1pt;
              font-weight: 700;
              line-height: 1.12;
              overflow: hidden;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            }
            .sku {
              font-size: 6.4pt;
              color: #475569;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .sku-empty {
              visibility: hidden;
            }
            .barcode {
              min-height: 0;
              border: 0.2mm solid #e2e8f0;
              border-radius: 0.8mm;
              background: #f8fafc;
              padding: 0.5mm 0.7mm;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .barcode svg {
              width: 100%;
              max-height: 100%;
              height: auto;
              display: block;
            }
            .barcode-empty {
              font-size: 6.6pt;
              color: #94a3b8;
              text-align: center;
            }
            .barcode-text {
              font-size: 6pt;
              text-align: center;
              letter-spacing: 0.13em;
              color: #475569;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              text-transform: uppercase;
            }
            .barcode-text.missing {
              letter-spacing: normal;
            }
            .price-row {
              display: flex;
              justify-content: flex-end;
              min-height: 0;
            }
            .price {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              white-space: nowrap;
              font-size: 7.8pt;
              font-weight: 700;
              color: #ffffff;
              background: #0f172a;
              border: 0.2mm solid #0f172a;
              border-radius: 0.9mm;
              padding: 0.65mm 1.25mm;
              line-height: 1;
            }
            @media print {
              .label {
                border-style: solid;
                border-color: #e2e8f0;
              }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            ${labelsHtml}
          </div>
        </body>
      </html>
    `;
  };

  const openLabelWindow = (autoPrint: boolean) => {
    if (!labelItems.length) {
      toast({ title: 'Selecione ao menos um produto', variant: 'destructive' });
      return;
    }

    if (missingBarcodeCount > 0) {
      toast({
        title: 'Existem produtos sem codigo de barras',
        description: 'As etiquetas sem codigo exibirao aviso no lugar do codigo.',
        variant: 'destructive',
      });
    }

    const win = window.open('', '_blank');
    if (!win) {
      toast({ title: 'Nao foi possivel abrir a janela de impressao', variant: 'destructive' });
      return;
    }

    win.document.write(buildPrintHtml());
    win.document.close();
    win.focus();
    if (autoPrint) {
      win.onload = () => {
        win.print();
        win.close();
      };
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Etiquetas de produtos</h1>
          <p className="text-muted-foreground">
            Selecione produtos, defina quantidades e gere etiquetas prontas para impressao.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openLabelWindow(false)} disabled={!totalLabels}>
            <FileText className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
          <Button onClick={() => openLabelWindow(true)} disabled={!totalLabels}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Selecionar produtos</CardTitle>
              <CardDescription>Escolha os produtos que receberao etiquetas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, SKU ou codigo de barras..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleSelectAll}>
                    <CheckSquare className="mr-2 h-4 w-4" />
                    Selecionar tudo
                  </Button>
                  <Button variant="outline" onClick={handleClear}>
                    <XSquare className="mr-2 h-4 w-4" />
                    Limpar
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[420px] rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead className="text-right">Preco</TableHead>
                      <TableHead className="w-[110px] text-right">Qtd.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                          Carregando produtos...
                        </TableCell>
                      </TableRow>
                    ) : filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          Nenhum produto encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product) => {
                        const isChecked = selected[product.id] !== undefined;
                        const quantity = selected[product.id] || 1;
                        return (
                          <TableRow key={product.id}>
                            <TableCell>
                              <Checkbox checked={isChecked} onCheckedChange={() => toggleProduct(product.id)} />
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-1">
                                <span>{product.name}</span>
                                {!product.barcode && (
                                  <Badge variant="secondary" className="w-fit">
                                    Sem codigo
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{product.sku || '-'}</TableCell>
                            <TableCell className="text-muted-foreground">{product.barcode || '-'}</TableCell>
                            <TableCell className="text-right">{formatCurrency(resolvePrice(product))}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={1}
                                value={quantity}
                                onChange={(event) => updateQuantity(product.id, parseInt(event.target.value, 10) || 1)}
                                disabled={!isChecked}
                                className="h-9 w-[90px] text-right"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pre-visualizacao</CardTitle>
              <CardDescription>Confira o layout antes de imprimir.</CardDescription>
            </CardHeader>
            <CardContent>
              {totalLabels === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Selecione produtos para visualizar as etiquetas.
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 p-4" style={{ rowGap: '12px', columnGap: '12px' }}>
                  {labelItems.map((product, index) => {
                    const barcodeValue = normalizeBarcode(product.barcode || '');
                    const { height, moduleWidth } = getBarcodeSizing(labelSize);
                    const hasSku = Boolean(showSku && product.sku);

                    return (
                      <div
                        key={`${product.id}-${index}`}
                        className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm"
                        style={{ width: `${labelSize.width}mm`, height: `${labelSize.height}mm` }}
                      >
                        <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-1.5 p-2">
                          <div className="overflow-hidden text-[10px] font-semibold leading-tight [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                            {product.name}
                          </div>

                          <div className={`truncate text-[8px] text-slate-500 ${hasSku ? '' : 'invisible'}`}>
                            {hasSku ? `SKU: ${product.sku}` : 'SKU'}
                          </div>

                          <div className="min-h-0 overflow-hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
                            <div className="flex h-full items-center justify-center overflow-hidden">
                              {barcodeValue ? (
                                <BarcodeSvg
                                  value={barcodeValue}
                                  format={detectBarcodeFormat(barcodeValue) ?? 'code128'}
                                  height={height}
                                  moduleWidth={moduleWidth}
                                  className="block w-full max-w-full [&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-h-full"
                                />
                              ) : (
                                <div className="text-[8px] text-slate-400">Sem codigo</div>
                              )}
                            </div>
                          </div>

                          <div className="truncate text-center text-[7px] uppercase tracking-[0.16em] text-slate-500">
                            {barcodeValue || 'SEM CODIGO'}
                          </div>

                          <div className="flex justify-end">
                            <div className="inline-flex items-center rounded border border-slate-900 bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                              {formatCurrency(resolvePrice(product))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuracoes</CardTitle>
              <CardDescription>Defina tamanho e conteudo das etiquetas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <span className="text-sm font-medium">Formato</span>
                <Select value={labelSizeId} onValueChange={setLabelSizeId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LABEL_SIZES.map((size) => (
                      <SelectItem key={size.id} value={size.id}>
                        {size.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-1">
                  <span className="text-sm font-medium">Exibir SKU</span>
                  <p className="text-xs text-muted-foreground">Mostra o codigo interno nas etiquetas.</p>
                </div>
                <Switch checked={showSku} onCheckedChange={setShowSku} />
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Produtos selecionados</span>
                  <span className="font-semibold">{totalProducts}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Total de etiquetas</span>
                  <span className="font-semibold">{totalLabels}</span>
                </div>
                {missingBarcodeCount > 0 && (
                  <div className="mt-2 text-xs text-destructive">
                    {missingBarcodeCount} produto(s) sem codigo de barras.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
