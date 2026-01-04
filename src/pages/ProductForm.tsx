import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Category, Supply, Attribute, AttributeValue, ProductType } from '@/types/database';
import { ArrowLeft, Plus, Trash2, Calculator, Save, Loader2, Upload, Image, Globe, Package, FolderPlus, Tag } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { generateProductDescription } from '@/services/ai';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ensurePublicStorageUrl, getStoragePathFromUrl } from '@/lib/storage';

const productSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
  sku: z.string().max(50).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  product_type: z.enum(['produto', 'confeccionado', 'servico']),
  category_id: z.string().uuid().optional().nullable(),
  unit: z.string().min(1, 'Unidade é obrigatória').max(10),
  is_active: z.boolean(),
  base_cost: z.number().min(0, 'Custo base deve ser positivo'),
  labor_cost: z.number().min(0, 'Custo de mão de obra deve ser positivo'),
  waste_percentage: z.number().min(0).max(100, 'Desperdício deve ser entre 0 e 100%'),
  profit_margin: z.number().min(0).max(1000, 'Margem deve ser entre 0 e 1000%'),
  final_price: z.number().min(0, 'Preço final deve ser positivo'),
  stock_quantity: z.number().min(0),
  min_stock: z.number().min(0),
  min_order_quantity: z.number().int().min(1, 'Quantidade minima deve ser pelo menos 1'),
  track_stock: z.boolean(),
  promo_price: z.number().min(0, 'Preço promocional deve ser positivo').optional().nullable(),
  promo_start_at: z.string().optional().nullable(),
  promo_end_at: z.string().optional().nullable(),
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface ProductSupplyItem {
  supply_id: string;
  supply?: Supply;
  quantity: number;
}

interface PriceTierItem {
  min_quantity: number;
  max_quantity: number | null;
  price: number;
}

interface ProductAttributeItem {
  attribute_id: string;
  attribute_name: string;
  values: { id: string; value: string; selected: boolean; price_modifier: number }[];
}

export default function ProductForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id && id !== 'novo';
  const { toast } = useToast();
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [skuChecking, setSkuChecking] = useState(false);

  // Form data
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [productSlug, setProductSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [productType, setProductType] = useState<ProductType>('produto');
  const [categoryId, setCategoryId] = useState<string>('');
  const [unit, setUnit] = useState('un');
  const [isActive, setIsActive] = useState(true);
  const [showInCatalog, setShowInCatalog] = useState(false);
  const [catalogFeatured, setCatalogFeatured] = useState(false);
  const [catalogPrice, setCatalogPrice] = useState<number | null>(null);
  const [catalogShortDescription, setCatalogShortDescription] = useState('');
  const [catalogLongDescription, setCatalogLongDescription] = useState('');
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [baseCost, setBaseCost] = useState(0);
  const [laborCost, setLaborCost] = useState(0);
  const [wastePercentage, setWastePercentage] = useState(0);
  const [profitMargin, setProfitMargin] = useState(30);
  const [finalPrice, setFinalPrice] = useState(0);
  const [finalPriceTouched, setFinalPriceTouched] = useState(false);
  const [stockQuantity, setStockQuantity] = useState(0);
  const [minStock, setMinStock] = useState(0);
  const [minOrderQuantity, setMinOrderQuantity] = useState(1);
  const [trackStock, setTrackStock] = useState(true);
  const [promoPrice, setPromoPrice] = useState<number | null>(null);
  const [promoStartAt, setPromoStartAt] = useState<string>('');
  const [promoEndAt, setPromoEndAt] = useState<string>('');

  // Related data
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);

  // Category dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState<string>('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Product composition
  const [productSupplies, setProductSupplies] = useState<ProductSupplyItem[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTierItem[]>([]);
  const [productAttributes, setProductAttributes] = useState<ProductAttributeItem[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>();

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categories]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    categories.forEach((category) => {
      const key = category.parent_id ?? null;
      const bucket = map.get(key) ?? [];
      bucket.push(category);
      map.set(key, bucket);
    });

    map.forEach((list) => {
      list.sort((a, b) => a.name.localeCompare(b.name));
    });

    return map;
  }, [categories]);

  const categoryOptions = useMemo(() => {
    const flattened: Array<{ id: string; name: string; level: number }> = [];

    const walk = (items: Category[], level: number) => {
      items.forEach((item) => {
        flattened.push({ id: item.id, name: item.name, level });
        const children = childrenByParent.get(item.id) ?? [];
        if (children.length > 0) {
          walk(children, level + 1);
        }
      });
    };

    const roots = categories.filter(
      (category) => !category.parent_id || !categoryMap.has(category.parent_id)
    );
    roots.sort((a, b) => a.name.localeCompare(b.name));
    walk(roots, 0);

    return flattened;
  }, [categories, categoryMap, childrenByParent]);

  const rootCategoryOptions = useMemo(() => {
    return categories
      .filter((category) => !category.parent_id || !categoryMap.has(category.parent_id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, categoryMap]);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    const [catResult, supResult, attrResult, attrValResult] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('supplies').select('*').order('name'),
      supabase.from('attributes').select('*').order('name'),
      supabase.from('attribute_values').select('*, attribute:attributes(name)').order('value'),
    ]);

    setCategories(catResult.data as Category[] || []);
    const mappedSupplies = (supResult.data as Supply[] || []).map((supply) => ({
      ...supply,
      image_url: ensurePublicStorageUrl('product-images', supply.image_url),
    }));
    setSupplies(mappedSupplies);
    setAttributes(attrResult.data as Attribute[] || []);
    setAttributeValues(attrValResult.data as AttributeValue[] || []);

    // Initialize product attributes structure
    const attrs = attrResult.data as Attribute[] || [];
    const attrVals = attrValResult.data as AttributeValue[] || [];

    let productAttrSelection: ProductAttributeItem[] = attrs.map(attr => ({
      attribute_id: attr.id,
      attribute_name: attr.name,
      values: attrVals
        .filter(v => v.attribute_id === attr.id)
        .map(v => ({ id: v.id, value: v.value, selected: false, price_modifier: 0 }))
    }));

    // If editing, load product data
    if (isEditing && id) {
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !product) {
        toast({ title: 'Produto não encontrado', variant: 'destructive' });
        navigate('/produtos');
        return;
      }

      // Set form data
      setName(product.name);
      setProductSlug(product.slug || generateSlug(product.name));
      setSlugTouched(false);
      setSku(product.sku || '');
      setDescription(product.description || '');
      setProductType(product.product_type as ProductType);
      setCategoryId(product.category_id || '');
      setUnit(product.unit);
      setIsActive(product.is_active);
      setShowInCatalog(product.catalog_enabled ?? product.show_in_catalog ?? false);
      setCatalogFeatured(product.catalog_featured ?? false);
      setCatalogPrice(product.catalog_price !== null && product.catalog_price !== undefined ? Number(product.catalog_price) : null);
      setCatalogShortDescription(product.catalog_short_description || '');
      setCatalogLongDescription(product.catalog_long_description || '');
      setImageUrl(ensurePublicStorageUrl('product-images', product.image_url));
      setBaseCost(Number(product.base_cost));
      setLaborCost(Number(product.labor_cost));
      setWastePercentage(Number(product.waste_percentage));
      setProfitMargin(Number(product.profit_margin));
      if (product.final_price !== null && product.final_price !== undefined) {
        setFinalPrice(Number(product.final_price));
        setFinalPriceTouched(true);
      } else {
        setFinalPrice(0);
        setFinalPriceTouched(false);
      }
      setStockQuantity(Number(product.stock_quantity));
      setMinStock(Number(product.min_stock));
      setMinOrderQuantity(Number(product.catalog_min_order ?? product.min_order_quantity ?? 1));
      setTrackStock(product.track_stock ?? true);
      setPromoPrice(product.promo_price !== null ? Number(product.promo_price) : null);
      setPromoStartAt(product.promo_start_at ? new Date(product.promo_start_at).toISOString().slice(0, 16) : '');
      setPromoEndAt(product.promo_end_at ? new Date(product.promo_end_at).toISOString().slice(0, 16) : '');

      // Load product supplies
      const { data: prodSupplies } = await supabase
        .from('product_supplies')
        .select('*, supply:supplies(*)')
        .eq('product_id', id);

      if (prodSupplies) {
        setProductSupplies(prodSupplies.map(ps => ({
          supply_id: ps.supply_id,
          supply: ps.supply as Supply,
          quantity: Number(ps.quantity),
        })));
      }

      // Load price tiers
      const { data: tiers } = await supabase
        .from('price_tiers')
        .select('*')
        .eq('product_id', id)
        .order('min_quantity');

      if (tiers) {
        setPriceTiers(tiers.map(t => ({
          min_quantity: t.min_quantity,
          max_quantity: t.max_quantity,
          price: Number(t.price),
        })));
      }

      // Load product attributes
      const { data: prodAttrs } = await supabase
        .from('product_attributes')
        .select('*')
        .eq('product_id', id);

      if (prodAttrs) {
        productAttrSelection = productAttrSelection.map(pa => ({
          ...pa,
          values: pa.values.map(v => {
            const existing = prodAttrs.find(pa => pa.attribute_value_id === v.id);
            return {
              ...v,
              selected: !!existing,
              price_modifier: existing ? Number(existing.price_modifier) : 0,
            };
          }),
        }));
      }
    }

    setProductAttributes(productAttrSelection);
    setLoading(false);
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Selecione uma imagem válida', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Imagem deve ter no máximo 5MB', variant: 'destructive' });
      return;
    }

    setUploadingImage(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file);

    if (uploadError) {
      toast({ title: 'Erro ao enviar imagem', variant: 'destructive' });
      setUploadingImage(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    const normalizedUrl = ensurePublicStorageUrl('product-images', publicUrl);
    setImageUrl(normalizedUrl);
    setUploadingImage(false);
    toast({ title: 'Imagem enviada com sucesso!' });
  };

  const removeImage = async () => {
    if (imageUrl) {
      const path = getStoragePathFromUrl('product-images', imageUrl);
      if (path) {
        await supabase.storage.from('product-images').remove([path]);
      }
    }
    setImageUrl(null);
  };

  // Calculate costs
  const suppliesCost = productSupplies.reduce((acc, ps) => {
    const supply = supplies.find(s => s.id === ps.supply_id);
    return acc + (supply ? Number(supply.cost_per_unit) * ps.quantity : 0);
  }, 0);

  const totalCost = baseCost + suppliesCost + laborCost;
  const costWithWaste = totalCost * (1 + wastePercentage / 100);
  const suggestedPrice = costWithWaste * (1 + profitMargin / 100);
  const minPrice = costWithWaste * 1.1; // 10% margin minimum
  const defaultUnitPrice = finalPriceTouched ? finalPrice : suggestedPrice;
  const defaultPriceLabel = finalPriceTouched ? 'preço final' : 'preço sugerido';

  useEffect(() => {
    if (!finalPriceTouched) {
      setFinalPrice(suggestedPrice);
    }
  }, [finalPriceTouched, suggestedPrice]);

  // Supplies management
  const addSupply = () => {
    setProductSupplies([...productSupplies, { supply_id: '', quantity: 1 }]);
  };

  const updateSupply = (index: number, field: 'supply_id' | 'quantity', value: string | number) => {
    const updated = [...productSupplies];
    if (field === 'supply_id') {
      updated[index].supply_id = value as string;
      updated[index].supply = supplies.find(s => s.id === value);
    } else {
      updated[index].quantity = Number(value);
    }
    setProductSupplies(updated);
  };

  const removeSupply = (index: number) => {
    setProductSupplies(productSupplies.filter((_, i) => i !== index));
  };

  // Price tiers management
  const addPriceTier = () => {
    const lastTier = priceTiers[priceTiers.length - 1];
    const minQty = lastTier ? (lastTier.max_quantity || lastTier.min_quantity) + 1 : 1;
    setPriceTiers([
      ...priceTiers,
      { min_quantity: minQty, max_quantity: null, price: defaultUnitPrice },
    ]);
  };

  const updatePriceTier = (index: number, field: keyof PriceTierItem, value: number | null) => {
    const updated = [...priceTiers];
    (updated[index] as any)[field] = value;
    setPriceTiers(updated);
  };

  const removePriceTier = (index: number) => {
    setPriceTiers(priceTiers.filter((_, i) => i !== index));
  };

  const handleGenerateDescription = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: 'Informe o nome do produto antes', variant: 'destructive' });
      return;
    }

    setGeneratingDescription(true);
    try {
      const resp = await generateProductDescription(trimmedName);
      setCatalogShortDescription(resp.short_description || '');
      setCatalogLongDescription(resp.long_description || '');
      if (!description.trim()) {
        setDescription(resp.long_description || '');
      }
      toast({ title: 'Descrição gerada com sucesso' });
    } catch (error: any) {
      toast({ title: 'Erro ao gerar descrição', description: error?.message, variant: 'destructive' });
    } finally {
      setGeneratingDescription(false);
    }
  };

  // Attribute selection
  const toggleAttributeValue = (attrIndex: number, valueIndex: number) => {
    const updated = [...productAttributes];
    updated[attrIndex].values[valueIndex].selected = !updated[attrIndex].values[valueIndex].selected;
    setProductAttributes(updated);
  };

  const updateAttributeModifier = (attrIndex: number, valueIndex: number, modifier: number) => {
    const updated = [...productAttributes];
    updated[attrIndex].values[valueIndex].price_modifier = modifier;
    setProductAttributes(updated);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const normalizeSku = (value: string) => value.trim().toUpperCase();

  const clearSkuError = () => {
    setErrors((prev) => {
      if (!prev?.sku) return prev;
      const next = { ...prev };
      delete next.sku;
      return Object.keys(next).length ? next : undefined;
    });
  };

  const checkSkuAvailability = async (value: string) => {
    if (!value) return true;
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('sku', value)
      .maybeSingle();

    if (error) {
      toast({ title: 'Erro ao validar SKU', description: error.message, variant: 'destructive' });
      return false;
    }
    if (!data) return true;
    if (isEditing && data.id === id) return true;
    return false;
  };

  const handleGenerateSku = async () => {
    setSkuChecking(true);
    const year = new Date().getFullYear();
    const cleanedName = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const prefixFromName = cleanedName.slice(0, 3);
    const typePrefix = productType === 'confeccionado' ? 'CNF' : productType === 'servico' ? 'SRV' : 'PRD';
    const prefix = prefixFromName.length === 3 ? prefixFromName : typePrefix;

    for (let attempt = 0; attempt < 6; attempt++) {
      const sequence = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const candidate = `${prefix}-${year}-${sequence}`;
      const isAvailable = await checkSkuAvailability(candidate);
      if (isAvailable) {
        setSku(candidate);
        clearSkuError();
        setSkuChecking(false);
        return;
      }
    }

    toast({ title: 'Não foi possível gerar um SKU único', variant: 'destructive' });
    setSkuChecking(false);
  };

  const saveCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: 'Nome da categoria é obrigatório', variant: 'destructive' });
      return;
    }

    setSavingCategory(true);
    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: newCategoryName.trim(),
        parent_id: newCategoryParentId || null,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Erro ao salvar categoria', variant: 'destructive' });
      setSavingCategory(false);
      return;
    }

    // Update categories list and select the new category
    setCategories([...categories, data as Category]);
    setCategoryId(data.id);
    setNewCategoryName('');
    setNewCategoryParentId('');
    setCategoryDialogOpen(false);
    setSavingCategory(false);
    toast({ title: 'Categoria criada com sucesso!' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const normalizedSku = normalizeSku(sku);

    const normalizedSlug = generateSlug((slugTouched ? productSlug : name).trim() || name.trim());
    const formData = {
      name: name.trim(),
      sku: normalizedSku || null,
      description: description.trim() || null,
      slug: normalizedSlug || null,
      product_type: productType,
      category_id: categoryId || null,
      company_id: profile?.company_id || null,
      image_url: imageUrl,
      show_in_catalog: showInCatalog,
      catalog_enabled: showInCatalog,
      catalog_featured: catalogFeatured,
      catalog_price: catalogPrice ?? null,
      catalog_short_description: catalogShortDescription.trim() || null,
      catalog_long_description: catalogLongDescription.trim() || null,
      catalog_min_order: minOrderQuantity,
      unit,
      is_active: isActive,
      base_cost: baseCost,
      labor_cost: laborCost,
      waste_percentage: wastePercentage,
      profit_margin: profitMargin,
      final_price: finalPrice,
      stock_quantity: stockQuantity,
      min_stock: minStock,
      min_order_quantity: minOrderQuantity,
      track_stock: trackStock,
      promo_price: promoPrice,
      promo_start_at: promoStartAt ? new Date(promoStartAt).toISOString() : null,
      promo_end_at: promoEndAt ? new Date(promoEndAt).toISOString() : null,
    };

    const validation = productSchema.safeParse(formData);
    if (!validation.success) {
      const errs: Record<string, string> = {};
      validation.error.errors.forEach(e => {
        errs[e.path[0] as string] = e.message;
      });
      setErrors(errs);
      toast({ title: 'Verifique os campos obrigatórios', variant: 'destructive' });
      return;
    }

    setSaving(true);

    if (normalizedSku) {
      const isAvailable = await checkSkuAvailability(normalizedSku);
      if (!isAvailable) {
        setErrors((prev) => ({ ...(prev || {}), sku: 'SKU já está em uso' }));
        toast({ title: 'SKU já está em uso', variant: 'destructive' });
        setSaving(false);
        return;
      }
    }

    let productId = id;

    if (isEditing && id) {
      // Update product
      const { error } = await supabase
        .from('products')
        .update(formData)
        .eq('id', id);

      if (error) {
        if (error.code === '23505') {
          setErrors((prev) => ({ ...(prev || {}), sku: 'SKU já está em uso' }));
        }
        toast({ title: 'Erro ao atualizar produto', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }

      // Delete existing related data to re-insert
      await Promise.all([
        supabase.from('product_supplies').delete().eq('product_id', id),
        supabase.from('price_tiers').delete().eq('product_id', id),
        supabase.from('product_attributes').delete().eq('product_id', id),
      ]);
    } else {
      // Insert product
      const { data: product, error } = await supabase
        .from('products')
        .insert(formData)
        .select()
        .single();

      if (error || !product) {
        if (error?.code === '23505') {
          setErrors((prev) => ({ ...(prev || {}), sku: 'SKU já está em uso' }));
        }
        toast({ title: 'Erro ao salvar produto', description: error?.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      productId = product.id;
    }

    // Insert product supplies
    if (productSupplies.length > 0) {
      const suppliesData = productSupplies
        .filter(ps => ps.supply_id)
        .map(ps => ({
          product_id: productId,
          supply_id: ps.supply_id,
          quantity: ps.quantity,
        }));

      if (suppliesData.length > 0) {
        await supabase.from('product_supplies').insert(suppliesData);
      }
    }

    // Insert price tiers
    if (priceTiers.length > 0) {
      const tiersData = priceTiers.map(pt => ({
        product_id: productId,
        min_quantity: pt.min_quantity,
        max_quantity: pt.max_quantity,
        price: pt.price,
      }));
      await supabase.from('price_tiers').insert(tiersData);
    }

    // Insert product attributes
    const selectedAttrs = productAttributes.flatMap(pa =>
      pa.values.filter(v => v.selected).map(v => ({
        product_id: productId,
        attribute_value_id: v.id,
        price_modifier: v.price_modifier,
      }))
    );

    if (selectedAttrs.length > 0) {
      await supabase.from('product_attributes').insert(selectedAttrs);
    }

    toast({ title: isEditing ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!' });
    navigate('/produtos');
  };

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
          <Button variant="ghost" size="icon" onClick={() => navigate('/produtos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="page-title">{isEditing ? 'Editar Produto' : 'Novo Produto'}</h1>
            <p className="text-muted-foreground">
              {isEditing ? 'Atualize os dados do produto' : 'Cadastre um novo produto com preços e atributos'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Controlar estoque</Label>
                <p className="text-xs text-muted-foreground">
                  Ative para controlar quantidade e alertas de estoque.
                </p>
              </div>
              <Switch checked={trackStock} onCheckedChange={setTrackStock} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  const value = e.target.value;
                  setName(value);
                  if (!slugTouched) {
                    setProductSlug(generateSlug(value));
                  }
                }}
                placeholder="Nome do produto"
                className={errors?.name ? 'border-destructive' : ''}
              />
              {errors?.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">SKU / Código</Label>
              <div className="flex gap-2">
                <Input
                  id="sku"
                  value={sku}
                  onChange={(e) => {
                    setSku(e.target.value.toUpperCase());
                    clearSkuError();
                  }}
                  placeholder="Código interno"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateSku}
                  disabled={skuChecking}
                  className="shrink-0"
                >
                  {skuChecking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Gerar SKU'
                  )}
                </Button>
              </div>
              {errors?.sku && <p className="text-xs text-destructive">{errors.sku}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Tipo *</Label>
              <Select value={productType} onValueChange={(v) => setProductType(v as ProductType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="produto">Produto (Revenda)</SelectItem>
                  <SelectItem value="confeccionado">Confeccionado (Produção)</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="category">Categoria</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setCategoryDialogOpen(true)}
                >
                  <FolderPlus className="h-3 w-3 mr-1" />
                  Nova
                </Button>
              </div>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <span style={{ paddingLeft: option.level * 12 }}>{option.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unidade *</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="un">Unidade (un)</SelectItem>
                  <SelectItem value="m">Metro (m)</SelectItem>
                  <SelectItem value="m²">Metro² (m²)</SelectItem>
                  <SelectItem value="kg">Quilograma (kg)</SelectItem>
                  <SelectItem value="cx">Caixa (cx)</SelectItem>
                  <SelectItem value="pct">Pacote (pct)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minOrderQuantity">Quantidade minima para pedido</Label>
              <Input
                id="minOrderQuantity"
                type="number"
                min="1"
                step="1"
                value={minOrderQuantity}
                onChange={(e) =>
                  setMinOrderQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className={errors?.min_order_quantity ? 'border-destructive' : ''}
              />
              {errors?.min_order_quantity && (
                <p className="text-xs text-destructive">{errors.min_order_quantity}</p>
              )}
            </div>


            <div className="flex items-center gap-3 pt-6">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Produto ativo</Label>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <Switch checked={showInCatalog} onCheckedChange={setShowInCatalog} />
              <Label className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Exibir no catálogo público
              </Label>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Switch checked={catalogFeatured} onCheckedChange={setCatalogFeatured} />
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Destacar no catálogo
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalogPrice">Preço para catálogo</Label>
              <CurrencyInput
                id="catalogPrice"
                value={catalogPrice ?? 0}
                onChange={(value) => setCatalogPrice(value)}
              />
              <p className="text-xs text-muted-foreground">Deixe em branco para usar o preço padrão.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="productSlug">Slug do produto</Label>
              <Input
                id="productSlug"
                value={productSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setProductSlug(generateSlug(e.target.value));
                }}
                placeholder="slug-do-produto"
              />
              <p className="text-xs text-muted-foreground">/catalogo/produto/{productSlug || 'slug-do-produto'}</p>
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDescription}
                  disabled={generatingDescription}
                >
                  {generatingDescription ? 'Gerando...' : 'Gerar descrição com IA'}
                </Button>
              </div>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição do produto..."
                rows={3}
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="catalogShortDescription">Descrição curta (catálogo)</Label>
              <Textarea
                id="catalogShortDescription"
                value={catalogShortDescription}
                onChange={(e) => setCatalogShortDescription(e.target.value)}
                placeholder="Resumo curto para o catálogo (até 140 caracteres)"
                rows={2}
                maxLength={140}
              />
              <p className="text-xs text-muted-foreground">
                {catalogShortDescription.length}/140 caracteres
              </p>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="catalogLongDescription">Descrição longa (catálogo)</Label>
              <Textarea
                id="catalogLongDescription"
                value={catalogLongDescription}
                onChange={(e) => setCatalogLongDescription(e.target.value)}
                placeholder="Descrição completa para o catálogo"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Product Image */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Imagem do Produto
            </CardTitle>
            <CardDescription>
              Adicione uma imagem para exibir no catálogo público
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {imageUrl ? (
              <div className="flex items-start gap-4">
                <div className="relative">
                  <img
                    src={imageUrl}
                    alt="Produto"
                    className="w-40 h-40 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={removeImage}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Imagem enviada com sucesso.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Trocar imagem
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => !uploadingImage && fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                {uploadingImage ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Enviando...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Clique para enviar uma imagem
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG ou WEBP (máx. 5MB)
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost Composition */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Composição de Custos
            </CardTitle>
            <CardDescription>
              Configure os custos para calcular o preço de venda automaticamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="baseCost">Custo Base (R$)</Label>
                <CurrencyInput
                  id="baseCost"
                  value={baseCost}
                  onChange={setBaseCost}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="laborCost">Mão de Obra (R$)</Label>
                <CurrencyInput
                  id="laborCost"
                  value={laborCost}
                  onChange={setLaborCost}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="waste">Desperdício (%)</Label>
                <Input
                  id="waste"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={wastePercentage}
                  onChange={(e) => setWastePercentage(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="margin">Margem de Lucro (%)</Label>
                <Input
                  id="margin"
                  type="number"
                  step="0.1"
                  min="0"
                  value={profitMargin}
                  onChange={(e) => setProfitMargin(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Supplies section - available for all product types */}
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label className="text-base">Insumos Utilizados</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vincule os insumos para cálculo automático do custo de produção
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addSupply}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar Insumo
                </Button>
              </div>

              {productSupplies.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="w-32">Qtd. Usada</TableHead>
                      <TableHead className="w-32">Custo Unit.</TableHead>
                      <TableHead className="w-32">Subtotal</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productSupplies.map((ps, index) => {
                      const supply = supplies.find(s => s.id === ps.supply_id);
                      const subtotal = supply ? Number(supply.cost_per_unit) * ps.quantity : 0;
                      return (
                        <TableRow key={index}>
                          <TableCell>
                            <Select value={ps.supply_id} onValueChange={(v) => updateSupply(index, 'supply_id', v)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o insumo..." />
                              </SelectTrigger>
                              <SelectContent>
                                {supplies.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    <div className="flex items-center gap-2">
                                      {s.image_url && (
                                        <img src={s.image_url} alt={s.name} className="w-6 h-6 rounded object-cover" />
                                      )}
                                      <span>{s.name}</span>
                                      <span className="text-muted-foreground">({s.unit}) - {formatCurrency(s.cost_per_unit)}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.001"
                                min="0"
                                value={ps.quantity}
                                onChange={(e) => updateSupply(index, 'quantity', e.target.value)}
                                className="w-20"
                              />
                              <span className="text-sm text-muted-foreground">{supply?.unit || ''}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {supply ? formatCurrency(Number(supply.cost_per_unit)) : '-'}
                          </TableCell>
                          <TableCell className="font-medium text-primary">
                            {formatCurrency(subtotal)}
                          </TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSupply(index)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={3} className="text-right font-medium">
                        Total Insumos:
                      </TableCell>
                      <TableCell className="font-bold text-primary">
                        {formatCurrency(suppliesCost)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum insumo vinculado a este produto
                  </p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addSupply}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar Primeiro Insumo
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Cost Summary */}
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-3">Resumo de Custos</h4>
              <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-5">
                <div className="p-2 rounded bg-background">
                  <span className="text-muted-foreground text-xs block">Custo Base</span>
                  <span className="font-medium">{formatCurrency(baseCost)}</span>
                </div>
                <div className="p-2 rounded bg-background">
                  <span className="text-muted-foreground text-xs block">Insumos ({productSupplies.length})</span>
                  <span className="font-medium text-primary">{formatCurrency(suppliesCost)}</span>
                </div>
                <div className="p-2 rounded bg-background">
                  <span className="text-muted-foreground text-xs block">Mão de Obra</span>
                  <span className="font-medium">{formatCurrency(laborCost)}</span>
                </div>
                <div className="p-2 rounded bg-background">
                  <span className="text-muted-foreground text-xs block">Custo Total</span>
                  <span className="font-medium">{formatCurrency(totalCost)}</span>
                </div>
                <div className="p-2 rounded bg-background">
                  <span className="text-muted-foreground text-xs block">+ Desperdício ({wastePercentage}%)</span>
                  <span className="font-medium">{formatCurrency(costWithWaste)}</span>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-muted-foreground">Preço Mínimo (10%):</span>
                  <span className="ml-2 font-medium text-chart-4">{formatCurrency(minPrice)}</span>
                </div>
                <div className="text-lg">
                  <span className="text-muted-foreground">Preço Sugerido ({profitMargin}%):</span>
                  <span className="ml-2 font-bold text-chart-2">{formatCurrency(suggestedPrice)}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_200px] items-end">
              <div>
                <Label htmlFor="final-price">Preço final do produto</Label>
                <p className="text-xs text-muted-foreground">
                  Usado nos pedidos e no catálogo. Você pode alterar.
                </p>
              </div>
              <CurrencyInput
                id="final-price"
                value={finalPrice}
                onChange={(value) => {
                  setFinalPrice(value);
                  setFinalPriceTouched(true);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Price Tiers */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Faixas de Preço por Quantidade</CardTitle>
                <CardDescription>
                  Configure preços diferenciados para compras em quantidade
                </CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={addPriceTier}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar Faixa
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {priceTiers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Qtd Mínima</TableHead>
                    <TableHead>Qtd Máxima</TableHead>
                    <TableHead>Preço Unitário</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceTiers.map((tier, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={tier.min_quantity}
                          onChange={(e) => updatePriceTier(index, 'min_quantity', parseInt(e.target.value) || 1)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={tier.min_quantity}
                          value={tier.max_quantity || ''}
                          onChange={(e) => updatePriceTier(index, 'max_quantity', e.target.value ? parseInt(e.target.value) : null)}
                          placeholder="Sem limite"
                        />
                      </TableCell>
                      <TableCell>
                        <CurrencyInput
                          value={tier.price}
                          onChange={(value) => updatePriceTier(index, 'price', value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removePriceTier(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma faixa de preço configurada. O {defaultPriceLabel} ({formatCurrency(defaultUnitPrice)}) será usado para todas as quantidades.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Promotion */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <CardTitle>Promoção (Opcional)</CardTitle>
            </div>
            <CardDescription>
              Defina um preço promocional e o período de validade. O preço original aparecerá riscado no catálogo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="promoPrice">Preço Promocional (R$)</Label>
                <CurrencyInput
                  id="promoPrice"
                  value={promoPrice || 0}
                  onChange={(v) => setPromoPrice(v > 0 ? v : null)}
                />
                {errors?.promo_price && <p className="text-xs text-destructive">{errors.promo_price}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="promoStartAt">Data de Início</Label>
                <Input
                  id="promoStartAt"
                  type="datetime-local"
                  value={promoStartAt}
                  onChange={(e) => setPromoStartAt(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="promoEndAt">Data de Término</Label>
                <Input
                  id="promoEndAt"
                  type="datetime-local"
                  value={promoEndAt}
                  onChange={(e) => setPromoEndAt(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attributes */}
        <Card>
          <CardHeader>
            <CardTitle>Atributos do Produto</CardTitle>
            <CardDescription>
              Selecione os atributos disponíveis e configure modificadores de preço
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {productAttributes.map((attr, attrIndex) => (
              <div key={attr.attribute_id}>
                <Label className="text-base">{attr.attribute_name}</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {attr.values.map((val, valIndex) => (
                    <div
                      key={val.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${val.selected ? 'border-primary bg-primary/10' : 'hover:border-muted-foreground'
                        }`}
                      onClick={() => toggleAttributeValue(attrIndex, valIndex)}
                    >
                      <Badge variant={val.selected ? 'default' : 'outline'}>
                        {val.value}
                      </Badge>
                      {val.selected && (
                        <CurrencyInput
                          className="w-24 h-7 text-xs"
                          showPrefix={false}
                          value={val.price_modifier || 0}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(value) => updateAttributeModifier(attrIndex, valIndex, value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {attrIndex < productAttributes.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Stock */}
        <Card>
          <CardHeader>
            <CardTitle>Estoque Inicial</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="stockQuantity">Quantidade em Estoque</Label>
              <Input
                id="stockQuantity"
                type="number"
                step="0.01"
                min="0"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(parseFloat(e.target.value) || 0)}
                disabled={!trackStock}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minStock">Estoque Mínimo (alerta)</Label>
              <Input
                id="minStock"
                type="number"
                step="0.01"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(parseFloat(e.target.value) || 0)}
                disabled={!trackStock}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/produtos')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Salvar Produto
          </Button>
        </div>
      </form>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-category-name">Nome da Categoria *</Label>
              <Input
                id="new-category-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ex: Camisetas, Acessórios..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-category">Categoria Pai (opcional)</Label>
              <Select
                value={newCategoryParentId || "none"}
                onValueChange={(v) => setNewCategoryParentId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria pai (categoria principal)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria pai (categoria principal)</SelectItem>
                  {rootCategoryOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecione uma categoria pai para criar uma subcategoria
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCategory} disabled={savingCategory}>
              {savingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Categoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
