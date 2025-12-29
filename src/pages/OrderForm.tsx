import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Customer, Product, Attribute, AttributeValue, PriceTier, OrderStatus, PaymentMethod } from '@/types/database';
import { ArrowLeft, Plus, Trash2, Save, Loader2, Search, User, ShoppingBag, Package } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { resolveSuggestedPrice } from '@/lib/pricing';

interface OrderItemForm {
  product: Product;
  quantity: number;
  unit_price: number;
  discount: number;
  attributes: Record<string, string>;
  notes: string;
}

export default function OrderForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);
  const [productAttributes, setProductAttributes] = useState<Record<string, string[]>>({});
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [suppliesCostMap, setSuppliesCostMap] = useState<Record<string, number>>({});

  // Form state
  const [customerId, setCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<OrderItemForm[]>([]);

  // Product selection dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [productDiscount, setProductDiscount] = useState(0);
  const [productNotes, setProductNotes] = useState('');
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});

  // Customer search
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [custResult, prodResult, attrResult, attrValResult, prodAttrResult, tiersResult, suppliesResult] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('attributes').select('*').order('name'),
      supabase.from('attribute_values').select('*').order('value'),
      supabase.from('product_attributes').select('product_id, attribute_value_id'),
      supabase.from('price_tiers').select('*').order('min_quantity'),
      supabase.from('product_supplies').select('product_id, quantity, supply:supplies(cost_per_unit)'),
    ]);

    setCustomers(custResult.data as Customer[] || []);
    setProducts(prodResult.data as Product[] || []);
    setAttributes(attrResult.data as Attribute[] || []);
    setAttributeValues(attrValResult.data as AttributeValue[] || []);
    setPriceTiers(tiersResult.data as PriceTier[] || []);

    // Map product attributes
    const prodAttrMap: Record<string, string[]> = {};
    (prodAttrResult.data || []).forEach((pa: any) => {
      if (!prodAttrMap[pa.product_id]) prodAttrMap[pa.product_id] = [];
      prodAttrMap[pa.product_id].push(pa.attribute_value_id);
    });
    setProductAttributes(prodAttrMap);

    const suppliesCostByProduct: Record<string, number> = {};
    (suppliesResult.data || []).forEach((ps: any) => {
      const productId = ps.product_id as string;
      const costPerUnit = Number(ps.supply?.cost_per_unit ?? 0);
      const quantity = Number(ps.quantity ?? 0);
      suppliesCostByProduct[productId] = (suppliesCostByProduct[productId] || 0) + costPerUnit * quantity;
    });
    setSuppliesCostMap(suppliesCostByProduct);

    setLoading(false);
  };

  // Calculate price based on quantity and price tiers
  const getProductPrice = (product: Product, quantity: number): number => {
    const suppliesCost = suppliesCostMap[product.id] || 0;
    return resolveSuggestedPrice(product, quantity, priceTiers, suppliesCost);
  };

  // Get available attributes for a product
  const getProductAvailableAttributes = (productId: string) => {
    const attrValueIds = productAttributes[productId] || [];
    const availableValues = attributeValues.filter(v => attrValueIds.includes(v.id));
    
    const grouped: Record<string, { attribute: Attribute; values: AttributeValue[] }> = {};
    
    availableValues.forEach(val => {
      const attr = attributes.find(a => a.id === val.attribute_id);
      if (attr) {
        if (!grouped[attr.id]) {
          grouped[attr.id] = { attribute: attr, values: [] };
        }
        grouped[attr.id].values.push(val);
      }
    });
    
    return Object.values(grouped);
  };

  const formatCurrency = (v: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // Customer selection
  const handleSelectCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerSearchOpen(false);
  };

  const clearCustomer = () => {
    setCustomerId('');
    setCustomerName('');
  };

  // Open product dialog
  const openProductDialog = (product: Product) => {
    setSelectedProduct(product);
    setProductQuantity(1);
    setProductDiscount(0);
    setProductNotes('');
    setSelectedAttributes({});
    setProductDialogOpen(true);
  };

  // Add product to order
  const addProductToOrder = () => {
    if (!selectedProduct) return;

    const unitPrice = getProductPrice(selectedProduct, productQuantity);
    
    setItems([...items, {
      product: selectedProduct,
      quantity: productQuantity,
      unit_price: unitPrice,
      discount: productDiscount,
      attributes: selectedAttributes,
      notes: productNotes,
    }]);

    setProductDialogOpen(false);
    setSelectedProduct(null);
  };

  // Remove item from order
  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Update item quantity
  const updateItemQuantity = (index: number, quantity: number) => {
    const updated = [...items];
    updated[index].quantity = quantity;
    updated[index].unit_price = getProductPrice(updated[index].product, quantity);
    setItems(updated);
  };

  // Calculations
  const subtotal = items.reduce((acc, item) => 
    acc + (item.unit_price * item.quantity - item.discount), 0
  );
  const total = subtotal - discount;

  // Submit order
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      toast({ title: 'Adicione pelo menos um produto', variant: 'destructive' });
      return;
    }

    setSaving(true);

    // Create order
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        company_id: profile?.company_id || null,
        customer_id: customerId || null,
        customer_name: customerName || null,
        status: 'orcamento' as OrderStatus,
        subtotal,
        discount,
        total,
        notes,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error || !order) {
      toast({ title: 'Erro ao criar pedido', description: error?.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Insert order items
    const orderItems = items.map(item => ({
      order_id: order.id,
      product_id: item.product.id,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      total: item.unit_price * item.quantity - item.discount,
      attributes: item.attributes,
      notes: item.notes || null,
    }));

    await supabase.from('order_items').insert(orderItems);

    // Insert initial status history
    await supabase.from('order_status_history').insert({
      order_id: order.id,
      status: 'orcamento',
      user_id: user?.id,
      notes: 'Pedido criado',
    });

    toast({ title: 'Pedido criado com sucesso!' });
    navigate('/pedidos');
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.document?.includes(customerSearch) ||
    c.phone?.includes(customerSearch)
  );

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-container w-full max-w-none">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/pedidos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="page-title">Novo Pedido / Orçamento</h1>
            <p className="text-muted-foreground">Crie um novo pedido ou orçamento</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customerId ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">{customerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {customers.find(c => c.id === customerId)?.phone || 'Sem telefone'}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={clearCustomer}>
                  Trocar Cliente
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start">
                      <Search className="mr-2 h-4 w-4" />
                      Buscar cliente cadastrado
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Buscar por nome, CPF ou telefone..." 
                        value={customerSearch}
                        onValueChange={setCustomerSearch}
                      />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
                        <CommandGroup>
                          {filteredCustomers.slice(0, 10).map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={customer.id}
                              onSelect={() => handleSelectCustomer(customer)}
                            >
                              <div>
                                <p className="font-medium">{customer.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {customer.document || customer.phone || 'Sem dados'}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                <div className="space-y-2">
                  <Label>Ou digite o nome do cliente</Label>
                  <Input
                    placeholder="Nome do cliente (opcional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Products */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                Produtos e Serviços
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Product Search */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {products.slice(0, 8).map((product) => (
                <Button
                  key={product.id}
                  type="button"
                  variant="outline"
                  className="h-auto py-3 flex-col items-start text-left"
                  onClick={() => openProductDialog(product)}
                >
                  <span className="font-medium text-sm truncate w-full">{product.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(getProductPrice(product, 1))}
                  </span>
                </Button>
              ))}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full">
                  <Search className="mr-2 h-4 w-4" />
                  Buscar mais produtos...
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar produto..." />
                  <CommandList>
                    <CommandEmpty>Nenhum produto encontrado</CommandEmpty>
                    <CommandGroup>
                      {products.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={product.name}
                          onSelect={() => openProductDialog(product)}
                        >
                          <Package className="mr-2 h-4 w-4" />
                          <div className="flex-1">
                            <p>{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(getProductPrice(product, 1))}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Separator />

            {/* Order Items */}
            {items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="w-24">Qtd</TableHead>
                    <TableHead className="text-right">Preço Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.product.name}</p>
                          {Object.keys(item.attributes).length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {Object.entries(item.attributes).map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs">
                                  {value}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {item.notes && (
                            <p className="text-xs text-muted-foreground mt-1">Obs: {item.notes}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.unit_price * item.quantity - item.discount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingBag className="mx-auto h-12 w-12 opacity-30 mb-2" />
                <p>Nenhum produto adicionado</p>
                <p className="text-sm">Clique em um produto acima para adicionar</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Totals and Notes */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Observações gerais do pedido..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal ({items.length} itens)</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Desconto</span>
                  <CurrencyInput
                    value={discount}
                    onChange={setDiscount}
                    className="w-28"
                  />
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </div>

              <div className="pt-2">
                <Badge variant="outline" className="text-sm">
                  Status: Orçamento
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  O pedido será criado como orçamento. Você pode alterar o status depois.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/pedidos')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || items.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Criar Pedido
          </Button>
        </div>
      </form>

      {/* Product Configuration Dialog */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Produto</DialogTitle>
          </DialogHeader>
          
          {selectedProduct && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{selectedProduct.name}</p>
                <p className="text-sm text-muted-foreground">
                  Preço sugerido: {formatCurrency(getProductPrice(selectedProduct, 1))}
                </p>
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min="1"
                  value={productQuantity}
                  onChange={(e) => setProductQuantity(parseInt(e.target.value) || 1)}
                />
                <p className="text-xs text-muted-foreground">
                  Preço unitário: {formatCurrency(getProductPrice(selectedProduct, productQuantity))}
                </p>
              </div>

              {/* Attributes */}
              {getProductAvailableAttributes(selectedProduct.id).map(({ attribute, values }) => (
                <div key={attribute.id} className="space-y-2">
                  <Label>{attribute.name}</Label>
                  <Select
                    value={selectedAttributes[attribute.name] || ''}
                    onValueChange={(v) => setSelectedAttributes({ ...selectedAttributes, [attribute.name]: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Selecione ${attribute.name.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {values.map((val) => (
                        <SelectItem key={val.id} value={val.value}>
                          {val.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              {/* Discount */}
              <div className="space-y-2">
                <Label>Desconto no item (R$)</Label>
                <CurrencyInput
                  value={productDiscount}
                  onChange={setProductDiscount}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Observações do item</Label>
                <Textarea
                  placeholder="Especificações, detalhes..."
                  value={productNotes}
                  onChange={(e) => setProductNotes(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Total */}
              <div className="p-3 bg-primary/10 rounded-lg">
                <div className="flex justify-between font-medium">
                  <span>Total do item</span>
                  <span>
                    {formatCurrency(getProductPrice(selectedProduct, productQuantity) * productQuantity - productDiscount)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={addProductToOrder}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


