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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Category, Supply, Attribute, AttributeValue, ProductColor, ProductType } from '@/types/database';
import { ArrowLeft, Plus, Trash2, Calculator, Save, Loader2, Upload, Image, Globe, Package, FolderPlus, Tag } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { generateProductDescription } from '@/services/ai';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ensurePublicStorageUrl, getStoragePathFromUrl } from '@/lib/storage';
import { BarcodeSvg } from '@/components/BarcodeSvg';
import {
  detectBarcodeFormat,
  generateCode128,
  generateEan13,
  isValidCode128,
  isValidEan13,
  normalizeBarcode,
  type BarcodeFormat,
} from '@/lib/barcode';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

const productSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().max(64).optional().nullable(),
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
  min_order_quantity: z.number().int().min(1, 'Quantidade mínima deve ser pelo menos 1'),
  track_stock: z.boolean(),
  promo_price: z.number().min(0, 'Preço promocional deve ser positivo').optional().nullable(),
  promo_start_at: z.string().optional().nullable(),
  promo_end_at: z.string().optional().nullable(),
  image_urls: z.array(z.string().min(1)).max(5).optional(),
  product_colors: z.array(
    z.object({
      name: z.string().min(1, 'Nome da cor é obrigatório'),
      hex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'HEX inválido'),
      active: z.boolean(),
    })
  ).optional(),
  personalization_enabled: z.boolean(),
});

const MAX_PRODUCT_IMAGES = 5;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const normalizeProductColors = (value: unknown): ProductColor[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const hex = typeof record.hex === 'string' ? record.hex.trim() : '';
      const active = typeof record.active === 'boolean' ? record.active : true;
      if (!name || !hex) return null;
      return { name, hex, active };
    })
    .filter((color): color is ProductColor => !!color);
};

const normalizeProductImages = (value: unknown, fallback?: string | null): string[] => {
  const rawList = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
  const normalized = rawList
    .map((url) => ensurePublicStorageUrl('product-images', url) || url)
    .filter((url): url is string => Boolean(url));
  const withFallback = fallback ? [fallback, ...normalized] : normalized;
  const unique = withFallback.filter((url, index, self) => self.indexOf(url) === index);
  return unique.slice(0, MAX_PRODUCT_IMAGES);
};

const mergeAttributeDraft = (
  base: ProductAttributeItem[],
  draft: ProductAttributeItem[]
): ProductAttributeItem[] => {
  return base.map((attr) => {
    const draftAttr = draft.find((item) => item.attribute_id === attr.attribute_id);
    if (!draftAttr) return attr;
    const draftValues = Array.isArray(draftAttr.values) ? draftAttr.values : [];
    const mergedValues = attr.values.map((value) => {
      const draftValue = draftValues.find((item) => item.id === value.id);
      if (!draftValue) return value;
      return {
        ...value,
        selected: Boolean(draftValue.selected),
        price_modifier: Number(draftValue.price_modifier ?? value.price_modifier),
      };
    });
    return { ...attr, values: mergedValues };
  });
};

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
  const { profile, company } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [skuChecking, setSkuChecking] = useState(false);
  const [barcodeChecking, setBarcodeChecking] = useState(false);

  // Form data
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>('ean13');
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
  const [productColors, setProductColors] = useState<ProductColor[]>([]);
  const [personalizationEnabled, setPersonalizationEnabled] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
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
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>();
  const productLinkPreview = company?.slug
    ? `/catalogo/${company.slug}/produto/${productSlug || 'slug-do-produto'}`
    : `/catalogo/produto/${productSlug || 'slug-do-produto'}`;
  const draftStorageKey = useMemo(() => {
    const companyKey = company?.id || profile?.company_id || 'public';
    const productKey = isEditing ? id : 'novo';
    return `product-form-draft:${companyKey}:${productKey}`;
  }, [company?.id, profile?.company_id, isEditing, id]);

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

  const parentCategoryOptions = useMemo(() => {
    return categoryOptions;
  }, [categoryOptions]);

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    setInitialSnapshot(null);
    setDraftReady(false);
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
      const normalizedBarcodeValue = normalizeBarcodeValue(product.barcode || '');
      setBarcode(normalizedBarcodeValue);
      setBarcodeFormat(detectBarcodeFormat(normalizedBarcodeValue) ?? 'ean13');
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
      setProductColors(normalizeProductColors(product.product_colors));
      setPersonalizationEnabled(product.personalization_enabled ?? false);
      const normalizedPrimaryImage = ensurePublicStorageUrl('product-images', product.image_url);
      setImageUrls(normalizeProductImages(product.image_urls, normalizedPrimaryImage));
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
    } else {
      setProductColors([]);
      setPersonalizationEnabled(false);
      setImageUrls([]);
    }

    setProductAttributes(productAttrSelection);
    setLoading(false);
  };

    // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const remainingSlots = MAX_PRODUCT_IMAGES - imageUrls.length;
    if (remainingSlots <= 0) {
      toast({ title: `Limite de ${MAX_PRODUCT_IMAGES} imagens`, variant: 'destructive' });
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);
    const validFiles: File[] = [];
    let rejectedType = false;
    let rejectedSize = false;

    for (const file of filesToUpload) {
      const mimeType = file.type.toLowerCase();
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const hasValidExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
      const hasValidMimeType = ALLOWED_IMAGE_MIME_TYPES.has(mimeType);

      if (!hasValidMimeType && !hasValidExtension) {
        rejectedType = true;
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        rejectedSize = true;
        continue;
      }
      validFiles.push(file);
    }

    if (rejectedType) {
      toast({ title: 'Selecione imagens JPG, PNG ou WEBP', variant: 'destructive' });
    }
    if (rejectedSize) {
      toast({ title: 'Imagem deve ter no máximo 5MB', variant: 'destructive' });
    }
    if (validFiles.length === 0) {
      e.target.value = '';
      return;
    }

    setUploadingImage(true);
    const uploadedUrls: string[] = [];

    for (const file of validFiles) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) {
        toast({ title: 'Erro ao enviar imagem', variant: 'destructive' });
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      const normalizedUrl = ensurePublicStorageUrl('product-images', publicUrl);
      if (normalizedUrl) {
        uploadedUrls.push(normalizedUrl);
      }
    }

    setUploadingImage(false);
    if (uploadedUrls.length > 0) {
      setImageUrls((prev) => [...prev, ...uploadedUrls].slice(0, MAX_PRODUCT_IMAGES));
      toast({ title: 'Imagens enviadas com sucesso!' });
    }
    e.target.value = '';
  };

  const setPrimaryImage = (index: number) => {
    if (index <= 0) return;
    setImageUrls((prev) => {
      if (index >= prev.length) return prev;
      const next = [...prev];
      const [selected] = next.splice(index, 1);
      next.unshift(selected);
      return next;
    });
  };

  const removeImage = async (index: number) => {
    const targetUrl = imageUrls[index];
    if (targetUrl) {
      const path = getStoragePathFromUrl('product-images', targetUrl);
      if (path) {
        await supabase.storage.from('product-images').remove([path]);
      }
    }
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
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

  const formSnapshot = useMemo(() => ({
    name,
    sku,
    barcode,
    description,
    productSlug,
    productType,
    categoryId,
    unit,
    isActive,
    showInCatalog,
    catalogFeatured,
    catalogPrice,
    catalogShortDescription,
    catalogLongDescription,
    imageUrls,
    baseCost,
    laborCost,
    wastePercentage,
    profitMargin,
    finalPrice,
    stockQuantity,
    minStock,
    minOrderQuantity,
    trackStock,
    promoPrice,
    promoStartAt,
    promoEndAt,
    productColors,
    personalizationEnabled,
    productSupplies: productSupplies.map((ps) => ({
      supply_id: ps.supply_id,
      quantity: ps.quantity,
    })),
    priceTiers,
    productAttributes: productAttributes.map((attr) => ({
      attribute_id: attr.attribute_id,
      values: attr.values.map((val) => ({
        id: val.id,
        selected: val.selected,
        price_modifier: val.price_modifier,
      })),
    })),
  }), [
    name,
    sku,
    barcode,
    description,
    productSlug,
    productType,
    categoryId,
    unit,
    isActive,
    showInCatalog,
    catalogFeatured,
    catalogPrice,
    catalogShortDescription,
    catalogLongDescription,
    imageUrls,
    baseCost,
    laborCost,
    wastePercentage,
    profitMargin,
    finalPrice,
    stockQuantity,
    minStock,
    minOrderQuantity,
    trackStock,
    promoPrice,
    promoStartAt,
    promoEndAt,
    productColors,
    personalizationEnabled,
    productSupplies,
    priceTiers,
    productAttributes,
  ]);
  const formSnapshotJson = useMemo(() => JSON.stringify(formSnapshot), [formSnapshot]);
  const isDirty = initialSnapshot !== null && initialSnapshot !== formSnapshotJson;

  useEffect(() => {
    if (!loading && initialSnapshot === null) {
      setInitialSnapshot(formSnapshotJson);
    }
  }, [loading, initialSnapshot, formSnapshotJson]);

  useEffect(() => {
    if (loading || draftReady || initialSnapshot === null) return;
    if (typeof window === 'undefined') {
      setDraftReady(true);
      return;
    }

    const stored = window.localStorage.getItem(draftStorageKey);
    if (!stored) {
      setDraftReady(true);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as {
        productId?: string | null;
        data?: typeof formSnapshot;
        meta?: { slugTouched?: boolean; finalPriceTouched?: boolean };
      };
      const draftData = parsed?.data;
      if (!draftData) {
        setDraftReady(true);
        return;
      }

      if (isEditing && parsed.productId && parsed.productId !== id) {
        setDraftReady(true);
        return;
      }
      if (!isEditing && parsed.productId) {
        setDraftReady(true);
        return;
      }

      setName(draftData.name ?? '');
      setSku(draftData.sku ?? '');
      const normalizedDraftBarcode = normalizeBarcodeValue(draftData.barcode ?? '');
      setBarcode(normalizedDraftBarcode);
      setBarcodeFormat(detectBarcodeFormat(normalizedDraftBarcode) ?? 'ean13');
      setDescription(draftData.description ?? '');
      setProductSlug(draftData.productSlug ?? '');
      setProductType(draftData.productType ?? 'produto');
      setCategoryId(draftData.categoryId ?? '');
      setUnit(draftData.unit ?? 'un');
      setIsActive(Boolean(draftData.isActive));
      setShowInCatalog(Boolean(draftData.showInCatalog));
      setCatalogFeatured(Boolean(draftData.catalogFeatured));
      setCatalogPrice(draftData.catalogPrice ?? null);
      setCatalogShortDescription(draftData.catalogShortDescription ?? '');
      setCatalogLongDescription(draftData.catalogLongDescription ?? '');
      setImageUrls(normalizeProductImages(draftData.imageUrls));
      setBaseCost(Number(draftData.baseCost ?? 0));
      setLaborCost(Number(draftData.laborCost ?? 0));
      setWastePercentage(Number(draftData.wastePercentage ?? 0));
      setProfitMargin(Number(draftData.profitMargin ?? 0));
      setFinalPrice(Number(draftData.finalPrice ?? 0));
      setStockQuantity(Number(draftData.stockQuantity ?? 0));
      setMinStock(Number(draftData.minStock ?? 0));
      setMinOrderQuantity(Number(draftData.minOrderQuantity ?? 1));
      setTrackStock(Boolean(draftData.trackStock));
      setPromoPrice(draftData.promoPrice ?? null);
      setPromoStartAt(draftData.promoStartAt ?? '');
      setPromoEndAt(draftData.promoEndAt ?? '');
      setProductColors(normalizeProductColors(draftData.productColors));
      setPersonalizationEnabled(Boolean(draftData.personalizationEnabled));

      if (Array.isArray(draftData.productSupplies)) {
        setProductSupplies(
          draftData.productSupplies.map((ps) => ({
            supply_id: ps.supply_id,
            quantity: Number(ps.quantity ?? 1),
            supply: supplies.find((s) => s.id === ps.supply_id),
          }))
        );
      }

      if (Array.isArray(draftData.priceTiers)) {
        setPriceTiers(
          draftData.priceTiers.map((tier) => ({
            min_quantity: Number(tier.min_quantity ?? 1),
            max_quantity: tier.max_quantity !== null && tier.max_quantity !== undefined
              ? Number(tier.max_quantity)
              : null,
            price: Number(tier.price ?? 0),
          }))
        );
      }

      if (Array.isArray(draftData.productAttributes)) {
        setProductAttributes((prev) => mergeAttributeDraft(prev, draftData.productAttributes));
      }

      if (typeof parsed.meta?.slugTouched === 'boolean') {
        setSlugTouched(parsed.meta.slugTouched);
      }
      if (typeof parsed.meta?.finalPriceTouched === 'boolean') {
        setFinalPriceTouched(parsed.meta.finalPriceTouched);
      } else if (draftData.finalPrice !== null && draftData.finalPrice !== undefined) {
        setFinalPriceTouched(true);
      }
    } catch {
      // Ignore malformed drafts.
    } finally {
      setDraftReady(true);
    }
  }, [loading, draftReady, initialSnapshot, draftStorageKey, isEditing, id, supplies]);

  useUnsavedChanges(isDirty && !saving);

  useEffect(() => {
    if (!draftReady || typeof window === 'undefined') return;
    const payload = {
      productId: isEditing ? id : null,
      companyId: company?.id || profile?.company_id || null,
      updatedAt: new Date().toISOString(),
      data: formSnapshot,
      meta: {
        slugTouched,
        finalPriceTouched,
      },
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
  }, [
    draftReady,
    draftStorageKey,
    formSnapshot,
    isEditing,
    id,
    company?.id,
    profile?.company_id,
    slugTouched,
    finalPriceTouched,
  ]);

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

  const addProductColor = () => {
    setProductColors((prev) => [...prev, { name: '', hex: '#000000', active: true }]);
  };

  const updateProductColor = (
    index: number,
    field: keyof ProductColor,
    value: string | boolean
  ) => {
    setProductColors((prev) =>
      prev.map((color, i) =>
        i === index ? { ...color, [field]: value } : color
      )
    );
  };

  const removeProductColor = (index: number) => {
    setProductColors((prev) => prev.filter((_, i) => i !== index));
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
      setCatalogShortDescription(resp.shortDescription || '');
      setCatalogLongDescription(resp.longDescription || '');
      if (!description.trim()) {
        setDescription(resp.longDescription || '');
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
  const normalizeBarcodeValue = (value: string) => normalizeBarcode(value);

  const clearSkuError = () => {
    setErrors((prev) => {
      if (!prev?.sku) return prev;
      const next = { ...prev };
      delete next.sku;
      return Object.keys(next).length ? next : undefined;
    });
  };

  const clearBarcodeError = () => {
    setErrors((prev) => {
      if (!prev?.barcode) return prev;
      const next = { ...prev };
      delete next.barcode;
      return Object.keys(next).length ? next : undefined;
    });
  };

  const validateBarcodeValue = (value: string, format?: BarcodeFormat) => {
    if (!value) return null;
    const resolvedFormat = format ?? detectBarcodeFormat(value) ?? 'code128';
    if (resolvedFormat === 'ean13') {
      if (!/^\d{13}$/.test(value)) return 'EAN-13 deve ter 13 dígitos.';
      if (!isValidEan13(value)) return 'EAN-13 inválido.';
      return null;
    }
    if (!isValidCode128(value)) {
      return 'Código de barras inválido. Use caracteres ASCII padrão.';
    }
    return null;
  };

  const checkBarcodeAvailability = async (value: string) => {
    if (!value) return true;
    let query = supabase
      .from('products')
      .select('id')
      .eq('barcode', value);

    if (profile?.company_id) {
      query = query.eq('company_id', profile.company_id);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      toast({ title: 'Erro ao validar código de barras', description: error.message, variant: 'destructive' });
      return false;
    }
    if (!data) return true;
    if (isEditing && data.id === id) return true;
    return false;
  };

  const checkSkuAvailability = async (value: string) => {
    if (!value) return true;
    let query = supabase
      .from('products')
      .select('id')
      .eq('sku', value);

    if (profile?.company_id) {
      query = query.eq('company_id', profile.company_id);
    }

    const { data, error } = await query.maybeSingle();

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

  const handleGenerateBarcode = async () => {
    setBarcodeChecking(true);
    const generator = barcodeFormat === 'ean13' ? generateEan13 : generateCode128;

    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = normalizeBarcodeValue(generator());
      const error = validateBarcodeValue(candidate, barcodeFormat);
      if (error) continue;
      const isAvailable = await checkBarcodeAvailability(candidate);
      if (isAvailable) {
        setBarcode(candidate);
        clearBarcodeError();
        setBarcodeChecking(false);
        return;
      }
    }

    toast({ title: 'Não foi possível gerar um código de barras único', variant: 'destructive' });
    setBarcodeChecking(false);
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
    const normalizedBarcode = normalizeBarcodeValue(barcode);

    const normalizedSlug = generateSlug((slugTouched ? productSlug : name).trim() || name.trim());
    const normalizedColors = productColors.map((color) => ({
      name: color.name.trim(),
      hex: color.hex.trim(),
      active: color.active,
    }));
    const normalizedImageUrls = normalizeProductImages(imageUrls);
    const primaryImageUrl = normalizedImageUrls[0] ?? null;
    const hasInvalidColor = normalizedColors.some((color) => !color.name || !color.hex);
    if (hasInvalidColor) {
      toast({ title: 'Preencha nome e HEX das cores', variant: 'destructive' });
      return;
    }
    const formData = {
      name: name.trim(),
      sku: normalizedSku || null,
      barcode: normalizedBarcode || null,
      description: description.trim() || null,
      slug: normalizedSlug || null,
      product_type: productType,
      category_id: categoryId || null,
      company_id: profile?.company_id || null,
      image_url: primaryImageUrl,
      image_urls: normalizedImageUrls,
      show_in_catalog: showInCatalog,
      catalog_enabled: showInCatalog,
      catalog_featured: catalogFeatured,
      catalog_price: catalogPrice ?? null,
      catalog_short_description: catalogShortDescription.trim() || null,
      catalog_long_description: catalogLongDescription.trim() || null,
      catalog_min_order: minOrderQuantity,
      product_colors: normalizedColors,
      personalization_enabled: personalizationEnabled,
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

    if (normalizedBarcode) {
      const barcodeError = validateBarcodeValue(normalizedBarcode, barcodeFormat);
      if (barcodeError) {
        setErrors((prev) => ({ ...(prev || {}), barcode: barcodeError }));
        toast({ title: 'Código de barras inválido', description: barcodeError, variant: 'destructive' });
        return;
      }
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

    if (normalizedBarcode) {
      const isAvailable = await checkBarcodeAvailability(normalizedBarcode);
      if (!isAvailable) {
        setErrors((prev) => ({ ...(prev || {}), barcode: 'Código de barras já está em uso' }));
        toast({ title: 'Código de barras já está em uso', variant: 'destructive' });
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
          const message = String(error.message || (error as any).details || '').toLowerCase();
          if (message.includes('barcode')) {
            setErrors((prev) => ({ ...(prev || {}), barcode: 'Código de barras já está em uso' }));
          } else {
            setErrors((prev) => ({ ...(prev || {}), sku: 'SKU já está em uso' }));
          }
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
          const message = String(error?.message || (error as any)?.details || '').toLowerCase();
          if (message.includes('barcode')) {
            setErrors((prev) => ({ ...(prev || {}), barcode: 'Código de barras já está em uso' }));
          } else {
            setErrors((prev) => ({ ...(prev || {}), sku: 'SKU já está em uso' }));
          }
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
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(draftStorageKey);
    }
    navigate('/produtos');
  };

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const normalizedBarcodePreview = normalizeBarcodeValue(barcode);
  const resolvedBarcodeFormat =
    detectBarcodeFormat(normalizedBarcodePreview) ?? barcodeFormat;

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
        <Tabs defaultValue="informacoes" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:h-10 sm:grid-cols-3">
            <TabsTrigger value="informacoes">Informações Gerais</TabsTrigger>
            <TabsTrigger value="estoque">Estoque</TabsTrigger>
            <TabsTrigger value="valores">Valores</TabsTrigger>
          </TabsList>

          <TabsContent value="informacoes" className="space-y-6">
            {/* Basic Info */}
            <Card>
          <CardHeader>
            <CardTitle>Informações Gerais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
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
              <Label htmlFor="barcode">Código de barras</Label>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Select value={barcodeFormat} onValueChange={(value) => setBarcodeFormat(value as BarcodeFormat)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ean13">EAN-13</SelectItem>
                      <SelectItem value="code128">Code 128</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    id="barcode"
                    value={barcode}
                    onChange={(e) => {
                      setBarcode(normalizeBarcodeValue(e.target.value));
                      clearBarcodeError();
                    }}
                    placeholder="Código de barras"
                    className={`flex-1 ${errors?.barcode ? 'border-destructive' : ''}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateBarcode}
                    disabled={barcodeChecking}
                    className="shrink-0"
                  >
                    {barcodeChecking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Gerar'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  EAN-13: 13 dígitos. Code 128: ASCII 32-126.
                </p>
                {normalizedBarcodePreview ? (
                  <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-2">
                    <BarcodeSvg
                      value={normalizedBarcodePreview}
                      format={resolvedBarcodeFormat}
                      className="w-full"
                    />
                    <span className="text-xs text-muted-foreground tracking-widest">
                      {normalizedBarcodePreview}
                    </span>
                  </div>
                ) : null}
              </div>
              {errors?.barcode && <p className="text-xs text-destructive">{errors.barcode}</p>}
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
                <p className="text-xs text-muted-foreground">{productLinkPreview}</p>
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

            <Separator className="md:col-span-2" />

            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Cores disponíveis</Label>
                  <p className="text-sm text-muted-foreground">
                    Configure as cores que o cliente pode escolher no catálogo.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addProductColor}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar cor
                </Button>
              </div>

              {productColors.length > 0 ? (
                <div className="space-y-3">
                  {productColors.map((color, index) => (
                    <div
                      key={`${color.name}-${index}`}
                      className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_140px_120px_80px_40px] items-center"
                    >
                      <Input
                        placeholder="Nome da cor"
                        value={color.name}
                        onChange={(e) => updateProductColor(index, 'name', e.target.value)}
                      />
                      <Input
                        placeholder="#1E90FF"
                        value={color.hex}
                        onChange={(e) => updateProductColor(index, 'hex', e.target.value)}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={color.hex || '#000000'}
                          onChange={(e) => updateProductColor(index, 'hex', e.target.value)}
                          className="h-9 w-12 rounded border border-input bg-transparent p-0"
                          aria-label="Selecionar cor"
                        />
                        <div
                          className="h-9 w-9 rounded border"
                          style={{ backgroundColor: color.hex || '#000000' }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={color.active}
                          onCheckedChange={(checked) => updateProductColor(index, 'active', checked)}
                        />
                        <span className="text-xs text-muted-foreground">Ativa</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProductColor(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhuma cor cadastrada.
                </div>
              )}
            </div>

            <div className="md:col-span-2 flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Personalização (Nome na capa)</Label>
                <p className="text-xs text-muted-foreground">
                  Exiba o campo de personalização na página do produto.
                </p>
              </div>
              <Switch checked={personalizationEnabled} onCheckedChange={setPersonalizationEnabled} />
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
              Adicione até 5 imagens para exibir no catálogo público
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />

            <div className="space-y-4">
              {imageUrls.length > 0 && (
                <div className="flex flex-wrap gap-4">
                  {imageUrls.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setPrimaryImage(index)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          setPrimaryImage(index);
                        }
                      }}
                      className="group relative h-32 w-32 overflow-hidden rounded-lg border cursor-pointer"
                      title={index === 0 ? 'Imagem principal' : 'Definir como capa'}
                    >
                      <img
                        src={url}
                        alt={`Produto ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                      {index === 0 ? (
                        <Badge variant="secondary" className="absolute left-2 top-2">
                          Principal
                        </Badge>
                      ) : (
                        <span className="absolute left-2 top-2 rounded bg-white/80 px-2 py-0.5 text-[10px] text-slate-700 opacity-0 transition-opacity group-hover:opacity-100">
                          Definir capa
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute right-2 top-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeImage(index);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {imageUrls.length < MAX_PRODUCT_IMAGES && (
                <div
                  onClick={() => !uploadingImage && fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
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
                        Clique para enviar imagens
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG ou WEBP (max. 5MB)
                      </p>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {imageUrls.length}/{MAX_PRODUCT_IMAGES} imagens cadastradas.
              </p>
            </div>
          </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="valores" className="space-y-6">
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
          </TabsContent>

          <TabsContent value="estoque" className="space-y-6">
            {/* Stock */}
            <Card>
              <CardHeader>
                <CardTitle>Estoque</CardTitle>
                <CardDescription>
                  Configure como este produto será controlado no estoque.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2 flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Controlar estoque</Label>
                    <p className="text-xs text-muted-foreground">
                      Desative para que o produto não apareça no controle de estoque.
                    </p>
                  </div>
                  <Switch checked={trackStock} onCheckedChange={setTrackStock} />
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
                      <SelectItem value="m\u00B2">Metro2 (m\u00B2)</SelectItem>
                      <SelectItem value="kg">Quilograma (kg)</SelectItem>
                      <SelectItem value="cx">Caixa (cx)</SelectItem>
                      <SelectItem value="pct">Pacote (pct)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minOrderQuantity">Quantidade mínima para pedido</Label>
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

                {!trackStock && (
                  <p className="md:col-span-2 text-xs text-muted-foreground">
                    Este produto ficará marcado como "Não controla estoque" na listagem.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
                    {parentCategoryOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {`${'-- '.repeat(option.level)}${option.name}`}
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




