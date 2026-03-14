import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
import type { PostgrestError } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { Attribute, AttributeValue, Category, Expense, OrderItem, Product, ProductColor, ProductSupply, ProductType, SaleItem, Supply, StockControlType } from '@/types/database';
import { ArrowLeft, Plus, Trash2, Calculator, Save, Loader2, Upload, Image, Globe, Package, FolderPlus, Tag, CopyPlus, ShieldAlert, ExternalLink, PackageX, Layers, Boxes } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { generateProductDescription } from '@/services/ai';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ensurePublicStorageUrl, getStoragePathFromUrl } from '@/lib/storage';
import { uploadFile, deleteFile } from '@/lib/upload';
import { BarcodeSvg } from '@/components/BarcodeSvg';
import { buildProductProfitabilityRows, buildSoldUnitsMap } from '@/lib/finance';
import { cn } from '@/lib/utils';
import {
  buildPriceSimulation,
  calculateEstimatedProfit,
  calculatePriceByMultiplier,
  calculateRealMargin,
  resolveProductBasePrice,
} from '@/lib/pricing';
import {
  detectBarcodeFormat,
  generateCode128,
  generateEan13,
  isValidCode128,
  isValidEan13,
  normalizeBarcode,
  type BarcodeFormat,
} from '@/lib/barcode';
import {
  CUSTOM_PRODUCT_SALE_UNIT_VALUE,
  DEFAULT_PRODUCT_SALE_UNIT,
  PRODUCT_SALE_UNIT_OPTIONS,
  getProductSaleUnitLabel,
  isProductSaleUnitPreset,
  resolveProductSaleUnit,
} from '@/lib/productSaleUnit';
import { usesDirectProductStock, usesSupplyStock } from '@/lib/stockControl';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

const productSchema = z
  .object({
    name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
    sku: z.string().max(50).optional().nullable(),
    barcode: z.string().max(64).optional().nullable(),
    description: z.string().max(500).optional().nullable(),
    product_type: z.enum(['produto', 'confeccionado', 'servico']),
    category_id: z.string().uuid().optional().nullable(),
    unit: z.string().min(1, 'Unidade é obrigatória').max(10),
    unit_type: z.string().min(1, 'Unidade de venda é obrigatória').max(50),
    is_active: z.boolean(),
    base_cost: z.number().min(0, 'Custo base deve ser positivo'),
    labor_cost: z.number().min(0, 'Custo de mão de obra deve ser positivo'),
    expense_percentage: z.number().min(0).max(1000, 'Despesas devem ser entre 0 e 1000%'),
    waste_percentage: z.number().min(0).max(100, 'Desperdício deve ser entre 0 e 100%'),
    profit_margin: z.number().min(0).max(1000, 'Margem deve ser entre 0 e 1000%'),
    final_price: z.number().min(0, 'Preço final deve ser positivo'),
    stock_quantity: z.number().min(0),
    min_stock: z.number().min(0),
    min_order_quantity: z.number().int().min(1, 'Quantidade mínima deve ser pelo menos 1'),
    track_stock: z.boolean(),
    stock_control_type: z.enum(['none', 'simple', 'composition']).optional().nullable(),
    promo_price: z.number().min(0, 'Preço promocional deve ser positivo').optional().nullable(),
    promo_start_at: z.string().optional().nullable(),
    promo_end_at: z.string().optional().nullable(),
    image_urls: z.array(z.string().min(1)).max(5).optional(),
    product_colors: z
      .array(
        z.object({
          name: z.string().min(1, 'Nome da cor é obrigatório'),
          hex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'HEX inválido'),
          active: z.boolean(),
        }),
      )
      .optional(),
    personalization_enabled: z.boolean(),
    production_time_days: z.number().int().min(0, 'Informe um valor maior ou igual a 0').nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.personalization_enabled && value.production_time_days === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['production_time_days'],
        message: 'Informe o tempo de produção para produtos personalizados.',
      });
    }
  });

const MAX_PRODUCT_IMAGES = 5;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const GENERATED_DESCRIPTION_GENERIC_MARKERS = [
  'com acabamento de qualidade e foco em praticidade',
  'excelente custo-benefício e qualidade',
  'foi pensado para quem busca qualidade, durabilidade e bom acabamento',
  'produto pronto para venda e divulgação no catálogo',
  'da categoria',
];

const DESCRIPTION_STOPWORDS = new Set([
  'a',
  'o',
  'as',
  'os',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'e',
  'em',
  'para',
  'com',
  'sem',
  'por',
  'na',
  'no',
  'nas',
  'nos',
  'ao',
  'aos',
  'à',
  'às',
  'tipo',
  'modelo',
  'kit',
]);

const PRODUCT_COPY_PATTERNS: Array<{
  keywords: string[];
  lead: string;
  support: string;
  useCase: string;
  shortFocus: string;
}> = [
    {
      keywords: ['calendario', 'agenda', 'planner', 'caderno', 'blocos'],
      lead: 'foi desenvolvido para organizar a rotina com elegância e manter informações importantes sempre ao alcance',
      support: 'Com excelente acabamento e design funcional, é o item perfeito para uso diário ou para presentear.',
      useCase: 'Facilita a organização visual do dia a dia, ajudando no planejamento e na produtividade de forma prática e duradoura.',
      shortFocus: 'organização diária, praticidade e acabamento premium',
    },
    {
      keywords: ['banner', 'faixa', 'lona', 'painel', 'plotagem', 'comunicacao'],
      lead: 'entrega visibilidade máxima e impacto visual para destacar sua marca e suas ofertas à distância',
      support: 'Produzido com materiais resistentes, garante leitura clara e cores vibrantes em qualquer ambiente.',
      useCase: 'Ideal para fachadas, eventos, promoções e sinalização comercial, garantindo que sua mensagem seja vista por todos.',
      shortFocus: 'alto impacto, visibilidade comercial e durabilidade',
    },
    {
      keywords: ['cartao', 'cartão', 'cartoes', 'cartões', 'visita', 'profissional'],
      lead: 'é a porta de entrada para novas conexões, transmitindo credibilidade e profissionalismo em cada detalhe',
      support: 'Seu design limpo e toque de qualidade reforçam a identidade da sua marca no primeiro contato.',
      useCase: 'Essencial para networking, reuniões e eventos, facilitando a troca de contatos com uma apresentação impecável.',
      shortFocus: 'credibilidade profissional e excelente apresentação',
    },
    {
      keywords: ['adesivo', 'etiqueta', 'rotulo', 'rótulo', 'selo', 'sticker'],
      lead: 'oferece o acabamento perfeito para personalizar embalagens, produtos e brindes de forma rápida',
      support: 'Com excelente aderência e corte preciso, valoriza o produto final e reforça a sua identidade visual.',
      useCase: 'Ideal para identificação de produtos, fechamento de pacotes e personalização de itens promocionais com facilidade.',
      shortFocus: 'personalização prática e acabamento de qualidade',
    },
    {
      keywords: ['caneca', 'copo', 'garrafa', 'squeeze', 'taca', 'taça'],
      lead: 'une utilidade e estilo, sendo um item indispensável para o dia a dia ou para criar momentos memoráveis',
      support: 'Seu design ergonômico e acabamento resistente fazem dela uma escolha durável e cheia de personalidade.',
      useCase: 'Perfeita para uso pessoal, presentes afetivos ou ações promocionais que buscam utilidade e valor percebido.',
      shortFocus: 'uso diário e ótimo potencial para presente',
    },
    {
      keywords: ['camiseta', 'camisa', 'uniforme', 'boné', 'bone', 'vestuario'],
      lead: 'foi projetado para vestir com conforto enquanto destaca a identidade visual da sua marca ou evento',
      support: 'Com tecido de qualidade e ajuste ideal, oferece durabilidade e presença visual em qualquer ocasião.',
      useCase: 'Excelente para padronização de equipes, brindes corporativos e eventos, unindo estilo e divulgação.',
      shortFocus: 'conforto, estilo e presença de marca',
    },
    {
      keywords: ['caixa', 'embalagem', 'sacola', 'sacolinha'],
      lead: 'transforma o ato de entregar em uma experiência de desembalagem única e valorizada pelo cliente',
      support: 'Design estruturado que protege o conteúdo enquanto eleva o nível da sua apresentação comercial.',
      useCase: 'Eleva a percepção de cuidado e valor da marca, tornando o produto final muito mais atrativo e profissional.',
      shortFocus: 'valorização da entrega e proteção do produto',
    },
    {
      keywords: ['flyer', 'folder', 'panfleto', 'catalogo', 'folheto', 'convite', 'informativo'],
      lead: 'comunica sua mensagem de forma direta, organizada e visualmente atraente para o seu público',
      support: 'Papel de qualidade e diagramação clara facilitam a leitura e o interesse pelas informações apresentadas.',
      useCase: 'Poderosa ferramenta de divulgação para promoções, serviços e eventos, garantindo uma comunicação eficiente.',
      shortFocus: 'divulgação eficiente e leitura atrativa',
    },
    {
      keywords: ['carimbo', 'datador', 'seladora'],
      lead: 'oferece agilidade e padronização para a sua rotina de trabalho com marcações claras e precisas',
      support: 'Mecanismo durável e ergonômico feito para suportar o uso frequente com excelente desempenho.',
      useCase: 'Ideal para autenticação de documentos, personalização de sacolas e organização de fluxos operacionais.',
      shortFocus: 'agilidade operacional e padronização visual',
    },
    {
      keywords: ['placa', 'sinalizacao', 'acrilico', 'pvc', 'pix'],
      lead: 'garante uma sinalização clara e moderna, ajudando na orientação e na comunicação do seu espaço',
      support: 'Material de alta durabilidade e acabamento refinado que complementa a decoração do ambiente.',
      useCase: 'Perfeita para identificação de setores, instruções de pagamento (PIX) e avisos importantes com elegância.',
      shortFocus: 'comunicação clara e design moderno',
    },
  ];

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const truncateAtWord = (value: string, maxLength: number) => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  const slice = normalized.slice(0, maxLength + 1);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = (lastSpace > Math.floor(maxLength * 0.6) ? slice.slice(0, lastSpace) : slice.slice(0, maxLength))
    .trim()
    .replace(/[,:;\-–\s]+$/g, '');
  return trimmed;
};

const normalizeGeneratedCopy = (value: string | null | undefined) =>
  String(value || '')
    .replace(/\((produto|servico|serviço|confeccionado)\)/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

const ensureSentenceEnding = (value: string) => {
  const normalized = normalizeGeneratedCopy(value);
  if (!normalized) return '';
  const sentence = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}.`;
};

const toCopyUnitLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'un') return 'unidade';
  if (normalized === 'm') return 'metro';
  if (normalized === 'm2' || normalized === 'm²') return 'metro quadrado';
  if (normalized === 'kg') return 'quilo';
  if (normalized === 'g') return 'grama';
  if (normalized === 'cx') return 'caixa';
  return normalized;
};

const normalizeForMatching = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractMeaningfulNameTokens = (value: string) =>
  normalizeForMatching(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !DESCRIPTION_STOPWORDS.has(token));

const detectProductCopyPattern = (name: string, category?: string) => {
  const haystack = `${normalizeForMatching(name)} ${normalizeForMatching(category || '')}`;
  return PRODUCT_COPY_PATTERNS.find((pattern) =>
    pattern.keywords.some((keyword) => haystack.includes(normalizeForMatching(keyword))),
  );
};

const mentionsProductTitle = (content: string, name: string) => {
  const normalizedContent = normalizeForMatching(content);
  const normalizedName = normalizeForMatching(name);
  if (!normalizedContent || !normalizedName) return false;
  if (normalizedContent.includes(normalizedName)) return true;

  const tokens = extractMeaningfulNameTokens(name);
  if (!tokens.length) return false;
  const matchedTokens = tokens.filter((token) => normalizedContent.includes(token));
  return matchedTokens.length >= Math.min(2, tokens.length);
};

const formatLongDescriptionParagraphs = (value: string) => {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => ensureSentenceEnding(paragraph))
    .filter(Boolean);

  if (paragraphs.length >= 2) {
    return paragraphs.join('\n\n');
  }

  const sentences = ensureSentenceEnding(value)
    .match(/[^.!?]+[.!?]+/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];

  if (sentences.length <= 2) {
    return sentences.join(' ') || ensureSentenceEnding(value);
  }

  const grouped: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    grouped.push(sentences.slice(index, index + 2).join(' '));
  }
  return grouped.join('\n\n');
};

const buildElegantDescriptions = ({
  name,
  category,
  productType,
  unit,
  personalizationEnabled,
}: {
  name: string;
  category?: string;
  productType?: ProductType;
  unit?: string;
  personalizationEnabled?: boolean;
}) => {
  const trimmedName = name.trim() || 'Produto';
  const categoryText = category?.trim() ? ` na categoria ${category.trim()}` : '';
  const productLabel =
    productType === 'servico'
      ? 'um serviço'
      : productType === 'confeccionado'
        ? 'um item produzido sob demanda'
        : 'um produto';
  const copyPattern = detectProductCopyPattern(trimmedName, category);
  const unitLabel = toCopyUnitLabel(unit);
  const unitLine = unitLabel ? ` Este item é comercializado por ${unitLabel}, permitindo uma compra ajustada à sua necessidade.` : '';
  const personalizationLine = personalizationEnabled
    ? ' Além disso, oferece suporte a personalização para que o resultado final seja exatamente como você deseja.'
    : '';
  const genericLead =
    productType === 'servico'
      ? 'oferece uma solução profissional e eficiente para atender suas demandas com qualidade e pontualidade'
      : productType === 'confeccionado'
        ? 'é um produto artesanal desenvolvido com cuidado para unir utilidade, durabilidade e uma ótima apresentação'
        : 'foi selecionado para oferecer a melhor relação entre custo e benefício, garantindo satisfação e praticidade';
  const lead = copyPattern?.lead || genericLead;
  const support =
    copyPattern?.support ||
    'Sua versatilidade permite que ele se adapte perfeitamente às suas necessidades diárias com clareza e eficiência.';
  const useCase =
    copyPattern?.useCase ||
    'É uma escolha confiável para quem busca um item funcional, fácil de usar e que entrega resultados consistentes em qualquer situação.';
  const shortFocus =
    copyPattern?.shortFocus ||
    'excelente qualidade, praticidade e ótimo valor percebido';

  const leadSentence = ensureSentenceEnding(lead);
  const supportSentence = ensureSentenceEnding(support);
  const useCaseSentence = ensureSentenceEnding(useCase);

  const description = truncateAtWord(
    ensureSentenceEnding(
      `${trimmedName}${categoryText} é ${productLabel}. ${leadSentence} ${supportSentence}${personalizationLine}${unitLine}`,
    ),
    320,
  );

  const shortDescription = truncateAtWord(
    ensureSentenceEnding(
      `${trimmedName} com foco em ${shortFocus}.`,
    ),
    140,
  );

  const longDescription = [
    `${trimmedName}${categoryText} é ${productLabel}. ${leadSentence} ${supportSentence}`,
    `${useCaseSentence}${unitLine}`,
    personalizationEnabled
      ? 'Com a opção de personalização integrada, este produto se torna uma peça exclusiva, ideal para reforçar sua identidade ou criar presentes marcantes.'
      : 'Esta proposta foi estruturada para oferecer uma visão clara dos benefícios do produto, ajudando você a tomar a melhor decisão de compra com confiança.',
  ]
    .map((paragraph) => ensureSentenceEnding(paragraph))
    .join('\n\n');

  return { description, shortDescription, longDescription };
};

const refineGeneratedDescriptions = ({
  name,
  category,
  productType,
  unit,
  personalizationEnabled,
  description,
  shortDescription,
  longDescription,
}: {
  name: string;
  category?: string;
  productType?: ProductType;
  unit?: string;
  personalizationEnabled?: boolean;
  description?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
}) => {
  const normalizedDescription = normalizeGeneratedCopy(description);
  const normalizedShort = normalizeGeneratedCopy(shortDescription);
  const normalizedLong = String(longDescription || '')
    .split(/\n+/)
    .map((paragraph) => normalizeGeneratedCopy(paragraph))
    .filter(Boolean)
    .join('\n\n');

  const combinedText = [normalizedDescription, normalizedShort, normalizedLong].join(' ').toLowerCase();
  const shouldUseElegantTemplate =
    !normalizedDescription ||
    GENERATED_DESCRIPTION_GENERIC_MARKERS.some((marker) => combinedText.includes(marker)) ||
    !mentionsProductTitle([normalizedDescription, normalizedShort, normalizedLong].join(' '), name);

  if (shouldUseElegantTemplate) {
    return buildElegantDescriptions({
      name,
      category,
      productType,
      unit,
      personalizationEnabled,
    });
  }

  return {
    description: truncateAtWord(ensureSentenceEnding(normalizedDescription), 320),
    shortDescription: truncateAtWord(
      ensureSentenceEnding(normalizedShort || normalizedDescription),
      140,
    ),
    longDescription: formatLongDescriptionParagraphs(normalizedLong || normalizedDescription),
  };
};

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

type ReferenceProduct = Product & {
  category?: { name: string } | null;
  product_supplies?: Array<{
    quantity: number;
    supply?: { cost_per_unit: number | null } | null;
  }>;
};

interface PriceTierItem {
  min_quantity: number;
  max_quantity: number | null;
  price: number;
}

interface ServiceItemDraft {
  id?: string;
  name: string;
  description: string;
  item_kind: 'item' | 'adicional';
  base_price: number;
}

interface ServiceProductDraft {
  id?: string;
  product_id: string;
  quantity: number;
  notes: string;
}

interface ProductAttributeItem {
  attribute_id: string;
  attribute_name: string;
  values: { id: string; value: string; selected: boolean; price_modifier: number }[];
}

type CopyAttributeSource = {
  attributeName: string;
  value: string;
  priceModifier: number;
};

type FormSnapshot = {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  productSlug: string;
  productType: ProductType;
  categoryId: string;
  unit: string;
  saleUnitPreset: string;
  saleUnitCustom: string;
  isActive: boolean;
  showInCatalog: boolean;
  catalogFeatured: boolean;
  catalogPrice: number | null;
  catalogShortDescription: string;
  catalogLongDescription: string;
  imageUrls: string[];
  baseCost: number;
  laborCost: number;
  expensePercentage: number;
  wastePercentage: number;
  profitMargin: number;
  finalPrice: number;
  pricingMethod: 'margin' | 'multiplier';
  pricingMultiplier: number;
  serviceBasePrice: number;
  stockQuantity: number;
  minStock: number;
  minOrderQuantity: number;
  trackStock: boolean;
  stockControlType: StockControlType;
  promoPrice: number | null;
  promoStartAt: string;
  promoEndAt: string;
  isPublicProduct: boolean;
  isCopyProduct: boolean;
  originalProductId: string | null;
  productOwnerId: string | null;
  productColors: ProductColor[];
  personalizationEnabled: boolean;
  productionTimeDays: number | null;
  productSupplies: Array<{ supply_id: string; quantity: number }>;
  serviceItems: Array<{ name: string; description: string; item_kind: string; base_price: number }>;
  serviceProducts: Array<{ product_id: string; quantity: number; notes: string }>;
  priceTiers: PriceTierItem[];
  productAttributes: Array<{
    attribute_id: string;
    values: Array<{ id: string; selected: boolean; price_modifier: number }>;
  }>;
  unitType?: string; // Legacy field for draft compatibility
};

export default function ProductForm() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [saleUnitPreset, setSaleUnitPreset] = useState<string>(DEFAULT_PRODUCT_SALE_UNIT);
  const [saleUnitCustom, setSaleUnitCustom] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showInCatalog, setShowInCatalog] = useState(false);
  const [catalogFeatured, setCatalogFeatured] = useState(false);
  const [catalogPrice, setCatalogPrice] = useState<number | null>(null);
  const [catalogShortDescription, setCatalogShortDescription] = useState('');
  const [catalogLongDescription, setCatalogLongDescription] = useState('');
  const [productColors, setProductColors] = useState<ProductColor[]>([]);
  const [personalizationEnabled, setPersonalizationEnabled] = useState(false);
  const [productionTimeDays, setProductionTimeDays] = useState<number | null>(null);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [baseCost, setBaseCost] = useState(0);
  const [laborCost, setLaborCost] = useState(0);
  const [expensePercentage, setExpensePercentage] = useState(0);
  const [wastePercentage, setWastePercentage] = useState(0);
  const [profitMargin, setProfitMargin] = useState(30);
  const [finalPrice, setFinalPrice] = useState(0);
  const [finalPriceTouched, setFinalPriceTouched] = useState(false);
  const [pricingMethod, setPricingMethod] = useState<'margin' | 'multiplier'>('margin');
  const [pricingMultiplier, setPricingMultiplier] = useState(2);
  const [serviceBasePrice, setServiceBasePrice] = useState(0);
  const [stockQuantity, setStockQuantity] = useState(0);
  const [minStock, setMinStock] = useState(0);
  const [minOrderQuantity, setMinOrderQuantity] = useState(1);
  const [trackStock, setTrackStock] = useState(true);
  const [stockControlType, setStockControlType] = useState<StockControlType>('none');
  const [promoPrice, setPromoPrice] = useState<number | null>(null);
  const [promoStartAt, setPromoStartAt] = useState<string>('');
  const [promoEndAt, setPromoEndAt] = useState<string>('');
  const [isPublicProduct, setIsPublicProduct] = useState(false);
  const [isCopyProduct, setIsCopyProduct] = useState(false);
  const [originalProductId, setOriginalProductId] = useState<string | null>(null);
  const [productOwnerId, setProductOwnerId] = useState<string | null>(profile?.id || null);
  const [copyingProduct, setCopyingProduct] = useState(false);

  // Related data
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);
  const [availableProducts, setAvailableProducts] = useState<ReferenceProduct[]>([]);
  const [companyExpenses, setCompanyExpenses] = useState<Expense[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  // Category dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState<string>('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Product composition
  const [productSupplies, setProductSupplies] = useState<ProductSupplyItem[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTierItem[]>([]);
  const [productAttributes, setProductAttributes] = useState<ProductAttributeItem[]>([]);
  const [serviceItems, setServiceItems] = useState<ServiceItemDraft[]>([]);
  const [serviceProducts, setServiceProducts] = useState<ServiceProductDraft[]>([]);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const queryPrefillAppliedRef = useRef(false);
  const draftCreatedAtRef = useRef(new Date().toISOString());

  const [errors, setErrors] = useState<Record<string, string>>();
  const currentUserId = profile?.id || null;
  const resolvedSaleUnitType = useMemo(
    () => resolveProductSaleUnit(saleUnitPreset, saleUnitCustom),
    [saleUnitCustom, saleUnitPreset],
  );
  const managesOwnStock = useMemo(
    () => usesDirectProductStock({ track_stock: trackStock, stock_control_type: stockControlType }),
    [stockControlType, trackStock],
  );
  const usesSuppliesStockControl = useMemo(
    () => usesSupplyStock({ track_stock: trackStock, stock_control_type: stockControlType }),
    [stockControlType, trackStock],
  );
  const isProductOwner = !isEditing || (Boolean(currentUserId) && productOwnerId === currentUserId);
  const isReadOnlyPublicProduct = isEditing && isPublicProduct && !isProductOwner;
  const canCreateCopy = isReadOnlyPublicProduct;
  const canControlPublicToggle = isProductOwner;
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

  const selectableServiceProducts = useMemo(
    () => availableProducts.filter((product) => product.id !== id),
    [availableProducts, id],
  );

  const getReferenceProductById = (productId: string) =>
    availableProducts.find((product) => product.id === productId);

  const getReferenceProductSupplyCost = (product?: ReferenceProduct | null) =>
    (product?.product_supplies || []).reduce((acc, item) => {
      const unitCost = Number(item.supply?.cost_per_unit || 0);
      return acc + unitCost * Number(item.quantity || 0);
    }, 0);

  const getReferenceProductCost = (product?: ReferenceProduct | null) => {
    if (!product) return 0;
    return (
      Number(product.base_cost || 0) +
      Number(product.labor_cost || 0) +
      getReferenceProductSupplyCost(product)
    );
  };

  const getReferenceProductPrice = (product?: ReferenceProduct | null) => {
    if (!product) return 0;
    return resolveProductBasePrice(product, 1, [], getReferenceProductSupplyCost(product));
  };


  useEffect(() => {
    setInitialSnapshot(null);
    setDraftReady(false);
  }, [id]);

  useEffect(() => {
    if (!isEditing && currentUserId) {
      setProductOwnerId(currentUserId);
    }
  }, [isEditing, currentUserId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const companyId = company?.id || profile?.company_id || null;
    const [catResult, supResult, attrResult, attrValResult, productsResult, expensesResult, ordersResult, salesResult] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('supplies').select('*').order('name'),
      supabase.from('attributes').select('*').order('name'),
      supabase.from('attribute_values').select('*, attribute:attributes(name)').order('value'),
      (companyId
        ? supabase
          .from('products')
          .select('*, product_supplies(quantity, supply:supplies(cost_per_unit))')
          .eq('company_id', companyId)
          .order('name')
        : supabase
          .from('products')
          .select('*, product_supplies(quantity, supply:supplies(cost_per_unit))')
          .order('name')),
      companyId
        ? supabase.from('expenses').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      companyId
        ? supabase.from('orders').select('id, status').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500)
        : Promise.resolve({ data: [] }),
      companyId
        ? supabase.from('sales').select('id').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500)
        : Promise.resolve({ data: [] }),
    ]);

    setCategories(catResult.data as Category[] || []);
    const mappedSupplies = ((supResult.data as unknown as Supply[]) || []).map((supply) => ({
      ...supply,
      image_url: ensurePublicStorageUrl('product-images', supply.image_url),
    }));
    setSupplies(mappedSupplies);
    setAttributes(attrResult.data as Attribute[] || []);
    setAttributeValues(attrValResult.data as AttributeValue[] || []);
    setAvailableProducts(
      ((productsResult.data as unknown as ReferenceProduct[]) || []).map((product) => ({
        ...product,
        image_url: ensurePublicStorageUrl('product-images', product.image_url),
        image_urls: normalizeProductImages(product.image_urls, product.image_url),
      })),
    );
    setCompanyExpenses((expensesResult.data as Expense[]) || []);

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
      const { data: productData, error } = await supabase
        .from('products')
        .select('*, category:categories(name)')
        .eq('id', id)
        .maybeSingle();

      const product = productData as unknown as ReferenceProduct | null;

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
      if (isProductSaleUnitPreset(product.unit_type)) {
        setSaleUnitPreset(resolveProductSaleUnit(String(product.unit_type || DEFAULT_PRODUCT_SALE_UNIT)));
        setSaleUnitCustom('');
      } else {
        setSaleUnitPreset(CUSTOM_PRODUCT_SALE_UNIT_VALUE);
        setSaleUnitCustom(resolveProductSaleUnit(CUSTOM_PRODUCT_SALE_UNIT_VALUE, product.unit_type || ''));
      }
      setIsActive(Boolean(product.is_active));
      setShowInCatalog(product.catalog_enabled === true || product.show_in_catalog === true);
      setCatalogFeatured(product.catalog_featured ?? false);
      setCatalogPrice(product.catalog_price !== null && product.catalog_price !== undefined ? Number(product.catalog_price) : null);
      setCatalogShortDescription(product.catalog_short_description || '');
      setCatalogLongDescription(product.catalog_long_description || '');
      setProductColors(normalizeProductColors(product.product_colors));
      setPersonalizationEnabled(product.personalization_enabled ?? false);
      setServiceBasePrice(Number(product.service_base_price || 0));
      setProductionTimeDays(
        product.production_time_days !== null && product.production_time_days !== undefined
          ? Math.max(0, Math.trunc(Number(product.production_time_days)))
          : null,
      );
      const normalizedPrimaryImage = ensurePublicStorageUrl('product-images', product.image_url);
      setImageUrls(normalizeProductImages(product.image_urls, normalizedPrimaryImage));
      setBaseCost(Number(product.base_cost));
      setLaborCost(Number(product.labor_cost));
      setExpensePercentage(Number(product.expense_percentage || 0));
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
      setStockControlType(product.stock_control_type as StockControlType || (product.track_stock ? 'simple' : 'none'));
      setPromoPrice(product.promo_price !== null ? Number(product.promo_price) : null);
      setPromoStartAt(product.promo_start_at ? new Date(product.promo_start_at).toISOString().slice(0, 16) : '');
      setPromoEndAt(product.promo_end_at ? new Date(product.promo_end_at).toISOString().slice(0, 16) : '');
      setIsPublicProduct(Boolean(product.is_public));
      setIsCopyProduct(Boolean(product.is_copy));
      setOriginalProductId(product.original_product_id ?? null);
      setProductOwnerId(product.owner_id ?? null);

      // Load product supplies
      const { data: prodSupplies } = await supabase
        .from('product_supplies')
        .select('*, supply:supplies(*)')
        .eq('product_id', id);

      if (prodSupplies) {
        setProductSupplies(prodSupplies.map(ps => ({
          supply_id: ps.supply_id,
          supply: ps.supply as unknown as Supply,
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

      const [{ data: existingServiceItems }, { data: existingServiceProducts }] = await Promise.all([
        supabase
          .from('service_items')
          .select('*')
          .eq('service_product_id', id)
          .order('sort_order'),
        supabase
          .from('service_products')
          .select('*')
          .eq('service_product_id', id)
          .order('sort_order'),
      ]);

      setServiceItems(
        (existingServiceItems || []).map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description || '',
          item_kind: item.item_kind as 'item' | 'adicional',
          base_price: Number(item.base_price || 0),
        })),
      );
      setServiceProducts(
        (existingServiceProducts || []).map((item) => ({
          id: item.id,
          product_id: item.product_id,
          quantity: Number(item.quantity || 1),
          notes: item.notes || '',
        })),
      );
    } else {
      setSaleUnitPreset(DEFAULT_PRODUCT_SALE_UNIT);
      setSaleUnitCustom('');
      setProductColors([]);
      setPersonalizationEnabled(false);
      setImageUrls([]);
      setIsPublicProduct(false);
      setIsCopyProduct(false);
      setOriginalProductId(null);
      setProductOwnerId(currentUserId);
      setServiceBasePrice(0);
      setServiceItems([]);
      setServiceProducts([]);
    }

    setProductAttributes(productAttrSelection);
    setLoading(false);
  }, [id, company?.id, profile?.company_id, isEditing, currentUserId, navigate, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      try {
        const url = await uploadFile(file, 'product-images');
        uploadedUrls.push(url);
      } catch (err) {
        toast({ title: 'Erro ao enviar imagem', description: String(err), variant: 'destructive' });
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
      if (targetUrl.startsWith('/uploads/')) {
        await deleteFile(targetUrl);
      } else {
        const path = getStoragePathFromUrl('product-images', targetUrl);
        if (path) {
          await supabase.storage.from('product-images').remove([path]);
        }
      }
    }
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate costs
  const suppliesCost = productSupplies.reduce((acc, ps) => {
    const supply = supplies.find(s => s.id === ps.supply_id);
    return acc + (supply ? Number(supply.cost_per_unit) * ps.quantity : 0);
  }, 0);

  const serviceLinkedProductsCost = serviceProducts.reduce((acc, item) => {
    const product = getReferenceProductById(item.product_id);
    return acc + getReferenceProductCost(product) * Number(item.quantity || 0);
  }, 0);

  const serviceLinkedProductsValue = serviceProducts.reduce((acc, item) => {
    const product = getReferenceProductById(item.product_id);
    return acc + getReferenceProductPrice(product) * Number(item.quantity || 0);
  }, 0);

  const serviceItemsValue = serviceItems.reduce(
    (acc, item) => acc + Number(item.base_price || 0),
    0,
  );
  const serviceCompositionValue = serviceBasePrice + serviceItemsValue + serviceLinkedProductsValue;
  const totalCost =
    baseCost +
    suppliesCost +
    laborCost +
    (productType === 'servico' ? serviceLinkedProductsCost : 0);
  const costWithWaste = totalCost * (1 + (Number(wastePercentage) || 0) / 100);
  const profitabilityProductId = id || '__draft_product__';
  const currentProductRecord = useMemo<Product>(
    () => ({
      id: profitabilityProductId,
      name: name || 'Produto em edição',
      sku: sku || null,
      barcode: barcode || null,
      description: description || null,
      product_type: productType,
      category_id: categoryId || null,
      company_id: company?.id || profile?.company_id || null,
      owner_id: productOwnerId,
      is_public: isPublicProduct,
      is_copy: isCopyProduct,
      original_product_id: originalProductId,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      unit,
      unit_type: resolvedSaleUnitType,
      is_active: isActive,
      show_in_catalog: showInCatalog,
      catalog_enabled: showInCatalog,
      catalog_featured: catalogFeatured,
      catalog_min_order: minOrderQuantity,
      catalog_price: catalogPrice,
      catalog_short_description: catalogShortDescription || null,
      catalog_long_description: catalogLongDescription || null,
      slug: productSlug || null,
      product_colors: productColors,
      personalization_enabled: personalizationEnabled,
      production_time_days: productionTimeDays,
      service_base_price: serviceBasePrice,
      base_cost: baseCost,
      labor_cost: laborCost,
      expense_percentage: expensePercentage,
      waste_percentage: wastePercentage,
      profit_margin: profitMargin,
      promo_price: promoPrice,
      promo_start_at: promoStartAt || null,
      promo_end_at: promoEndAt || null,
      final_price: finalPrice,
      stock_quantity: managesOwnStock ? stockQuantity : 0,
      min_stock: managesOwnStock ? minStock : 0,
      min_order_quantity: minOrderQuantity,
      track_stock: trackStock,
      created_at: draftCreatedAtRef.current,
      updated_at: draftCreatedAtRef.current,
    }),
    [
      profitabilityProductId,
      name,
      sku,
      barcode,
      description,
      productType,
      categoryId,
      company?.id,
      profile?.company_id,
      productOwnerId,
      isPublicProduct,
      isCopyProduct,
      originalProductId,
      imageUrls,
      unit,
      resolvedSaleUnitType,
      isActive,
      showInCatalog,
      catalogFeatured,
      minOrderQuantity,
      catalogPrice,
      catalogShortDescription,
      catalogLongDescription,
      productSlug,
      productColors,
      personalizationEnabled,
      productionTimeDays,
      serviceBasePrice,
      baseCost,
      laborCost,
      expensePercentage,
      wastePercentage,
      profitMargin,
      promoPrice,
      promoStartAt,
      promoEndAt,
      finalPrice,
      managesOwnStock,
      stockQuantity,
      minStock,
      trackStock,
    ],
  );

  const profitabilityProducts = useMemo(
    () => [
      ...availableProducts.filter((product) => product.id !== profitabilityProductId),
      currentProductRecord,
    ],
    [availableProducts, currentProductRecord, profitabilityProductId],
  );

  const profitabilitySupplies = useMemo<ProductSupply[]>(() => {
    const otherSupplies = availableProducts
      .filter((product) => product.id !== profitabilityProductId)
      .flatMap((product) =>
        (product.product_supplies || []).map((item, index) => ({
          id: `${product.id}-${index}`,
          product_id: product.id,
          supply_id: `supply-${index}`,
          quantity: Number(item.quantity || 0),
          created_at: draftCreatedAtRef.current,
          supply: (item.supply || undefined) as Supply | undefined,
        })),
      );

    const currentSupplies = productSupplies.map((item, index) => ({
      id: `${profitabilityProductId}-current-${index}`,
      product_id: profitabilityProductId,
      supply_id: item.supply_id || `current-supply-${index}`,
      quantity: Number(item.quantity || 0),
      created_at: draftCreatedAtRef.current,
      supply: item.supply,
    }));

    return [...otherSupplies, ...currentSupplies];
  }, [availableProducts, productSupplies, profitabilityProductId]);

  const currentProfitability = useMemo(() => {
    const soldUnitsByProduct = buildSoldUnitsMap({ orderItems, saleItems });
    const rows = buildProductProfitabilityRows({
      products: profitabilityProducts,
      productSupplies: profitabilitySupplies,
      expenses: companyExpenses,
      soldUnitsByProduct,
    });

    return rows.find((row) => row.id === profitabilityProductId) ?? null;
  }, [
    companyExpenses,
    orderItems,
    profitabilityProductId,
    profitabilityProducts,
    profitabilitySupplies,
    saleItems,
  ]);

  const costWithExpenses = currentProfitability?.totalRealCost ?? costWithWaste;

  const safeMargin = Math.min(Number(profitMargin) || 0, 99.9);
  const marginSuggestedPrice = safeMargin > 0 ? costWithExpenses / (1 - safeMargin / 100) : costWithExpenses;

  const markupSimulation = {
    markupSuggested: costWithExpenses > 0 ? marginSuggestedPrice / costWithExpenses : 1
  };

  const multiplierPrice = calculatePriceByMultiplier(costWithExpenses, pricingMultiplier);
  const minPrice = costWithExpenses;

  const autoCalculatedPrice = pricingMethod === 'multiplier' ? multiplierPrice : marginSuggestedPrice;
  const defaultUnitPrice = finalPriceTouched
    ? finalPrice
    : productType === 'servico'
      ? Math.max(autoCalculatedPrice, serviceCompositionValue)
      : autoCalculatedPrice;
  const defaultPriceLabel = finalPriceTouched
    ? 'preço final'
    : productType === 'servico' && serviceCompositionValue > autoCalculatedPrice
      ? 'preço composto do serviço'
      : pricingMethod === 'multiplier'
        ? 'preço por multiplicador'
        : 'preço sugerido';

  const estimatedProfit = Math.max(0, finalPrice - costWithExpenses);
  const realMargin = finalPrice > 0 ? (estimatedProfit / finalPrice) * 100 : 0;
  const suggestedPrice = marginSuggestedPrice;

  const formSnapshot = useMemo(() => ({
    name,
    sku,
    barcode,
    description,
    productSlug,
    productType,
    categoryId,
    unit,
    saleUnitPreset,
    saleUnitCustom,
    isActive,
    showInCatalog,
    catalogFeatured,
    catalogPrice,
    catalogShortDescription,
    catalogLongDescription,
    imageUrls,
    baseCost,
    laborCost,
    expensePercentage,
    wastePercentage,
    profitMargin,
    finalPrice,
    pricingMethod,
    pricingMultiplier,
    serviceBasePrice,
    stockQuantity,
    minStock,
    minOrderQuantity,
    trackStock,
    stockControlType,
    promoPrice,
    promoStartAt,
    promoEndAt,
    isPublicProduct,
    isCopyProduct,
    originalProductId,
    productOwnerId,
    productColors,
    personalizationEnabled,
    productionTimeDays,
    productSupplies: productSupplies.map((ps) => ({
      supply_id: ps.supply_id,
      quantity: ps.quantity,
    })),
    serviceItems: serviceItems.map((item) => ({
      name: item.name,
      description: item.description,
      item_kind: item.item_kind,
      base_price: item.base_price,
    })),
    serviceProducts: serviceProducts.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      notes: item.notes,
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
    saleUnitPreset,
    saleUnitCustom,
    isActive,
    showInCatalog,
    catalogFeatured,
    catalogPrice,
    catalogShortDescription,
    catalogLongDescription,
    imageUrls,
    baseCost,
    laborCost,
    expensePercentage,
    wastePercentage,
    profitMargin,
    finalPrice,
    pricingMethod,
    pricingMultiplier,
    serviceBasePrice,
    stockQuantity,
    minStock,
    minOrderQuantity,
    trackStock,
    stockControlType,
    promoPrice,
    promoStartAt,
    promoEndAt,
    isPublicProduct,
    isCopyProduct,
    originalProductId,
    productOwnerId,
    productColors,
    personalizationEnabled,
    productionTimeDays,
    productSupplies,
    serviceItems,
    serviceProducts,
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
        data?: FormSnapshot;
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
      setSaleUnitPreset(
        draftData.saleUnitPreset ??
        (isProductSaleUnitPreset(draftData.unitType)
          ? resolveProductSaleUnit(draftData.unitType)
          : CUSTOM_PRODUCT_SALE_UNIT_VALUE),
      );
      setSaleUnitCustom(
        draftData.saleUnitCustom ??
        (isProductSaleUnitPreset(draftData.unitType)
          ? ''
          : resolveProductSaleUnit(CUSTOM_PRODUCT_SALE_UNIT_VALUE, draftData.unitType)),
      );
      setIsActive(Boolean(draftData.isActive));
      setShowInCatalog(Boolean(draftData.showInCatalog));
      setCatalogFeatured(Boolean(draftData.catalogFeatured));
      setCatalogPrice(draftData.catalogPrice ?? null);
      setCatalogShortDescription(draftData.catalogShortDescription ?? '');
      setCatalogLongDescription(draftData.catalogLongDescription ?? '');
      setImageUrls(normalizeProductImages(draftData.imageUrls));
      setBaseCost(Number(draftData.baseCost ?? 0));
      setLaborCost(Number(draftData.laborCost ?? 0));
      setExpensePercentage(Number(draftData.expensePercentage ?? 0));
      setWastePercentage(Number(draftData.wastePercentage ?? 0));
      setProfitMargin(Number(draftData.profitMargin ?? 0));
      setFinalPrice(Number(draftData.finalPrice ?? 0));
      setPricingMethod(draftData.pricingMethod === 'multiplier' ? 'multiplier' : 'margin');
      setPricingMultiplier(Number(draftData.pricingMultiplier ?? 2));
      setServiceBasePrice(Number(draftData.serviceBasePrice ?? 0));
      setStockQuantity(Number(draftData.stockQuantity ?? 0));
      setMinStock(Number(draftData.minStock ?? 0));
      setMinOrderQuantity(Number(draftData.minOrderQuantity ?? 1));
      setTrackStock(Boolean(draftData.trackStock));
      setPromoPrice(draftData.promoPrice ?? null);
      setPromoStartAt(draftData.promoStartAt ?? '');
      setPromoEndAt(draftData.promoEndAt ?? '');
      setIsPublicProduct(Boolean(draftData.isPublicProduct));
      setIsCopyProduct(Boolean(draftData.isCopyProduct));
      setOriginalProductId(draftData.originalProductId ?? null);
      setProductOwnerId(draftData.productOwnerId ?? currentUserId);
      setProductColors(normalizeProductColors(draftData.productColors));
      setPersonalizationEnabled(Boolean(draftData.personalizationEnabled));
      setProductionTimeDays(
        draftData.productionTimeDays === null || draftData.productionTimeDays === undefined
          ? null
          : Math.max(0, Math.trunc(Number(draftData.productionTimeDays))),
      );

      if (Array.isArray(draftData.productSupplies)) {
        setProductSupplies(
          draftData.productSupplies.map((ps) => ({
            supply_id: ps.supply_id,
            quantity: Number(ps.quantity ?? 1),
            supply: supplies.find((s) => s.id === ps.supply_id),
          }))
        );
      }

      if (Array.isArray(draftData.serviceItems)) {
        setServiceItems(
          draftData.serviceItems.map((item) => ({
            name: String(item.name || ''),
            description: String(item.description || ''),
            item_kind: item.item_kind === 'adicional' ? 'adicional' : 'item',
            base_price: Number(item.base_price || 0),
          })),
        );
      }

      if (Array.isArray(draftData.serviceProducts)) {
        setServiceProducts(
          draftData.serviceProducts.map((item) => ({
            product_id: String(item.product_id || ''),
            quantity: Number(item.quantity || 1),
            notes: String(item.notes || ''),
          })),
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
        setProductAttributes((prev) => mergeAttributeDraft(prev, draftData.productAttributes as ProductAttributeItem[]));
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
  }, [loading, draftReady, initialSnapshot, draftStorageKey, isEditing, id, supplies, currentUserId]);

  useUnsavedChanges(isDirty && !saving);

  useEffect(() => {
    if (isEditing || queryPrefillAppliedRef.current) return;

    const searchParams = new URLSearchParams(location.search);
    if (!searchParams.toString()) {
      queryPrefillAppliedRef.current = true;
      return;
    }

    const nextBaseCost = searchParams.get('baseCost');
    const nextExpensePercentage = searchParams.get('expensePercentage');
    const nextProfitMargin = searchParams.get('profitMargin');
    const nextFinalPrice = searchParams.get('finalPrice');

    if (nextBaseCost !== null) setBaseCost(Number(nextBaseCost || 0));
    if (nextExpensePercentage !== null) setExpensePercentage(Number(nextExpensePercentage || 0));
    if (nextProfitMargin !== null) setProfitMargin(Number(nextProfitMargin || 0));
    if (nextFinalPrice !== null) {
      setFinalPrice(Number(nextFinalPrice || 0));
      setFinalPriceTouched(true);
    }

    queryPrefillAppliedRef.current = true;
  }, [isEditing, location.search]);

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
      setFinalPrice(defaultUnitPrice);
    }
  }, [defaultUnitPrice, finalPriceTouched]);

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

  const addServiceItem = (kind: 'item' | 'adicional' = 'item') => {
    setServiceItems((prev) => [
      ...prev,
      { name: '', description: '', item_kind: kind, base_price: 0 },
    ]);
  };

  const updateServiceItem = (
    index: number,
    field: keyof ServiceItemDraft,
    value: string | number,
  ) => {
    setServiceItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
            ...item,
            [field]:
              field === 'base_price'
                ? Number(value || 0)
                : value,
          }
          : item,
      ),
    );
  };

  const removeServiceItem = (index: number) => {
    setServiceItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const addServiceProduct = () => {
    setServiceProducts((prev) => [...prev, { product_id: '', quantity: 1, notes: '' }]);
  };

  const updateServiceProduct = (
    index: number,
    field: keyof ServiceProductDraft,
    value: string | number,
  ) => {
    setServiceProducts((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
            ...item,
            [field]: field === 'quantity' ? Number(value || 0) : value,
          }
          : item,
      ),
    );
  };

  const removeServiceProduct = (index: number) => {
    setServiceProducts((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
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
    updated[index] = { ...updated[index], [field]: value } as PriceTierItem;
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
      const selectedCategory = categories.find((item) => item.id === categoryId)?.name;
      const resp = await generateProductDescription({
        name: trimmedName,
        category: selectedCategory,
        productType,
        unit: resolvedSaleUnitType,
        personalizationEnabled,
        existingDescription: description.trim() || undefined,
      });

      const refined = refineGeneratedDescriptions({
        name: trimmedName,
        category: selectedCategory,
        productType,
        unit: resolvedSaleUnitType,
        personalizationEnabled,
        description: resp.description,
        shortDescription: resp.shortDescription,
        longDescription: resp.longDescription,
      });

      setDescription(refined.description);
      setCatalogShortDescription(refined.shortDescription);
      setCatalogLongDescription(refined.longDescription);
      toast({ title: 'Descrições geradas com sucesso' });
    } catch (err) {
      const error = err as { status?: number; message?: string };
      const status = Number(error?.status || 0);
      const extraHelp = status === 401
        ? ' Verifique login/sessão e se a função generate-product-description está deployada no mesmo projeto.'
        : '';
      toast({
        title: 'Erro ao gerar descrição',
        description: `${error?.message || 'Falha na geração com IA.'}${extraHelp}`,
        variant: 'destructive',
      });
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

  const resolveCopyCategoryId = async (categoryName?: string | null) => {
    const normalizedName = String(categoryName || '').trim();
    if (!normalizedName) return null;

    const { data: existingCategory, error: existingError } = await supabase
      .from('categories')
      .select('id')
      .eq('name', normalizedName)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingCategory?.id) {
      return existingCategory.id as string;
    }

    const { data: createdCategory, error: createError } = await supabase
      .from('categories')
      .insert({ name: normalizedName, parent_id: null })
      .select('id')
      .single();

    if (createError) {
      throw createError;
    }

    return createdCategory.id as string;
  };

  const copyPublicAttributesToCompany = async (
    targetProductId: string,
    sourceAttributes: CopyAttributeSource[],
  ) => {
    if (!sourceAttributes.length) return;

    const normalizedAttributes = sourceAttributes
      .map((item) => ({
        attributeName: item.attributeName.trim(),
        value: item.value.trim(),
        priceModifier: Number(item.priceModifier || 0),
      }))
      .filter((item) => item.attributeName && item.value);

    if (!normalizedAttributes.length) return;

    const uniqueAttributeNames = Array.from(
      new Set(normalizedAttributes.map((item) => item.attributeName))
    );

    const { data: existingAttributes, error: existingAttributesError } = await supabase
      .from('attributes')
      .select('id, name')
      .in('name', uniqueAttributeNames);

    if (existingAttributesError) {
      throw existingAttributesError;
    }

    const attributeIdByName = new Map<string, string>();
    (existingAttributes || []).forEach((row) => {
      attributeIdByName.set(String(row.name).toLowerCase(), row.id);
    });

    const missingAttributeNames = uniqueAttributeNames.filter(
      (name) => !attributeIdByName.has(name.toLowerCase())
    );

    if (missingAttributeNames.length > 0) {
      const { data: createdAttributes, error: createAttributesError } = await supabase
        .from('attributes')
        .insert(missingAttributeNames.map((name) => ({ name })))
        .select('id, name');

      if (createAttributesError) {
        throw createAttributesError;
      }

      (createdAttributes || []).forEach((row) => {
        attributeIdByName.set(String(row.name).toLowerCase(), row.id);
      });
    }

    const targetAttributeIds = Array.from(attributeIdByName.values());
    if (!targetAttributeIds.length) return;

    const { data: existingValues, error: existingValuesError } = await supabase
      .from('attribute_values')
      .select('id, attribute_id, value')
      .in('attribute_id', targetAttributeIds);

    if (existingValuesError) {
      throw existingValuesError;
    }

    const valueIdByKey = new Map<string, string>();
    (existingValues || []).forEach((row) => {
      const key = `${row.attribute_id}::${String(row.value).toLowerCase()}`;
      valueIdByKey.set(key, row.id);
    });

    const valuesToCreate = normalizedAttributes
      .map((item) => {
        const attributeId = attributeIdByName.get(item.attributeName.toLowerCase());
        if (!attributeId) return null;
        const key = `${attributeId}::${item.value.toLowerCase()}`;
        if (valueIdByKey.has(key)) return null;
        return { attribute_id: attributeId, value: item.value, key };
      })
      .filter((item): item is { attribute_id: string; value: string; key: string } => Boolean(item));

    const dedupedValuesToCreate = Array.from(
      new Map(valuesToCreate.map((item) => [item.key, item])).values()
    );

    if (dedupedValuesToCreate.length > 0) {
      const { data: createdValues, error: createValuesError } = await supabase
        .from('attribute_values')
        .insert(dedupedValuesToCreate.map((item) => ({
          attribute_id: item.attribute_id,
          value: item.value,
        })))
        .select('id, attribute_id, value');

      if (createValuesError) {
        throw createValuesError;
      }

      (createdValues || []).forEach((row) => {
        const key = `${row.attribute_id}::${String(row.value).toLowerCase()}`;
        valueIdByKey.set(key, row.id);
      });
    }

    const productAttributesRows = normalizedAttributes
      .map((item) => {
        const attributeId = attributeIdByName.get(item.attributeName.toLowerCase());
        if (!attributeId) return null;
        const valueId = valueIdByKey.get(`${attributeId}::${item.value.toLowerCase()}`);
        if (!valueId) return null;
        return {
          product_id: targetProductId,
          attribute_value_id: valueId,
          price_modifier: item.priceModifier,
        };
      })
      .filter((item): item is { product_id: string; attribute_value_id: string; price_modifier: number } => Boolean(item));

    const dedupedProductAttributes = Array.from(
      new Map(
        productAttributesRows.map((row) => [
          `${row.attribute_value_id}::${row.price_modifier}`,
          row,
        ])
      ).values()
    );

    if (dedupedProductAttributes.length > 0) {
      const { error: insertAttributesError } = await supabase
        .from('product_attributes')
        .insert(dedupedProductAttributes);

      if (insertAttributesError) {
        throw insertAttributesError;
      }
    }
  };

  const handleCreateCopy = async () => {
    if (!id || !profile?.company_id || !currentUserId) {
      toast({ title: 'Sessão inválida para copiar produto', variant: 'destructive' });
      return;
    }

    setCopyingProduct(true);
    try {
      const { data: sourceProductData, error: sourceProductError } = await supabase
        .from('products')
        .select('*, category:categories(name)')
        .eq('id', id)
        .maybeSingle();

      const sourceProduct = sourceProductData as unknown as ReferenceProduct | null;

      if (sourceProductError || !sourceProduct) {
        throw sourceProductError || new Error('Produto de origem não encontrado.');
      }

      const sourceCategoryName = sourceProduct.category?.name;
      const targetCategoryId = await resolveCopyCategoryId(sourceCategoryName);

      const baseName = String(sourceProduct.name || 'Produto').trim();
      const copySuffix = ' (Copia)';
      const safeBaseName = baseName.slice(0, Math.max(0, 100 - copySuffix.length)).trim() || 'Produto';
      const copyName = `${safeBaseName}${copySuffix}`;
      const normalizedImageUrls = normalizeProductImages(
        sourceProduct.image_urls,
        sourceProduct.image_url,
      );
      const primaryImageUrl = normalizedImageUrls[0] ?? null;

      const copyPayload = {
        name: copyName,
        sku: null,
        barcode: null,
        description: sourceProduct.description || null,
        slug: generateSlug(copyName),
        product_type: sourceProduct.product_type as ProductType,
        category_id: targetCategoryId,
        company_id: profile.company_id,
        owner_id: currentUserId,
        is_public: false,
        is_copy: true,
        original_product_id: sourceProduct.id,
        image_url: primaryImageUrl,
        image_urls: normalizedImageUrls,
        show_in_catalog: false,
        catalog_enabled: false,
        catalog_featured: false,
        catalog_price: sourceProduct.catalog_price ?? null,
        catalog_short_description: sourceProduct.catalog_short_description ?? null,
        catalog_long_description: sourceProduct.catalog_long_description ?? null,
        catalog_min_order: sourceProduct.catalog_min_order ?? sourceProduct.min_order_quantity ?? 1,
        product_colors: (sourceProduct.product_colors ?? []) as unknown as Record<string, unknown>[],
        personalization_enabled: sourceProduct.personalization_enabled ?? false,
        production_time_days: sourceProduct.production_time_days ?? null,
        unit: sourceProduct.unit || 'un',
        unit_type: resolveProductSaleUnit(
          isProductSaleUnitPreset(sourceProduct.unit_type)
            ? String(sourceProduct.unit_type || DEFAULT_PRODUCT_SALE_UNIT)
            : CUSTOM_PRODUCT_SALE_UNIT_VALUE,
          sourceProduct.unit_type || '',
        ),
        is_active: Boolean(sourceProduct.is_active),
        base_cost: Number(sourceProduct.base_cost || 0),
        labor_cost: Number(sourceProduct.labor_cost || 0),
        expense_percentage: Number(sourceProduct.expense_percentage || 0),
        waste_percentage: Number(sourceProduct.waste_percentage || 0),
        profit_margin: Number(sourceProduct.profit_margin || 0),
        final_price: sourceProduct.final_price !== null ? Number(sourceProduct.final_price) : null,
        stock_quantity: Number(sourceProduct.stock_quantity || 0),
        min_stock: Number(sourceProduct.min_stock || 0),
        min_order_quantity: Number(sourceProduct.min_order_quantity || 1),
        track_stock: Boolean(sourceProduct.track_stock),
        promo_price: sourceProduct.promo_price !== null ? Number(sourceProduct.promo_price) : null,
        promo_start_at: sourceProduct.promo_start_at || null,
        promo_end_at: sourceProduct.promo_end_at || null,
      };

      const { data: createdProduct, error: createProductError } = await supabase
        .from('products')
        .insert(copyPayload as any)
        .select('id')
        .single();

      if (createProductError || !createdProduct) {
        throw createProductError || new Error('Falha ao criar cópia do produto.');
      }

      const copiedProductId = createdProduct.id as string;

      const { data: sourceTiers, error: sourceTiersError } = await supabase
        .from('price_tiers')
        .select('min_quantity, max_quantity, price')
        .eq('product_id', sourceProduct.id);

      if (sourceTiersError) {
        throw sourceTiersError;
      }

      if (sourceTiers && sourceTiers.length > 0) {
        const { error: insertTiersError } = await supabase
          .from('price_tiers')
          .insert(sourceTiers.map((tier) => ({
            product_id: copiedProductId,
            min_quantity: tier.min_quantity,
            max_quantity: tier.max_quantity,
            price: tier.price,
          })));

        if (insertTiersError) {
          throw insertTiersError;
        }
      }

      const { data: sourceAttributeRows, error: sourceAttributesError } = await supabase
        .from('product_attributes')
        .select('price_modifier, attribute_value:attribute_values(value, attribute:attributes(name))')
        .eq('product_id', sourceProduct.id);

      if (sourceAttributesError) {
        throw sourceAttributesError;
      }

      const sourceAttributes: CopyAttributeSource[] = (sourceAttributeRows || [])
        .map((row) => {
          const attributeValue = Array.isArray(row.attribute_value)
            ? row.attribute_value[0]
            : row.attribute_value;
          const attribute = Array.isArray(attributeValue?.attribute)
            ? attributeValue.attribute[0]
            : attributeValue?.attribute;
          const attributeName = String(attribute?.name || '').trim();
          const value = String(attributeValue?.value || '').trim();
          if (!attributeName || !value) return null;
          return {
            attributeName,
            value,
            priceModifier: Number(row.price_modifier || 0),
          };
        })
        .filter((item): item is CopyAttributeSource => Boolean(item));

      await copyPublicAttributesToCompany(copiedProductId, sourceAttributes);

      toast({ title: 'Cópia criada com sucesso!' });
      navigate(`/produtos/${copiedProductId}`);
    } catch (err) {
      const error = err as { message?: string };
      toast({
        title: 'Erro ao criar cópia',
        description: error?.message || 'Não foi possível copiar o produto público.',
        variant: 'destructive',
      });
    } finally {
      setCopyingProduct(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (isReadOnlyPublicProduct) {
      toast({
        title: 'Produto público em modo visualização',
        description: 'Crie uma cópia para sua loja antes de editar.',
        variant: 'destructive',
      });
      return;
    }
    if (!currentUserId) {
      toast({ title: 'Sessão inválida. Faça login novamente.', variant: 'destructive' });
      return;
    }

    const normalizedSku = normalizeSku(sku);
    const normalizedBarcode = normalizeBarcodeValue(barcode);

    const normalizedSlug = generateSlug((slugTouched ? productSlug : name).trim() || name.trim());
    const normalizedColors = productColors.map((color) => ({
      name: color.name.trim(),
      hex: color.hex.trim(),
      active: color.active,
    }));
    const normalizedProductionTimeDays =
      productionTimeDays === null || Number.isNaN(Number(productionTimeDays))
        ? null
        : Math.max(0, Math.trunc(Number(productionTimeDays)));
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
      owner_id: currentUserId,
      is_public: isPublicProduct,
      is_copy: isCopyProduct,
      original_product_id: isCopyProduct ? originalProductId : null,
      image_url: primaryImageUrl,
      image_urls: normalizedImageUrls,
      show_in_catalog: showInCatalog,
      catalog_enabled: showInCatalog,
      catalog_featured: catalogFeatured,
      catalog_price: catalogPrice ?? null,
      catalog_short_description: catalogShortDescription.trim() || null,
      catalog_long_description: catalogLongDescription.trim() || null,
      catalog_min_order: minOrderQuantity,
      product_colors: normalizedColors as unknown as Record<string, unknown>[],
      personalization_enabled: personalizationEnabled,
      production_time_days: normalizedProductionTimeDays,
      unit,
      unit_type: resolvedSaleUnitType,
      is_active: isActive,
      base_cost: baseCost,
      labor_cost: laborCost,
      service_base_price: productType === 'servico' ? serviceBasePrice : 0,
      expense_percentage: expensePercentage,
      waste_percentage: wastePercentage,
      profit_margin: profitMargin,
      final_price: finalPrice,
      stock_quantity: managesOwnStock ? stockQuantity : 0,
      min_stock: managesOwnStock ? minStock : 0,
      min_order_quantity: minOrderQuantity,
      track_stock: trackStock,
      stock_control_type: stockControlType,
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
        .update(formData as any)
        .eq('id', id);

      if (error) {
        if (error.code === '23505') {
          const message = String(error.message || error.details || '').toLowerCase();
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
        supabase.from('service_items').delete().eq('service_product_id', id),
        supabase.from('service_products').delete().eq('service_product_id', id),
      ]);
    } else {
      // Insert product
      const { data: product, error } = await supabase
        .from('products')
        .insert(formData as any)
        .select()
        .single();

      if (error || !product) {
        if (error?.code === '23505') {
          const message = String(error?.message || error?.details || '').toLowerCase();
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

    if (productType === 'servico' && productId && profile?.company_id) {
      const normalizedServiceItems = serviceItems
        .map((item, index) => ({
          company_id: profile.company_id,
          service_product_id: productId,
          name: item.name.trim(),
          description: item.description.trim() || null,
          item_kind: item.item_kind,
          base_price: Number(item.base_price || 0),
          sort_order: index,
        }))
        .filter((item) => item.name);

      const normalizedServiceProducts = serviceProducts
        .map((item, index) => ({
          company_id: profile.company_id,
          service_product_id: productId,
          product_id: item.product_id,
          quantity: Math.max(Number(item.quantity || 0), 0),
          notes: item.notes.trim() || null,
          sort_order: index,
        }))
        .filter((item) => item.product_id && item.quantity > 0);

      if (normalizedServiceItems.length > 0) {
        await supabase.from('service_items').insert(normalizedServiceItems);
      }

      if (normalizedServiceProducts.length > 0) {
        await supabase.from('service_products').insert(normalizedServiceProducts);
      }
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {isPublicProduct && (
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200">
                  Público
                </Badge>
              )}
              {isCopyProduct && (
                <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100 border-violet-200">
                  Cópia de produto público
                </Badge>
              )}
            </div>
          </div>
        </div>
        {isEditing && (
          <Button
            variant="outline"
            onClick={() => {
              const url = company?.slug
                ? `/catalogo/${company.slug}/produto/${productSlug || id}`
                : `/catalogo/produto/${productSlug || id}`;
              window.open(url, '_blank');
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Ver no Catálogo
          </Button>
        )}
      </div>

      {isReadOnlyPublicProduct && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                Este é um produto público. Para editar, crie uma cópia para sua loja.
              </p>
            </div>
            {canCreateCopy && (
              <Button
                type="button"
                onClick={handleCreateCopy}
                disabled={copyingProduct}
                className="w-full md:w-auto"
              >
                {copyingProduct ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CopyPlus className="mr-2 h-4 w-4" />
                )}
                Criar cópia para minha loja
              </Button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={isReadOnlyPublicProduct ? 'pointer-events-none select-none opacity-95' : ''}>
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
                          <SelectTrigger className="w-full sm:w-[140px]">
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
                        <div className="flex flex-col items-center gap-0.5 rounded-lg border bg-white px-4 py-1.5">
                          <BarcodeSvg
                            value={normalizedBarcodePreview}
                            format={resolvedBarcodeFormat}
                            height={30}
                            moduleWidth={resolvedBarcodeFormat === 'ean13' ? 1.35 : 1.1}
                            className="mx-auto w-full max-w-[320px]"
                          />
                          <span className="text-xs font-medium text-foreground tracking-[0.22em]">
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
                    <Switch
                      checked={isActive}
                      onCheckedChange={setIsActive}
                    />
                    <Label>Produto ativo</Label>
                  </div>

                  <div className="flex items-center gap-3 pt-6">
                    <Switch
                      checked={showInCatalog}
                      onCheckedChange={setShowInCatalog}
                    />
                    <Label className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Exibir no catálogo público
                    </Label>
                  </div>

                  {canControlPublicToggle && (
                    <div className="md:col-span-2 rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={isPublicProduct}
                          onCheckedChange={setIsPublicProduct}
                          disabled={isCopyProduct}
                        />
                        <Label>Tornar este produto público (Disponível para todos os usuários)</Label>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Outros usuários poderão visualizar este produto e criar uma cópia para suas lojas. Eles não poderão editar o original.
                      </p>
                      {isCopyProduct && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Cópias de produto público não podem ser publicadas como produto compartilhado.
                        </p>
                      )}
                    </div>
                  )}

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

                  <div className="md:col-span-2 space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">Produto personalizado</Label>
                        <p className="text-xs text-muted-foreground">
                          Quando ativo, o cliente pode anexar opcionalmente a arte/modelo no pedido do catálogo (JPG, PNG, WEBP ou PDF).
                        </p>
                      </div>
                      <Switch checked={personalizationEnabled} onCheckedChange={setPersonalizationEnabled} />
                    </div>

                    {(productType === 'confeccionado' || personalizationEnabled) && (
                      <div className="space-y-2">
                        <Label htmlFor="productionTimeDays">Tempo de produção (dias uteis)</Label>
                        <Input
                          id="productionTimeDays"
                          type="number"
                          min={0}
                          step={1}
                          value={productionTimeDays ?? ''}
                          onChange={(event) => {
                            const rawValue = event.target.value;
                            setProductionTimeDays(
                              rawValue === '' ? null : Math.max(0, Math.trunc(Number(rawValue) || 0)),
                            );
                          }}
                          className={errors?.production_time_days ? 'border-destructive' : ''}
                          placeholder="Ex.: 3"
                        />
                        {errors?.production_time_days ? (
                          <p className="text-xs text-destructive">{errors.production_time_days}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Defina em dias uteis. Esse prazo sera exibido no catalogo e no pedido.
                          </p>
                        )}
                      </div>
                    )}
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
                  <div className="grid gap-4 md:grid-cols-5">
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
                      <Label htmlFor="expensePercentage">Despesas aplicadas (%)</Label>
                      <Input
                        id="expensePercentage"
                        type="number"
                        step="0.1"
                        min="0"
                        value={expensePercentage}
                        onChange={(e) => setExpensePercentage(parseFloat(e.target.value) || 0)}
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

                  <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-base">Método de precificação</Label>
                        <p className="text-sm text-muted-foreground">
                          Escolha entre margem tradicional ou multiplicador, sem perder o preço manual.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={pricingMethod === 'margin' ? 'default' : 'outline'}
                          onClick={() => {
                            setPricingMethod('margin');
                            setFinalPriceTouched(false);
                          }}
                        >
                          Margem %
                        </Button>
                        <Button
                          type="button"
                          variant={pricingMethod === 'multiplier' ? 'default' : 'outline'}
                          onClick={() => {
                            setPricingMethod('multiplier');
                            setFinalPriceTouched(false);
                          }}
                        >
                          Multiplicador
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pricingMultiplier">Multiplicador</Label>
                      <Input
                        id="pricingMultiplier"
                        type="number"
                        step="0.01"
                        min="0"
                        value={pricingMultiplier}
                        onChange={(e) => setPricingMultiplier(parseFloat(e.target.value) || 0)}
                        disabled={pricingMethod !== 'multiplier'}
                      />
                    </div>
                  </div>

                  {productType === 'servico' && (
                    <>
                      <Separator />
                      <Card className="border-primary/20 bg-primary/5">
                        <CardHeader>
                          <CardTitle>Composição do serviço</CardTitle>
                          <CardDescription>
                            Monte o valor do serviço com valor base, produtos utilizados e itens adicionais.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                            <div className="space-y-2">
                              <Label htmlFor="serviceBasePrice">Valor base do serviço</Label>
                              <CurrencyInput
                                id="serviceBasePrice"
                                value={serviceBasePrice}
                                onChange={(value) => setServiceBasePrice(value)}
                              />
                            </div>
                            <div className="rounded-lg border bg-background/80 p-4">
                              <p className="text-sm font-medium">Como o total é calculado</p>
                              <p className="mt-2 text-sm text-muted-foreground">
                                O sistema soma o valor base do serviço, os produtos vinculados e os itens adicionais.
                                Se a precificação por custo resultar em um valor maior, ele será usado como referência.
                              </p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-base">Produtos utilizados</Label>
                                <p className="text-sm text-muted-foreground">
                                  Produtos da loja que entram no serviço composto.
                                </p>
                              </div>
                              <Button type="button" variant="outline" size="sm" onClick={addServiceProduct}>
                                <Plus className="mr-1 h-4 w-4" />
                                Adicionar produto
                              </Button>
                            </div>

                            {serviceProducts.length > 0 ? (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Produto</TableHead>
                                    <TableHead className="w-24">Qtd.</TableHead>
                                    <TableHead className="w-32">Valor ref.</TableHead>
                                    <TableHead className="w-32">Subtotal</TableHead>
                                    <TableHead>Observações</TableHead>
                                    <TableHead className="w-16" />
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {serviceProducts.map((item, index) => {
                                    const linkedProduct = getReferenceProductById(item.product_id);
                                    const unitValue = getReferenceProductPrice(linkedProduct);
                                    const subtotal = unitValue * Number(item.quantity || 0);

                                    return (
                                      <TableRow key={`${item.product_id}-${index}`}>
                                        <TableCell>
                                          <Select
                                            value={item.product_id}
                                            onValueChange={(value) => updateServiceProduct(index, 'product_id', value)}
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Selecione um produto..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {selectableServiceProducts.map((product) => (
                                                <SelectItem key={product.id} value={product.id}>
                                                  {product.name}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </TableCell>
                                        <TableCell>
                                          <Input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={item.quantity}
                                            onChange={(event) =>
                                              updateServiceProduct(index, 'quantity', event.target.value)
                                            }
                                          />
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                          {linkedProduct ? formatCurrency(unitValue) : '-'}
                                        </TableCell>
                                        <TableCell className="font-medium text-primary">
                                          {formatCurrency(subtotal)}
                                        </TableCell>
                                        <TableCell>
                                          <Input
                                            value={item.notes}
                                            onChange={(event) =>
                                              updateServiceProduct(index, 'notes', event.target.value)
                                            }
                                            placeholder="Opcional"
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeServiceProduct(index)}
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            ) : (
                              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                Nenhum produto vinculado ao serviço.
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-base">Itens e serviços adicionais</Label>
                                <p className="text-sm text-muted-foreground">
                                  Exemplo: logo, cartão, capa para redes sociais, revisão extra.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => addServiceItem('item')}>
                                  <Plus className="mr-1 h-4 w-4" />
                                  Adicionar item
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addServiceItem('adicional')}
                                >
                                  <Plus className="mr-1 h-4 w-4" />
                                  Adicional
                                </Button>
                              </div>
                            </div>

                            {serviceItems.length > 0 ? (
                              <div className="space-y-3">
                                {serviceItems.map((item, index) => (
                                  <div key={`${item.name}-${index}`} className="grid gap-3 rounded-lg border bg-background/80 p-4 md:grid-cols-[180px_minmax(0,1fr)_180px_48px]">
                                    <div className="space-y-2">
                                      <Label>Tipo</Label>
                                      <Select
                                        value={item.item_kind}
                                        onValueChange={(value) =>
                                          updateServiceItem(index, 'item_kind', value as 'item' | 'adicional')
                                        }
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="item">Item incluso</SelectItem>
                                          <SelectItem value="adicional">Serviço adicional</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Nome</Label>
                                      <Input
                                        value={item.name}
                                        onChange={(event) => updateServiceItem(index, 'name', event.target.value)}
                                        placeholder="Ex.: Cartão de visita"
                                      />
                                      <Textarea
                                        value={item.description}
                                        onChange={(event) =>
                                          updateServiceItem(index, 'description', event.target.value)
                                        }
                                        placeholder="Descrição opcional"
                                        rows={2}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Valor</Label>
                                      <CurrencyInput
                                        value={item.base_price}
                                        onChange={(value) => updateServiceItem(index, 'base_price', value)}
                                      />
                                    </div>
                                    <div className="flex items-end">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeServiceItem(index)}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                Nenhum item adicional configurado.
                              </div>
                            )}
                          </div>

                          <div className="grid gap-3 md:grid-cols-4">
                            <div className="rounded-lg border bg-background p-4">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor base</p>
                              <p className="mt-2 text-lg font-semibold">{formatCurrency(serviceBasePrice)}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-4">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Produtos vinculados</p>
                              <p className="mt-2 text-lg font-semibold">{formatCurrency(serviceLinkedProductsValue)}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-4">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Itens adicionais</p>
                              <p className="mt-2 text-lg font-semibold">{formatCurrency(serviceItemsValue)}</p>
                            </div>
                            <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total composto</p>
                              <p className="mt-2 text-lg font-semibold text-primary">
                                {formatCurrency(serviceCompositionValue)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}

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
                    <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-6">
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
                      {productType === 'servico' && (
                        <div className="p-2 rounded bg-background">
                          <span className="text-muted-foreground text-xs block">Produtos do serviço</span>
                          <span className="font-medium">{formatCurrency(serviceLinkedProductsCost)}</span>
                        </div>
                      )}
                      <div className="p-2 rounded bg-background">
                        <span className="text-muted-foreground text-xs block">Custo Total</span>
                        <span className="font-medium">{formatCurrency(totalCost)}</span>
                      </div>
                      <div className="p-2 rounded bg-background">
                        <span className="text-muted-foreground text-xs block">+ Desperdício ({wastePercentage}%)</span>
                        <span className="font-medium text-chart-4">{formatCurrency(costWithWaste)}</span>
                      </div>
                      <div className="p-2 rounded bg-background border-l-2 border-primary/50">
                        <span className="text-primary text-xs font-semibold block">Custo c/ Despesas</span>
                        <span className="font-bold text-primary">{formatCurrency(costWithExpenses)}</span>
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded bg-background p-3">
                        <span className="text-xs text-muted-foreground">Preço mínimo (10%)</span>
                        <p className="mt-2 font-semibold text-chart-4">{formatCurrency(minPrice)}</p>
                      </div>
                      <div className="rounded bg-background p-3">
                        <span className="text-xs text-muted-foreground">Preço por margem</span>
                        <p className="mt-2 font-semibold text-chart-2">{formatCurrency(suggestedPrice)}</p>
                      </div>
                      <div className="rounded bg-background p-3">
                        <span className="text-xs text-muted-foreground">Markup sugerido</span>
                        <p className="mt-2 font-semibold">{markupSimulation.markupSuggested.toFixed(2)}x</p>
                      </div>
                      <div className="rounded bg-background p-3">
                        <span className="text-xs text-muted-foreground">Preço por multiplicador</span>
                        <p className="mt-2 font-semibold">{formatCurrency(multiplierPrice)}</p>
                      </div>
                      {productType === 'servico' && (
                        <div className="rounded bg-background p-3">
                          <span className="text-xs text-muted-foreground">Total composto do serviço</span>
                          <p className="mt-2 font-semibold text-primary">
                            {formatCurrency(serviceCompositionValue)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_200px] items-end">
                    <div>
                      <Label htmlFor="final-price">Preço final do produto</Label>
                      <p className="text-xs text-muted-foreground">
                        Usado nos pedidos e no catálogo. Você pode alterar manualmente a qualquer momento.
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
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-background p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Lucro estimado</p>
                      <p className="mt-2 text-lg font-semibold">{formatCurrency(estimatedProfit)}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Margem real</p>
                      <p className="mt-2 text-lg font-semibold">{realMargin.toFixed(2)}%</p>
                    </div>
                    <div className="rounded-lg border bg-background p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Método ativo</p>
                      <p className="mt-2 text-lg font-semibold">
                        {pricingMethod === 'multiplier' ? 'Multiplicador' : 'Margem %'}
                      </p>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Lucro real e rateio de despesas</h4>
                      <p className="text-xs text-muted-foreground">
                        Considera custo de insumos, despesas variáveis e rateio automático das despesas fixas da empresa.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border bg-background p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Custo direto</p>
                        <p className="mt-2 text-lg font-semibold">
                          {formatCurrency(currentProfitability?.directCost ?? costWithWaste)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Rateio despesas fixas</p>
                        <p className="mt-2 text-lg font-semibold">
                          {formatCurrency(currentProfitability?.fixedAllocation ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Despesas variáveis</p>
                        <p className="mt-2 text-lg font-semibold">
                          {formatCurrency(currentProfitability?.variableShare ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Custo total real</p>
                        <p className="mt-2 text-lg font-semibold">
                          {formatCurrency(currentProfitability?.totalRealCost ?? costWithWaste)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Lucro por unidade</p>
                        <p className="mt-2 text-lg font-semibold">
                          {formatCurrency(currentProfitability?.profitPerUnit ?? estimatedProfit)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Margem de lucro real</p>
                        <p className="mt-2 text-lg font-semibold">
                          {(currentProfitability?.marginPct ?? realMargin).toFixed(2)}%
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Qtd. vendida usada no rateio</p>
                        <p className="mt-2 text-lg font-semibold">
                          {Math.round(currentProfitability?.soldUnits ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Preço considerado</p>
                        <p className="mt-2 text-lg font-semibold">
                          {formatCurrency(currentProfitability?.salePrice ?? finalPrice)}
                        </p>
                      </div>
                    </div>
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
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <div className="md:col-span-2 space-y-4">
                    <Label className="text-base font-semibold">Tipo de Controle de Estoque</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div
                        onClick={() => {
                          setStockControlType('none');
                          setTrackStock(false);
                        }}
                        className={cn(
                          "cursor-pointer rounded-xl border-2 p-4 transition-all hover:border-primary/50 flex flex-col items-center text-center gap-2",
                          stockControlType === 'none' ? "border-primary bg-primary/5" : "border-muted bg-card"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-full",
                          stockControlType === 'none' ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          <PackageX className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-sm">Não controla</p>
                          <p className="text-xs text-muted-foreground leading-tight">
                            Ideal para serviços ou produtos digitais sem estoque físico.
                          </p>
                        </div>
                      </div>

                      <div
                        onClick={() => {
                          setStockControlType('simple');
                          setTrackStock(true);
                        }}
                        className={cn(
                          "cursor-pointer rounded-xl border-2 p-4 transition-all hover:border-primary/50 flex flex-col items-center text-center gap-2",
                          stockControlType === 'simple' ? "border-primary bg-primary/5" : "border-muted bg-card"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-full",
                          stockControlType === 'simple' ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          <Package className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-sm">Simples</p>
                          <p className="text-xs text-muted-foreground leading-tight">
                            Baixa direta do estoque do próprio produto em cada venda.
                          </p>
                        </div>
                      </div>

                      <div
                        onClick={() => {
                          setStockControlType('composition');
                          setTrackStock(true);
                        }}
                        className={cn(
                          "cursor-pointer rounded-xl border-2 p-4 transition-all hover:border-primary/50 flex flex-col items-center text-center gap-2",
                          stockControlType === 'composition' ? "border-primary bg-primary/5" : "border-muted bg-card"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-full",
                          stockControlType === 'composition' ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          <Layers className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-sm">Insumos usados</p>
                          <p className="text-xs text-muted-foreground leading-tight">
                            Baixa os insumos (materiais) cadastrados em cada venda realizada.
                          </p>
                        </div>
                      </div>
                    </div>
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
                    <Label htmlFor="saleUnitType">Unidade de venda *</Label>
                    <Select
                      value={saleUnitPreset}
                      onValueChange={(value) => {
                        setSaleUnitPreset(value);
                        if (value !== CUSTOM_PRODUCT_SALE_UNIT_VALUE) {
                          setErrors((prev) => {
                            if (!prev?.unit_type) return prev;
                            const next = { ...(prev || {}) };
                            delete next.unit_type;
                            return next;
                          });
                        }
                      }}
                    >
                      <SelectTrigger id="saleUnitType" className={errors?.unit_type ? 'border-destructive' : ''}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_SALE_UNIT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_PRODUCT_SALE_UNIT_VALUE}>Outro (personalizado)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      O catálogo exibirá o preço como por {getProductSaleUnitLabel(resolvedSaleUnitType || DEFAULT_PRODUCT_SALE_UNIT)}.
                    </p>
                    {errors?.unit_type && (
                      <p className="text-xs text-destructive">{errors.unit_type}</p>
                    )}
                  </div>

                  {saleUnitPreset === CUSTOM_PRODUCT_SALE_UNIT_VALUE && (
                    <div className="space-y-2">
                      <Label htmlFor="saleUnitCustom">Unidade personalizada *</Label>
                      <Input
                        id="saleUnitCustom"
                        value={saleUnitCustom}
                        onChange={(e) => setSaleUnitCustom(e.target.value)}
                        placeholder="Ex.: bloco, pacote com 50, dúzia"
                        className={errors?.unit_type ? 'border-destructive' : ''}
                      />
                      <p className="text-xs text-muted-foreground">
                        Informe como o produto será vendido para o cliente.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="minOrderQuantity">Quantidade mínima para pedido no catálogo</Label>
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

                  {managesOwnStock ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="stockQuantity">Quantidade em Estoque</Label>
                        <Input
                          id="stockQuantity"
                          type="number"
                          step="0.01"
                          min="0"
                          value={stockQuantity}
                          onChange={(e) => setStockQuantity(parseFloat(e.target.value) || 0)}
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
                        />
                      </div>
                    </>
                  ) : (
                    <div className="md:col-span-2 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                      {usesSuppliesStockControl
                        ? 'Este produto não usa estoque próprio. A baixa será feita apenas nos insumos cadastrados.'
                        : 'Este produto não terá controle de estoque próprio.'}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/produtos')}>
            Cancelar
          </Button>
          {!isReadOnlyPublicProduct && (
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Salvar Produto
            </Button>
          )}
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




