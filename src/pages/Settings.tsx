import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Building2,
  Upload,
  Loader2,
  MapPin,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  Copy,
  Check,
  Palette,
  LayoutGrid,
  List,
  Settings as SettingsIcon,
  MessageCircle,
  Gift,
  Monitor,
  Moon,
  Sun,
  Type,
  LayoutTemplate,
  Paintbrush2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { PhoneInput, formatPhone, normalizeDigits, validatePhone } from '@/components/ui/masked-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import {
  Attribute,
  AttributeValue,
  Category,
  Company,
  CompanyTheme,
  CompanyThemeBorderRadius,
  CompanyThemeBorderSize,
  CompanyThemeButtonStyle,
  CompanyThemeFontFamily,
  CompanyThemeLayoutDensity,
  CompanyThemeMode,
  CompanyThemePalette,
  CompanyThemePaletteMode,
  OrderStatus,
  Supply,
} from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyTheme } from '@/contexts/CompanyThemeContext';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { z } from 'zod';
import { ensurePublicStorageUrl } from '@/lib/storage';
import {
  applyCompanyThemeTemplate,
  companyThemeTemplateLabels,
  CompanyThemeTemplateId,
  defaultCompanyTheme,
  extractDominantColorFromFile,
  extractDominantColorFromImageUrl,
  getCompanyThemePalette,
  normalizeCompanyTheme,
  normalizeHexColor,
  setCompanyThemePalette,
  suggestThemeFromLogoColor,
} from '@/lib/companyTheme';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { CompanyThemePreview } from '@/components/settings/CompanyThemePreview';
import {
  allOrderStatuses,
  buildOrderStatusCustomization,
  configurableOrderStatuses,
  defaultOrderStatusLabels,
  getOrderStatusBadgeStyle,
} from '@/lib/orderStatusConfig';
import {
  AppModuleKey,
  StoreAppRole,
  createDefaultRoleModulePermissions,
  isModuleLockedForRole,
  moduleDefinitions,
  normalizeRoleModulePermissions,
  storeAppRoles,
  storeRoleLabels,
} from '@/lib/modulePermissions';

const categorySchema = z.object({ name: z.string().min(2).max(50) });
const supplySchema = z.object({
  name: z.string().min(2).max(100),
  unit: z.string().min(1).max(10),
  cost_per_unit: z.number().min(0),
  min_stock: z.number().min(0),
});
const attributeSchema = z.object({ name: z.string().min(2).max(50) });

const orderStatusTemplateKeys: OrderStatus[] = allOrderStatuses;
const orderStatusLabels: Record<OrderStatus, string> = defaultOrderStatusLabels;

const defaultOrderStatusMessages: Record<OrderStatus, string> = {
  orcamento: 'Seu pedido está em orçamento.',
  pendente: 'Recebemos seu pedido e ele está pendente.',
  produzindo_arte: 'Sua arte está sendo produzida.',
  arte_aprovada: 'Sua arte foi aprovada e seguirá para produção.',
  em_producao: 'Seu pedido está em produção.',
  finalizado: 'Seu pedido foi finalizado.',
  pronto: 'Seu pedido foi finalizado.',
  aguardando_retirada: 'Seu pedido está pronto e aguardando retirada.',
  entregue: 'Seu pedido foi entregue.',
  cancelado: 'Seu pedido foi cancelado.',
};

const buildOrderStatusMessageTemplates = (value?: unknown): Record<OrderStatus, string> => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return orderStatusTemplateKeys.reduce((acc, status) => {
    const candidate = source[status];
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    acc[status] = normalized || defaultOrderStatusMessages[status];
    return acc;
  }, {} as Record<OrderStatus, string>);
};

const themeModeOptions: Array<{
  value: CompanyThemeMode;
  title: string;
  description: string;
  icon: typeof Sun;
}> = [
  { value: 'light', title: 'Claro', description: 'Aplica o tema claro em todo o sistema.', icon: Sun },
  { value: 'dark', title: 'Escuro', description: 'Aplica o tema escuro em todo o sistema.', icon: Moon },
  {
    value: 'system',
    title: 'Automático',
    description: 'Segue a preferência do navegador do usuário.',
    icon: Monitor,
  },
];

const buttonStyleOptions: Array<{
  value: CompanyThemeButtonStyle;
  title: string;
  description: string;
}> = [
  { value: 'soft', title: 'Suave', description: 'Botões mais leves, com contraste suave.' },
  { value: 'modern', title: 'Moderno', description: 'Botões com mais presença visual e profundidade.' },
  { value: 'solid', title: 'Sólido', description: 'Botões chapados, diretos e com alto contraste.' },
  { value: 'outline', title: 'Outline', description: 'Botões transparentes com borda e hover suave.' },
];

const borderRadiusOptions: Array<{
  value: CompanyThemeBorderRadius;
  title: string;
  description: string;
}> = [
  { value: 'small', title: 'Pequeno', description: 'Raio aproximado de 6px.' },
  { value: 'medium', title: 'Médio', description: 'Raio aproximado de 12px.' },
  { value: 'large', title: 'Grande', description: 'Raio aproximado de 20px.' },
];

const borderSizeOptions: Array<{
  value: CompanyThemeBorderSize;
  title: string;
  description: string;
}> = [
  { value: 'thin', title: 'Fina', description: 'Contornos mais discretos e leves.' },
  { value: 'normal', title: 'Normal', description: 'Equilíbrio entre definição visual e suavidade.' },
  { value: 'thick', title: 'Marcada', description: 'Mais presença em cards, campos e tabelas.' },
];

const densityOptions: Array<{
  value: CompanyThemeLayoutDensity;
  title: string;
  description: string;
}> = [
  { value: 'compact', title: 'Compacto', description: 'Menos espaçamento em cards, tabelas e formulários.' },
  { value: 'normal', title: 'Normal', description: 'Equilíbrio entre respiro visual e densidade.' },
  { value: 'spacious', title: 'Espaçado', description: 'Mais respiro em toda a interface.' },
];

const fontOptions: CompanyThemeFontFamily[] = ['Inter', 'Roboto', 'Poppins', 'Open Sans'];

const themeColorFields: Array<{
  key: keyof Pick<
    CompanyTheme,
    | 'primary_color'
    | 'secondary_color'
    | 'background_color'
    | 'card_color'
    | 'border_color'
    | 'text_color'
    | 'button_color'
    | 'button_hover_color'
    | 'menu_hover_color'
  >;
  label: string;
}> = [
  { key: 'primary_color', label: 'Cor primária' },
  { key: 'secondary_color', label: 'Cor secundária' },
  { key: 'background_color', label: 'Cor de fundo' },
  { key: 'card_color', label: 'Cor dos cards' },
  { key: 'border_color', label: 'Cor das bordas' },
  { key: 'text_color', label: 'Cor do texto' },
  { key: 'button_color', label: 'Cor dos botões' },
  { key: 'button_hover_color', label: 'Hover dos botões' },
  { key: 'menu_hover_color', label: 'Hover do menu' },
];

const themePaletteModeOptions: Array<{
  value: CompanyThemePaletteMode;
  title: string;
  description: string;
  icon: typeof Sun;
}> = [
  { value: 'light', title: 'Paleta clara', description: 'Usada quando o sistema estiver em modo claro.', icon: Sun },
  { value: 'dark', title: 'Paleta escura', description: 'Usada quando o sistema estiver em modo escuro.', icon: Moon },
];

const themeTemplateOptions: Array<{
  value: CompanyThemeTemplateId;
  description: string;
}> = [
  { value: 'blue', description: 'Base sóbria e profissional, com contraste seguro para SaaS.' },
  { value: 'green', description: 'Mais fresca e moderna, com ênfase em conversão e destaque.' },
  { value: 'purple', description: 'Visual SaaS mais expressivo, sem fugir do padrão atual.' },
  { value: 'logo', description: 'Gera uma paleta clara e escura a partir da cor dominante da logo.' },
];

export default function Settings() {
  const { toast } = useToast();
  const { profile, user, hasPermission, refreshCompany } = useAuth();
  const { companyTheme, loadingCompanyTheme, refreshCompanyTheme, setCompanyThemeLocally } = useCompanyTheme();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [catalogPreviewVisible, setCatalogPreviewVisible] = useState(false);
  const [catalogPreviewKey, setCatalogPreviewKey] = useState(0);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    description: "",
    email: "",
    phone: "",
    whatsapp: "",
    whatsapp_message_template: "",
    order_status_message_templates: buildOrderStatusMessageTemplates(),
    order_status_customization: buildOrderStatusCustomization(),
    role_module_permissions: createDefaultRoleModulePermissions(),
    birthday_message_template: "",
    signature_responsible: "",
    signature_role: "",
    address: "",
    city: "",
    state: "",
    instagram: "",
    facebook: "",
    minimum_order_value: 0,
    minimum_delivery_value: 0,
    catalog_primary_color: "#3b82f6",
    catalog_secondary_color: "#1e40af",
    catalog_accent_color: "#f59e0b",
    catalog_text_color: "#111827",
    catalog_header_bg_color: "#1e40af",
    catalog_header_text_color: "#111827",
    catalog_footer_bg_color: "#1e40af",
    catalog_footer_text_color: "#111827",
    catalog_price_color: "#f59e0b",
    catalog_badge_bg_color: "#f59e0b",
    catalog_badge_text_color: "#111827",
    catalog_button_bg_color: "#3b82f6",
    catalog_button_text_color: "#ffffff",
    catalog_button_outline_color: "#3b82f6",
    catalog_card_bg_color: "#ffffff",
    catalog_card_border_color: "#e5e7eb",
    catalog_filter_bg_color: "#3b82f6",
    catalog_filter_text_color: "#ffffff",
    catalog_layout: "grid" as "grid" | "list",
  });
  const [copied, setCopied] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [originalForm, setOriginalForm] = useState<typeof companyForm | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const companyFetchRef = useRef<string | null>(null);
  const whatsappTemplateRef = useRef<HTMLTextAreaElement>(null);
  const birthdayTemplateRef = useRef<HTMLTextAreaElement>(null);
  const messageTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [dangerOpen, setDangerOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetChecked, setResetChecked] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [themeForm, setThemeForm] = useState<CompanyTheme>(() =>
    defaultCompanyTheme(profile?.company_id ?? '')
  );
  const [originalThemeForm, setOriginalThemeForm] = useState<CompanyTheme | null>(null);
  const [themePaletteMode, setThemePaletteMode] = useState<CompanyThemePaletteMode>('light');
  const [savingTheme, setSavingTheme] = useState(false);
  const themeCompanyRef = useRef<string | null>(null);
  // Controla a aba por estado para evitar reload e manter o estado dos formulários.
  const [activeTab, setActiveTab] = useState<'company' | 'catalog' | 'theme'>('company');
  const [companySettingsTab, setCompanySettingsTab] = useState<'geral' | 'contato' | 'mensagens' | 'permissoes'>('geral');

  // Dialogs
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [supplyDialog, setSupplyDialog] = useState(false);
  const [attributeDialog, setAttributeDialog] = useState(false);
  const [valueDialog, setValueDialog] = useState<string | null>(null);

  // Forms
  const [categoryName, setCategoryName] = useState('');
  const [supplyForm, setSupplyForm] = useState({ name: '', unit: 'un', cost_per_unit: 0, min_stock: 0 });
  const [attributeName, setAttributeName] = useState('');
  const [valueName, setValueName] = useState('');

  // Edit mode
  const [editId, setEditId] = useState<string | null>(null);

  const whatsappPlaceholders = [
    { value: '{cliente_nome}', label: 'Cliente', description: 'Nome do cliente' },
    { value: '{cliente_telefone}', label: 'Telefone', description: 'Telefone do cliente' },
    { value: '{pedido_id}', label: 'ID', description: 'Identificador do pedido' },
    { value: '{pedido_numero}', label: 'Pedido', description: 'Número do pedido' },
    { value: '{pedido_status}', label: 'Status', description: 'Status do pedido' },
    { value: '{mensagem_status}', label: 'Mensagem status', description: 'Mensagem padrão conforme status do pedido' },
    { value: '{pedido_total}', label: 'Total', description: 'Total do pedido' },
    { value: '{total}', label: 'Total curto', description: 'Alias do total do pedido' },
    { value: '{pedido_link}', label: 'Link', description: 'Link do pedido' },
    { value: '{link_catalogo}', label: 'Catálogo', description: 'Link do catálogo público' },
    { value: '{empresa_nome}', label: 'Empresa', description: 'Nome da empresa' },
  ];

  const birthdayPlaceholders = [
    { value: '{cliente_nome}', label: 'Cliente', description: 'Nome do cliente' },
    { value: '{cliente_telefone}', label: 'Telefone', description: 'Telefone do cliente' },
    { value: '{cliente_idade}', label: 'Idade', description: 'Idade que irá completar' },
    { value: '{aniversario_data}', label: 'Aniversário', description: 'Dia e mês do aniversário' },
    { value: '{empresa_nome}', label: 'Empresa', description: 'Nome da empresa' },
  ];

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (!profile?.company_id) return;
    if (companyFetchRef.current === profile.company_id) return;
    companyFetchRef.current = profile.company_id;
    fetchCompany(profile.company_id);
  }, [profile?.company_id]);

  const fetchAll = useCallback(async () => {
    const [cat, sup, attr, val] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('supplies').select('*').order('name'),
      supabase.from('attributes').select('*').order('name'),
      supabase.from('attribute_values').select('*').order('value'),
    ]);
    setCategories(cat.data as Category[] || []);
    setSupplies(sup.data as Supply[] || []);
    setAttributes(attr.data as Attribute[] || []);
    setAttributeValues(val.data as AttributeValue[] || []);
  }, []);

  const fetchCompany = useCallback(async (companyId: string) => {
    setCompanyLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    if (error) {
      toast({ title: "Erro ao carregar empresa", variant: "destructive" });
      companyFetchRef.current = null;
      setCompanyLoading(false);
      return;
    }

    if (data) {
      const normalizedLogoUrl = ensurePublicStorageUrl('product-images', data.logo_url);
      const normalizedSignatureUrl = data.signature_image_url
        ? ensurePublicStorageUrl('product-images', data.signature_image_url)
        : null;
      setCompany({
        ...(data as Company),
        logo_url: normalizedLogoUrl,
        signature_image_url: normalizedSignatureUrl,
      });

      if (!originalForm) {
        const catalogPrimary = data.catalog_primary_color || "#3b82f6";
        const catalogSecondary = data.catalog_secondary_color || "#1e40af";
        const catalogAccent = data.catalog_accent_color || "#f59e0b";
        const catalogText = data.catalog_text_color || "#111827";
        const catalogHeaderBg = data.catalog_header_bg_color || catalogSecondary;
        const catalogHeaderText = data.catalog_header_text_color || catalogText;
        const catalogFooterBg = data.catalog_footer_bg_color || catalogHeaderBg;
        const catalogFooterText = data.catalog_footer_text_color || catalogHeaderText;
        const catalogPrice = data.catalog_price_color || catalogAccent;
        const catalogBadgeBg = data.catalog_badge_bg_color || catalogAccent;
        const catalogBadgeText = data.catalog_badge_text_color || catalogText;
        const catalogButtonBg = data.catalog_button_bg_color || catalogPrimary;
        const catalogButtonText = data.catalog_button_text_color || "#ffffff";
        const catalogButtonOutline = data.catalog_button_outline_color || catalogPrimary;
        const catalogCardBg = data.catalog_card_bg_color || "#ffffff";
        const catalogCardBorder = data.catalog_card_border_color || "#e5e7eb";
        const catalogFilterBg = data.catalog_filter_bg_color || catalogPrimary;
        const catalogFilterText = data.catalog_filter_text_color || "#ffffff";

        const formData = {
          name: data.name || "",
          description: data.description || "",
          email: data.email || "",
          phone: data.phone ? formatPhone(data.phone) : "",
          whatsapp: data.whatsapp ? formatPhone(data.whatsapp) : "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          instagram: data.instagram || "",
          facebook: data.facebook || "",
          signature_responsible: data.signature_responsible || "",
          signature_role: data.signature_role || "",
          minimum_order_value: Number(data.minimum_order_value ?? 0),
          minimum_delivery_value: Number(data.minimum_delivery_value ?? 0),
          catalog_primary_color: catalogButtonBg,
          catalog_secondary_color: catalogHeaderBg,
          catalog_accent_color: catalogPrice,
          catalog_text_color: catalogText,
          catalog_header_bg_color: catalogHeaderBg,
          catalog_header_text_color: catalogHeaderText,
          catalog_footer_bg_color: catalogFooterBg,
          catalog_footer_text_color: catalogFooterText,
          catalog_price_color: catalogPrice,
          catalog_badge_bg_color: catalogBadgeBg,
          catalog_badge_text_color: catalogBadgeText,
          catalog_button_bg_color: catalogButtonBg,
          catalog_button_text_color: catalogButtonText,
          catalog_button_outline_color: catalogButtonOutline,
          catalog_card_bg_color: catalogCardBg,
          catalog_card_border_color: catalogCardBorder,
          catalog_filter_bg_color: catalogFilterBg,
          catalog_filter_text_color: catalogFilterText,
          catalog_layout: ((data.catalog_layout as "grid" | "list" | null) || "grid"),
          whatsapp_message_template: data.whatsapp_message_template || "",
          order_status_message_templates: buildOrderStatusMessageTemplates(data.order_status_message_templates),
          order_status_customization: buildOrderStatusCustomization(data.order_status_customization),
          role_module_permissions: normalizeRoleModulePermissions(data.role_module_permissions),
          birthday_message_template: data.birthday_message_template || "",
        };
        setCompanyForm(formData);
        setOriginalForm(formData);
        setLogoPreview(normalizedLogoUrl);
        setSignaturePreview(normalizedSignatureUrl);
        setSignatureFile(null);
        setIsSaved(true);
      }
    }
    setCompanyLoading(false);
  }, [originalForm, toast]);

  useEffect(() => {
    if (!profile?.company_id) {
      themeCompanyRef.current = null;
      setThemeForm(defaultCompanyTheme(''));
      setOriginalThemeForm(null);
      return;
    }

    if (!companyTheme) return;

    const nextTheme = normalizeCompanyTheme(companyTheme, profile.company_id);
    const shouldHydrate =
      themeCompanyRef.current !== nextTheme.store_id || originalThemeForm === null;

    if (!shouldHydrate) return;

    themeCompanyRef.current = nextTheme.store_id;
    setThemeForm(nextTheme);
    setOriginalThemeForm(nextTheme);
    setThemePaletteMode(nextTheme.theme_mode === 'dark' ? 'dark' : 'light');
  }, [companyTheme, originalThemeForm, profile?.company_id]);

  const updateThemeField = useCallback(
    <K extends keyof CompanyTheme,>(field: K, value: CompanyTheme[K]) => {
      setThemeForm((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [],
  );

  const activeThemePalette = useMemo(
    () => getCompanyThemePalette(themeForm, themePaletteMode),
    [themeForm, themePaletteMode],
  );

  const handleThemeColorChange = useCallback(
    (
      field: keyof CompanyThemePalette,
      value: string,
    ) => {
      setThemeForm((prev) =>
        setCompanyThemePalette(prev, themePaletteMode, {
          ...getCompanyThemePalette(prev, themePaletteMode),
          [field]: normalizeHexColor(value, getCompanyThemePalette(prev, themePaletteMode)[field]),
        }),
      );
    },
    [themePaletteMode],
  );

  const applyThemeTemplatePreset = useCallback(
    async (templateId: CompanyThemeTemplateId) => {
      try {
        let logoBaseColor: string | null = null;

        if (templateId === 'logo') {
          const storedLogoUrl = company?.logo_url ? ensurePublicStorageUrl(company.logo_url) : null;
          const logoSource = logoPreview || storedLogoUrl;

          if (!logoSource) {
            toast({
              title: 'Envie uma logo primeiro',
              description: 'A paleta baseada na logo precisa de uma imagem da empresa para extrair a cor dominante.',
              variant: 'destructive',
            });
            return;
          }

          logoBaseColor = await extractDominantColorFromImageUrl(logoSource);
        }

        setThemeForm((prev) =>
          applyCompanyThemeTemplate(prev, templateId, {
            logoBaseColor,
          }),
        );

        toast({
          title:
            templateId === 'logo'
              ? 'Paleta gerada a partir da logo'
              : `Template ${companyThemeTemplateLabels[templateId].toLowerCase()} aplicado`,
          description: 'Revise o preview e salve o tema para aplicar no sistema inteiro.',
        });
      } catch (error) {
        console.error('Erro ao aplicar template de tema:', error);
        toast({
          title: 'Erro ao aplicar template',
          description: 'Não foi possível gerar a nova paleta agora.',
          variant: 'destructive',
        });
      }
    },
    [company?.logo_url, logoPreview, toast],
  );

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      try {
        const suggestedColor = await extractDominantColorFromFile(file);
        setThemeForm((prev) =>
          setCompanyThemePalette(
            normalizeCompanyTheme(prev, profile?.company_id ?? company?.id ?? ''),
            themePaletteMode,
            suggestThemeFromLogoColor(
              suggestedColor,
              themePaletteMode,
              getCompanyThemePalette(prev, themePaletteMode),
            ),
          ),
        );
        toast({
          title: 'Cor principal sugerida a partir da logo',
          description: `Revise a nova paleta ${themePaletteMode === 'dark' ? 'escura' : 'clara'} na aba Tema da Empresa antes de salvar.`,
        });
      } catch (error) {
        console.error('Erro ao extrair cor da logo:', error);
      }
    }
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSignatureFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignaturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Check for pending changes
  const hasChanges = useMemo(() => {
    return !!originalForm && (
      JSON.stringify(companyForm) !== JSON.stringify(originalForm) ||
      logoFile !== null ||
      signatureFile !== null
    );
  }, [originalForm, companyForm, logoFile, signatureFile]);
  const hasThemeChanges = useMemo(() => {
    if (!originalThemeForm) return false;

    const sanitize = (theme: CompanyTheme) => ({
      store_id: theme.store_id,
      theme_mode: theme.theme_mode,
      light_palette: getCompanyThemePalette(theme, 'light'),
      dark_palette: getCompanyThemePalette(theme, 'dark'),
      border_radius: theme.border_radius,
      border_size: theme.border_size,
      button_style: theme.button_style,
      layout_density: theme.layout_density,
      font_family: theme.font_family,
    });

    return JSON.stringify(sanitize(themeForm)) !== JSON.stringify(sanitize(originalThemeForm));
  }, [originalThemeForm, themeForm]);
  const hasPendingChanges = hasChanges || hasThemeChanges;
  const minimumOrderValue = Number(companyForm.minimum_order_value || 0);
  const minimumDeliveryValue = Number(companyForm.minimum_delivery_value || 0);
  const hasInvalidMinimumDelivery =
    minimumDeliveryValue > 0 && minimumDeliveryValue < minimumOrderValue;

  // Update isSaved when form changes
  useEffect(() => {
    if (hasPendingChanges) {
      setIsSaved(false);
    }
  }, [hasPendingChanges]);

  useEffect(() => {
    if (activeTab === 'catalog' && hasChanges) {
      setCatalogPreviewVisible(false);
    }
  }, [activeTab, hasChanges]);

  const autoResizeTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.overflowY = 'hidden';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  const registerMessageTextarea = useCallback(
    (key: string, textarea: HTMLTextAreaElement | null) => {
      messageTextareaRefs.current[key] = textarea;
      autoResizeTextarea(textarea);
    },
    [autoResizeTextarea],
  );

  useLayoutEffect(() => {
    if (companySettingsTab !== 'mensagens') return;
    Object.values(messageTextareaRefs.current).forEach(autoResizeTextarea);
  }, [
    autoResizeTextarea,
    companySettingsTab,
    companyForm.birthday_message_template,
    companyForm.order_status_message_templates,
    companyForm.whatsapp_message_template,
  ]);

  useUnsavedChanges((hasChanges && !savingCompany) || (hasThemeChanges && !savingTheme));

  const saveCompany = async () => {
    if (!company) {
      // Company not loaded yet, wait for it
      return;
    }

    const companyName = companyForm.name?.trim();
    if (!companyName) {
      toast({ title: "Nome da empresa é obrigatório", variant: "destructive" });
      return;
    }

    if (companyForm.phone && !validatePhone(companyForm.phone)) {
      toast({ title: "Telefone inválido", description: "Use um celular brasileiro válido.", variant: "destructive" });
      return;
    }
    if (companyForm.whatsapp && !validatePhone(companyForm.whatsapp)) {
      toast({ title: "WhatsApp inválido", description: "Use um celular brasileiro válido.", variant: "destructive" });
      return;
    }

    if (hasInvalidMinimumDelivery) {
      toast({
        title: "Valor mínimo para entrega inválido",
        description: "O valor mínimo para entrega deve ser maior ou igual ao valor mínimo do pedido.",
        variant: "destructive",
      });
      return;
    }

    setSavingCompany(true);
    const phoneDigits = companyForm.phone ? normalizeDigits(companyForm.phone) : null;
    const whatsappDigits = companyForm.whatsapp ? normalizeDigits(companyForm.whatsapp) : null;

    try {
      let logoUrl = company.logo_url;
      let signatureUrl = company.signature_image_url || null;

      // Upload new logo if changed
      if (logoFile) {
        const fileExt = logoFile.name.split(".").pop() || "png";
        const fileName = `${company.id}-${Date.now()}.${fileExt}`;
        const filePath = `logos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, logoFile, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        if (!urlData?.publicUrl) {
          throw new Error("URL do logo não foi retornada.");
        }

        logoUrl = ensurePublicStorageUrl('product-images', urlData.publicUrl);
      }

      if (signatureFile) {
        const fileExt = signatureFile.name.split(".").pop() || "png";
        const fileName = `${company.id}-${Date.now()}.${fileExt}`;
        const filePath = `signatures/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(filePath, signatureFile, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        if (!urlData?.publicUrl) {
          throw new Error("URL da assinatura não foi retornada.");
        }

        signatureUrl = ensurePublicStorageUrl('product-images', urlData.publicUrl);
      }

      const normalizedStatusMessages = buildOrderStatusMessageTemplates(
        companyForm.order_status_message_templates,
      );
      const normalizedStatusCustomization = buildOrderStatusCustomization(
        companyForm.order_status_customization,
      );
      const normalizedRoleModulePermissions = normalizeRoleModulePermissions(
        companyForm.role_module_permissions,
      );

      const { data: updatedCompany, error } = await supabase
        .from('companies')
        .update({
          name: companyName,
          description: companyForm.description || null,
          email: companyForm.email || null,
          phone: phoneDigits,
          whatsapp: whatsappDigits,
          address: companyForm.address || null,
          city: companyForm.city || null,
          state: companyForm.state || null,
          instagram: companyForm.instagram || null,
          facebook: companyForm.facebook || null,
          minimum_order_value: Number(companyForm.minimum_order_value || 0),
          minimum_delivery_value: Number(companyForm.minimum_delivery_value || 0),
          logo_url: logoUrl,
          signature_image_url: signatureUrl,
          signature_responsible: companyForm.signature_responsible?.trim() || null,
          signature_role: companyForm.signature_role?.trim() || null,
          catalog_primary_color: companyForm.catalog_button_bg_color,
          catalog_secondary_color: companyForm.catalog_header_bg_color,
          catalog_accent_color: companyForm.catalog_price_color,
          catalog_text_color: companyForm.catalog_text_color,
          catalog_header_bg_color: companyForm.catalog_header_bg_color,
          catalog_header_text_color: companyForm.catalog_header_text_color,
          catalog_footer_bg_color: companyForm.catalog_footer_bg_color,
          catalog_footer_text_color: companyForm.catalog_footer_text_color,
          catalog_price_color: companyForm.catalog_price_color,
          catalog_badge_bg_color: companyForm.catalog_badge_bg_color,
          catalog_badge_text_color: companyForm.catalog_badge_text_color,
          catalog_button_bg_color: companyForm.catalog_button_bg_color,
          catalog_button_text_color: companyForm.catalog_button_text_color,
          catalog_button_outline_color: companyForm.catalog_button_outline_color,
          catalog_card_bg_color: companyForm.catalog_card_bg_color,
          catalog_card_border_color: companyForm.catalog_card_border_color,
          catalog_filter_bg_color: companyForm.catalog_filter_bg_color,
          catalog_filter_text_color: companyForm.catalog_filter_text_color,
          catalog_layout: companyForm.catalog_layout,
          whatsapp_message_template: companyForm.whatsapp_message_template?.trim() || null,
          order_status_message_templates: normalizedStatusMessages,
          order_status_customization: normalizedStatusCustomization,
          role_module_permissions: normalizedRoleModulePermissions,
          birthday_message_template: companyForm.birthday_message_template?.trim() || null,
        })
        .eq('id', company.id)
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Empresa atualizada com sucesso!" });
      const normalizedUpdatedLogo = ensurePublicStorageUrl('product-images', updatedCompany?.logo_url || null);
      const normalizedUpdatedSignature = updatedCompany?.signature_image_url
        ? ensurePublicStorageUrl('product-images', updatedCompany.signature_image_url)
        : null;
      setCompany({
        ...(updatedCompany as Company),
        logo_url: normalizedUpdatedLogo,
        signature_image_url: normalizedUpdatedSignature,
      });
      await refreshCompany();
      setLogoFile(null);
      setLogoPreview(normalizedUpdatedLogo);
      setSignatureFile(null);
      setSignaturePreview(normalizedUpdatedSignature);
      setCompanyForm((prev) => ({
        ...prev,
        order_status_message_templates: normalizedStatusMessages,
        order_status_customization: normalizedStatusCustomization,
        role_module_permissions: normalizedRoleModulePermissions,
      }));
      setIsSaved(true);
      setOriginalForm({
        ...companyForm,
        order_status_message_templates: normalizedStatusMessages,
        order_status_customization: normalizedStatusCustomization,
        role_module_permissions: normalizedRoleModulePermissions,
      });
      if (activeTab === 'catalog') {
        setCatalogPreviewVisible(true);
        setCatalogPreviewKey((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Erro:", error);
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSavingCompany(false);
    }
  };

  const saveTheme = async () => {
    if (!profile?.company_id) {
      toast({ title: 'Empresa não encontrada', variant: 'destructive' });
      return;
    }

    setSavingTheme(true);

    try {
      const payload = normalizeCompanyTheme(themeForm, profile.company_id);
      const { data, error } = await supabase
        .from('company_theme')
        .upsert(payload, { onConflict: 'store_id' })
        .select('*')
        .maybeSingle();

      if (error) throw error;

      const savedTheme = normalizeCompanyTheme(data ?? payload, profile.company_id);
      setThemeForm(savedTheme);
      setOriginalThemeForm(savedTheme);
      setCompanyThemeLocally(savedTheme);
      await refreshCompanyTheme();
      setIsSaved(true);
      toast({ title: 'Tema da empresa salvo com sucesso!' });
    } catch (error) {
      console.error('Erro ao salvar tema da empresa:', error);
      toast({ title: 'Erro ao salvar tema da empresa', variant: 'destructive' });
    } finally {
      setSavingTheme(false);
    }
  };

  const insertWhatsappPlaceholder = (placeholder: string) => {
    const textarea = whatsappTemplateRef.current;
    const currentValue = companyForm.whatsapp_message_template || '';
    const start = textarea?.selectionStart ?? currentValue.length;
    const end = textarea?.selectionEnd ?? currentValue.length;
    const nextValue =
      currentValue.slice(0, start) + placeholder + currentValue.slice(end);

    setCompanyForm((prev) => ({
      ...prev,
      whatsapp_message_template: nextValue,
    }));

    if (textarea) {
      requestAnimationFrame(() => {
        const cursorPos = start + placeholder.length;
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    }
  };

  const insertBirthdayPlaceholder = (placeholder: string) => {
    const textarea = birthdayTemplateRef.current;
    const currentValue = companyForm.birthday_message_template || '';
    const start = textarea?.selectionStart ?? currentValue.length;
    const end = textarea?.selectionEnd ?? currentValue.length;
    const nextValue =
      currentValue.slice(0, start) + placeholder + currentValue.slice(end);

    setCompanyForm((prev) => ({
      ...prev,
      birthday_message_template: nextValue,
    }));

    if (textarea) {
      requestAnimationFrame(() => {
        const cursorPos = start + placeholder.length;
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    }
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const isAdmin = hasPermission(['admin', 'super_admin']);
  const setRoleModulePermission = (roleName: StoreAppRole, moduleKey: AppModuleKey, enabled: boolean) => {
    setCompanyForm((prev) => ({
      ...prev,
      role_module_permissions: {
        ...prev.role_module_permissions,
        [roleName]: {
          ...prev.role_module_permissions[roleName],
          [moduleKey]: enabled,
        },
      },
    }));
  };

  const resetRoleModulePermissions = () => {
    setCompanyForm((prev) => ({
      ...prev,
      role_module_permissions: createDefaultRoleModulePermissions(),
    }));
  };

  const resetReady = isAdmin
    && !!profile?.company_id
    && resetChecked
    && resetPassword.trim().length > 0
    && resetConfirmText.trim().toUpperCase() === 'RESETAR';

  const handleResetCompany = async () => {
    if (!profile?.company_id) {
      setResetError('Empresa não encontrada.');
      return;
    }
    if (!user.email) {
      setResetError('E-mail do usuário não encontrado.');
      return;
    }

    setResetLoading(true);
    setResetError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: resetPassword,
    });

    if (authError) {
      setResetLoading(false);
      setResetError('Senha inválida.');
      return;
    }

    try {
      await invokeEdgeFunction('reset-company-data', { companyId: profile.company_id });
    } catch (error) {
      console.error('[settings] reset-company-data failed', error);
      setResetLoading(false);
      setResetError(error instanceof Error ? error.message : 'Falha ao zerar dados.');
      return;
    }

    toast({ title: 'Dados da empresa zerados com sucesso.' });
    setDangerOpen(false);
    setResetPassword('');
    setResetConfirmText('');
    setResetChecked(false);
    setResetLoading(false);
    navigate('/dashboard', { replace: true });
  };

  // Categories
  const saveCategory = async () => {
    const result = categorySchema.safeParse({ name: categoryName.trim() });
    if (!result.success) return toast({ title: 'Nome inválido', variant: 'destructive' });

    const { error } = editId
      ? await supabase.from('categories').update({ name: categoryName.trim() }).eq('id', editId)
      : await supabase.from('categories').insert({ name: categoryName.trim() });

    if (error) toast({ title: 'Erro ao salvar', variant: 'destructive' });
    else { toast({ title: 'Categoria salva!' }); fetchAll(); }
    setCategoryDialog(false);
    setCategoryName('');
    setEditId(null);
  };

  const deleteCategory = async (id: string) => {
    await supabase.from('categories').delete().eq('id', id);
    fetchAll();
  };

  // Supplies
  const saveSupply = async () => {
    const result = supplySchema.safeParse(supplyForm);
    if (!result.success) return toast({ title: 'Dados inválidos', variant: 'destructive' });

    const { error } = editId
      ? await supabase.from('supplies').update(supplyForm).eq('id', editId)
      : await supabase.from('supplies').insert(supplyForm);

    if (error) toast({ title: 'Erro ao salvar', variant: 'destructive' });
    else { toast({ title: 'Insumo salvo!' }); fetchAll(); }
    setSupplyDialog(false);
    setSupplyForm({ name: '', unit: 'un', cost_per_unit: 0, min_stock: 0 });
    setEditId(null);
  };

  const deleteSupply = async (id: string) => {
    await supabase.from('supplies').delete().eq('id', id);
    fetchAll();
  };

  // Attributes
  const saveAttribute = async () => {
    const result = attributeSchema.safeParse({ name: attributeName.trim() });
    if (!result.success) return toast({ title: 'Nome inválido', variant: 'destructive' });

    const { error } = editId
      ? await supabase.from('attributes').update({ name: attributeName.trim() }).eq('id', editId)
      : await supabase.from('attributes').insert({ name: attributeName.trim() });

    if (error) toast({ title: 'Erro ao salvar', variant: 'destructive' });
    else { toast({ title: 'Atributo salvo!' }); fetchAll(); }
    setAttributeDialog(false);
    setAttributeName('');
    setEditId(null);
  };

  const deleteAttribute = async (id: string) => {
    await supabase.from('attributes').delete().eq('id', id);
    fetchAll();
  };

  // Attribute Values
  const saveValue = async () => {
    if (!valueDialog || !valueName.trim()) return;

    const { error } = await supabase.from('attribute_values').insert({
      attribute_id: valueDialog,
      value: valueName.trim()
    });

    if (error) toast({ title: 'Erro ao salvar', variant: 'destructive' });
    else { toast({ title: 'Valor salvo!' }); fetchAll(); }
    setValueDialog(null);
    setValueName('');
  };

  const deleteValue = async (id: string) => {
    await supabase.from('attribute_values').delete().eq('id', id);
    fetchAll();
  };

  return (
    <div className="page-container pb-20">
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'company' | 'catalog' | 'theme')}>

        <TabsList>
          <TabsTrigger value="company" type="button">Dados da Empresa</TabsTrigger>
          <TabsTrigger value="catalog" type="button">Personalização do Sistema</TabsTrigger>
          <TabsTrigger value="theme" type="button">Tema da Empresa</TabsTrigger>
        </TabsList>

        {/* Company */}
        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Dados da Empresa
              </CardTitle>
              <CardDescription>
                Atualize as informações da sua empresa
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs
                value={companySettingsTab}
                onValueChange={(value) => setCompanySettingsTab(value as 'geral' | 'contato' | 'mensagens' | 'permissoes')}
                className="space-y-6"
              >
                <TabsList className="h-auto flex-wrap justify-start gap-2">
                  <TabsTrigger value="geral" type="button">Geral</TabsTrigger>
                  <TabsTrigger value="contato" type="button">Contato</TabsTrigger>
                  <TabsTrigger value="mensagens" type="button">Mensagens</TabsTrigger>
                  <TabsTrigger value="permissoes" type="button">Permissões</TabsTrigger>
                </TabsList>

                <TabsContent value="geral" className="mt-0 space-y-6">
              {/* Logo Upload */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted/50">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Logo"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Upload className="h-6 w-6 text-muted-foreground/50" />
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                <div>
                  <p className="font-medium">Logo da Empresa</p>
                  <p className="text-sm text-muted-foreground">
                    Clique para alterar
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-lg border border-muted/60 p-4">
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <div className="h-20 w-32 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted/50">
                      {signaturePreview ? (
                        <img
                          src={signaturePreview}
                          alt="Assinatura"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Upload className="h-6 w-6 text-muted-foreground/50" />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleSignatureChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <div>
                    <p className="font-medium">Assinatura para recibos</p>
                    <p className="text-sm text-muted-foreground">
                      Envie uma imagem PNG/JPG (de preferência com fundo transparente).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-signature-responsible">Responsável pela assinatura</Label>
                    <Input
                      id="company-signature-responsible"
                      value={companyForm.signature_responsible}
                      onChange={(e) => setCompanyForm({ ...companyForm, signature_responsible: e.target.value })}
                      placeholder="Nome do responsável"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-signature-role">Cargo do responsável</Label>
                    <Input
                      id="company-signature-role"
                      value={companyForm.signature_role}
                      onChange={(e) => setCompanyForm({ ...companyForm, signature_role: e.target.value })}
                      placeholder="Cargo"
                    />
                  </div>
                </div>
              </div>

              {/* Company Name */}
              <div className="space-y-2">
                <Label htmlFor="company-name" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Nome da Empresa *
                </Label>
                <Input
                  id="company-name"
                  value={companyForm.name}
                  onChange={(e) => {
                    setCompanyForm({ ...companyForm, name: e.target.value });
                    if (nameTouched) {
                      setNameError(!e.target.value.trim());
                    }
                  }}
                  onBlur={() => {
                    setNameTouched(true);
                    setNameError(!companyForm.name.trim());
                  }}
                  className={nameError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {nameError && (
                  <p className="text-sm text-destructive">Nome da empresa é obrigatório</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="company-description">Descrição</Label>
                <Textarea
                  id="company-description"
                  value={companyForm.description}
                  onChange={(e) => setCompanyForm({ ...companyForm, description: e.target.value })}
                  className="resize-none"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company-min-order">Valor mínimo do pedido</Label>
                  <CurrencyInput
                    id="company-min-order"
                    value={Number(companyForm.minimum_order_value || 0)}
                    onChange={(value) =>
                      setCompanyForm((prev) => ({ ...prev, minimum_order_value: value }))
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    Pedido só pode ser finalizado no catálogo a partir desse valor.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-min-delivery">Valor mínimo para entrega</Label>
                  <CurrencyInput
                    id="company-min-delivery"
                    value={Number(companyForm.minimum_delivery_value || 0)}
                    onChange={(value) =>
                      setCompanyForm((prev) => ({ ...prev, minimum_delivery_value: value }))
                    }
                    className={hasInvalidMinimumDelivery ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  <p className="text-sm text-muted-foreground">
                    Valor mínimo para habilitar entrega. Abaixo disso, apenas retirada.
                  </p>
                  {hasInvalidMinimumDelivery && (
                    <p className="text-sm text-destructive">
                      O valor mínimo para entrega deve ser maior ou igual ao valor mínimo do pedido.
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Esses valores são independentes: um controla o pedido mínimo geral e o outro apenas a entrega.
              </p>

                </TabsContent>

                <TabsContent value="contato" className="mt-0 space-y-6">
              {/* Contact Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    E-mail
                  </Label>
                  <Input
                    id="company-email"
                    type="email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone
                  </Label>
                  <PhoneInput
                    id="company-phone"
                    value={companyForm.phone}
                    onChange={(value) => setCompanyForm({ ...companyForm, phone: value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-whatsapp">WhatsApp</Label>
                  <PhoneInput
                    id="company-whatsapp"
                    value={companyForm.whatsapp}
                    onChange={(value) => setCompanyForm({ ...companyForm, whatsapp: value })}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-4">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Endereço
                </Label>
                <Input
                  placeholder="Rua, número, bairro"
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    placeholder="Cidade"
                    value={companyForm.city}
                    onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                  />
                  <Input
                    placeholder="Estado"
                    value={companyForm.state}
                    onChange={(e) => setCompanyForm({ ...companyForm, state: e.target.value })}
                  />
                </div>
              </div>

              {/* Social Media */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-instagram" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Instagram
                  </Label>
                  <Input
                    id="company-instagram"
                    placeholder="@suaempresa"
                    value={companyForm.instagram}
                    onChange={(e) => setCompanyForm({ ...companyForm, instagram: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-facebook">Facebook</Label>
                  <Input
                    id="company-facebook"
                    value={companyForm.facebook}
                    onChange={(e) => setCompanyForm({ ...companyForm, facebook: e.target.value })}
                  />
                </div>
              </div>

                </TabsContent>

                <TabsContent value="mensagens" className="mt-0 space-y-6">
              <div className="space-y-3">
                <Label htmlFor="whatsapp-template" className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Mensagem padrão do WhatsApp
                </Label>
                <TooltipProvider delayDuration={150}>
                  <div className="flex flex-wrap gap-2">
                    {whatsappPlaceholders.map((placeholder) => (
                      <Tooltip key={placeholder.value}>
                        <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => insertWhatsappPlaceholder(placeholder.value)}
                            >
                            {placeholder.label}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <p className="font-medium">{placeholder.description}</p>
                            <p className="mt-1 text-muted-foreground">{placeholder.value}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
                <Textarea
                  id="whatsapp-template"
                  ref={(textarea) => {
                    whatsappTemplateRef.current = textarea;
                    registerMessageTextarea('whatsapp-template', textarea);
                  }}
                  value={companyForm.whatsapp_message_template}
                  onChange={(e) => {
                    setCompanyForm({ ...companyForm, whatsapp_message_template: e.target.value });
                    autoResizeTextarea(e.currentTarget);
                  }}
                  placeholder="Ola {cliente_nome}! {mensagem_status} Pedido #{pedido_numero}. Acompanhe: {pedido_link}"
                  className="!min-h-0 resize-none overflow-hidden"
                  rows={1}
                />
                  <div className="text-xs text-muted-foreground">
                    Variáveis disponíveis:
                    <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      <span>{'{cliente_nome}'}</span>
                      <span>{'{cliente_telefone}'}</span>
                      <span>{'{pedido_numero}'}</span>
                      <span>{'{pedido_status}'}</span>
                      <span>{'{mensagem_status}'}</span>
                      <span>{'{pedido_total}'}</span>
                      <span>{'{pedido_link}'}</span>
                      <span>{'{empresa_nome}'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Mensagem por status do pedido
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Este texto alimenta a variavel <span>{'{mensagem_status}'}</span> da mensagem do WhatsApp.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {orderStatusTemplateKeys.map((status) => (
                      <div key={status} className="space-y-2">
                        <Label htmlFor={`status-message-${status}`}>{orderStatusLabels[status]}</Label>
                        <Textarea
                          id={`status-message-${status}`}
                          ref={(textarea) =>
                            registerMessageTextarea(`status-message-${status}`, textarea)
                          }
                          value={companyForm.order_status_message_templates[status] || ''}
                          onChange={(event) => {
                            setCompanyForm((prev) => ({
                              ...prev,
                              order_status_message_templates: {
                                ...prev.order_status_message_templates,
                                [status]: event.target.value,
                              },
                            }));
                            autoResizeTextarea(event.currentTarget);
                          }}
                          className="!min-h-0 resize-none overflow-hidden"
                          rows={1}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <SettingsIcon className="h-4 w-4" />
                    Status personalizados no sistema
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Escolha os status que aparecem na tela de pedidos e personalize o nome exibido.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {configurableOrderStatuses.map((status) => {
                      const enabled = companyForm.order_status_customization.enabled_statuses.includes(status);
                      return (
                        <div key={`status-config-${status}`} className="space-y-2 rounded-lg border border-border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor={`status-label-${status}`}>{defaultOrderStatusLabels[status]}</Label>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`status-enabled-${status}`}
                                checked={enabled}
                                onCheckedChange={(checked) => {
                                  const shouldEnable = checked === true;
                                  setCompanyForm((prev) => {
                                    const currentEnabled = prev.order_status_customization.enabled_statuses;
                                    const nextEnabled = shouldEnable
                                      ? Array.from(new Set([...currentEnabled, status]))
                                      : currentEnabled.filter((item) => item !== status);

                                    return {
                                      ...prev,
                                      order_status_customization: {
                                        ...prev.order_status_customization,
                                        enabled_statuses: nextEnabled,
                                      },
                                    };
                                  });
                                }}
                              />
                              <span className="text-xs text-muted-foreground">Exibir</span>
                            </div>
                          </div>
                          <Input
                            id={`status-label-${status}`}
                            value={companyForm.order_status_customization.labels[status] || ''}
                            onChange={(event) =>
                              setCompanyForm((prev) => ({
                                ...prev,
                                order_status_customization: {
                                  ...prev.order_status_customization,
                                  labels: {
                                    ...prev.order_status_customization.labels,
                                    [status]: event.target.value,
                                  },
                                },
                              }))
                            }
                            placeholder={defaultOrderStatusLabels[status]}
                          />
                          <div className="grid gap-2 sm:grid-cols-[96px,1fr]">
                            <div className="space-y-1">
                              <Label htmlFor={`status-color-${status}`} className="text-xs text-muted-foreground">
                                Cor
                              </Label>
                              <input
                                id={`status-color-${status}`}
                                type="color"
                                value={companyForm.order_status_customization.colors[status]}
                                onChange={(event) =>
                                  setCompanyForm((prev) => ({
                                    ...prev,
                                    order_status_customization: {
                                      ...prev.order_status_customization,
                                      colors: {
                                        ...prev.order_status_customization.colors,
                                        [status]: event.target.value,
                                      },
                                    },
                                  }))
                                }
                                className="h-10 w-full cursor-pointer rounded-md border border-border bg-background p-1"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Preview</Label>
                              <div className="flex min-h-10 items-center">
                                <span
                                  className="status-badge"
                                  style={getOrderStatusBadgeStyle(status, companyForm.order_status_customization)}
                                >
                                  {companyForm.order_status_customization.labels[status] || defaultOrderStatusLabels[status]}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                
                <div className="space-y-3">
                  <Label htmlFor="birthday-template" className="flex items-center gap-2">
                    <Gift className="h-4 w-4" />
                    Mensagem de aniversário
                  </Label>
                  <TooltipProvider delayDuration={150}>
                    <div className="flex flex-wrap gap-2">
                      {birthdayPlaceholders.map((placeholder) => (
                        <Tooltip key={placeholder.value}>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => insertBirthdayPlaceholder(placeholder.value)}
                            >
                              {placeholder.label}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <p className="font-medium">{placeholder.description}</p>
                              <p className="mt-1 text-muted-foreground">{placeholder.value}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </TooltipProvider>
                  <Textarea
                    id="birthday-template"
                    ref={(textarea) => {
                      birthdayTemplateRef.current = textarea;
                      registerMessageTextarea('birthday-template', textarea);
                    }}
                    value={companyForm.birthday_message_template}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, birthday_message_template: e.target.value });
                      autoResizeTextarea(e.currentTarget);
                    }}
                    placeholder="Olá {cliente_nome}, feliz aniversário! Que seu dia seja especial. {empresa_nome}"
                    className="!min-h-0 resize-none overflow-hidden"
                    rows={1}
                  />
                  <div className="text-xs text-muted-foreground">
                    Variáveis disponíveis:
                    <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      <span>{'{cliente_nome}'}</span>
                      <span>{'{cliente_telefone}'}</span>
                      <span>{'{cliente_idade}'}</span>
                      <span>{'{aniversario_data}'}</span>
                      <span>{'{empresa_nome}'}</span>
                    </div>
                  </div>
                </div>

                </TabsContent>

                <TabsContent value="permissoes" className="mt-0 space-y-6">
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Label className="flex items-center gap-2">
                        <SettingsIcon className="h-4 w-4" />
                        Permissões por módulo e perfil
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Libere ou bloqueie o acesso aos módulos por cargo de usuário desta empresa.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetRoleModulePermissions}
                    >
                      Restaurar padrão
                    </Button>
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Módulo</TableHead>
                          {storeAppRoles.map((roleName) => (
                            <TableHead key={`role-header-${roleName}`} className="text-center">
                              {storeRoleLabels[roleName]}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {moduleDefinitions.map((moduleItem) => (
                          <TableRow key={moduleItem.key}>
                            <TableCell>
                              <div className="font-medium">{moduleItem.label}</div>
                              <div className="text-xs text-muted-foreground">{moduleItem.description}</div>
                            </TableCell>
                            {storeAppRoles.map((roleName) => {
                              const locked = isModuleLockedForRole(roleName, moduleItem.key);
                              const checked = Boolean(
                                companyForm.role_module_permissions?.[roleName]?.[moduleItem.key],
                              );

                              return (
                                <TableCell key={`${moduleItem.key}-${roleName}`} className="text-center align-middle">
                                  <div className="flex items-center justify-center gap-2">
                                    <Checkbox
                                      id={`module-${moduleItem.key}-${roleName}`}
                                      checked={checked}
                                      disabled={locked}
                                      onCheckedChange={(value) =>
                                        setRoleModulePermission(roleName, moduleItem.key, value === true)
                                      }
                                    />
                                    {locked && (
                                      <span className="text-[10px] font-medium text-muted-foreground">
                                        Obrigatório
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                </TabsContent>
              </Tabs>
                <Button onClick={saveCompany} disabled={savingCompany || hasInvalidMinimumDelivery} className="w-full md:w-auto">
                  {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Alterações
                </Button>
            </CardContent>
          </Card>

        </TabsContent>
        <TabsContent value="catalog">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Personalização do Sistema
              </CardTitle>
              <CardDescription>
                A personalização do catálogo foi centralizada no módulo Catálogo para não depender mais das configurações gerais da loja.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">Gerencie em um único lugar:</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  título, descrição, botão principal, contato, exibição de preços, exibição de contato, cores, layout e formas de pagamento do checkout público.
                </p>
              </div>

              {company?.slug && (
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Catálogo público</p>
                  <code className="mt-2 block truncate text-sm">
                    {window.location.origin}/catalogo/{company.slug}
                  </code>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" className="gap-2" onClick={() => navigate('/catalogo-admin')}>
                  <SettingsIcon className="h-4 w-4" />
                  Abrir módulo Catálogo
                </Button>
                {company?.slug && (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => window.open(`/catalogo/${company.slug}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver catálogo público
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="theme">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Paintbrush2 className="h-5 w-5" />
                    Tema da Empresa
                  </CardTitle>
                  <CardDescription>
                    Personalize o visual do painel com a identidade da sua loja. As alterações são aplicadas globalmente após salvar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Ao enviar uma nova logo em Dados da Empresa, o sistema extrai automaticamente a cor principal e sugere uma nova paleta aqui. Você também pode aplicar templates prontos para começar mais rápido.
                  </div>

                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      Modo do sistema
                    </Label>
                    <RadioGroup
                      value={themeForm.theme_mode}
                      onValueChange={(value) => {
                        const nextMode = value as CompanyThemeMode;
                        updateThemeField('theme_mode', nextMode);
                        if (nextMode === 'light' || nextMode === 'dark') {
                          setThemePaletteMode(nextMode);
                        }
                      }}
                      className="grid gap-3 md:grid-cols-3"
                    >
                      {themeModeOptions.map((option) => (
                        <Label
                          key={option.value}
                          htmlFor={`theme-mode-${option.value}`}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4"
                        >
                          <RadioGroupItem id={`theme-mode-${option.value}`} value={option.value} className="mt-1" />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-medium text-foreground">
                              <option.icon className="h-4 w-4" />
                              {option.title}
                            </div>
                            <p className="text-xs text-muted-foreground">{option.description}</p>
                          </div>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="space-y-4">
                    <Label className="flex items-center gap-2">
                      <LayoutTemplate className="h-4 w-4" />
                      Templates de tema
                    </Label>
                    <div className="grid gap-3 md:grid-cols-2">
                      {themeTemplateOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => void applyThemeTemplatePreset(option.value)}
                          className="rounded-lg border border-border bg-background p-4 text-left transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-foreground">
                              {companyThemeTemplateLabels[option.value]}
                            </p>
                            {option.value === 'logo' && (
                              <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                Auto
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Cores do sistema
                    </Label>
                    <RadioGroup
                      value={themePaletteMode}
                      onValueChange={(value) => setThemePaletteMode(value as CompanyThemePaletteMode)}
                      className="grid gap-3 md:grid-cols-2"
                    >
                      {themePaletteModeOptions.map((option) => (
                        <Label
                          key={option.value}
                          htmlFor={`theme-palette-mode-${option.value}`}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4"
                        >
                          <RadioGroupItem
                            id={`theme-palette-mode-${option.value}`}
                            value={option.value}
                            className="mt-1"
                          />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-medium text-foreground">
                              <option.icon className="h-4 w-4" />
                              {option.title}
                            </div>
                            <p className="text-xs text-muted-foreground">{option.description}</p>
                          </div>
                        </Label>
                      ))}
                    </RadioGroup>
                    <div className="grid gap-4 md:grid-cols-2">
                      {themeColorFields.map((field) => (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={`theme-${themePaletteMode}-${field.key}`}>{field.label}</Label>
                          <div className="flex items-center gap-3">
                            <Input
                              id={`theme-${themePaletteMode}-${field.key}`}
                              type="color"
                              value={activeThemePalette[field.key]}
                              onChange={(event) => handleThemeColorChange(field.key, event.target.value)}
                              className="h-12 w-16 p-1"
                            />
                            <Input
                              value={activeThemePalette[field.key]}
                              onChange={(event) => handleThemeColorChange(field.key, event.target.value)}
                              onBlur={(event) =>
                                handleThemeColorChange(field.key, event.target.value)
                              }
                              placeholder="#000000"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutTemplate className="h-5 w-5" />
                    Estilo, densidade e fonte
                  </CardTitle>
                  <CardDescription>
                    Ajuste a presença visual dos botões, o arredondamento da interface e a densidade do layout.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Estilo dos botões</Label>
                    <RadioGroup
                      value={themeForm.button_style}
                      onValueChange={(value) =>
                        updateThemeField('button_style', value as CompanyThemeButtonStyle)
                      }
                      className="grid gap-3 md:grid-cols-2"
                    >
                      {buttonStyleOptions.map((option) => (
                        <Label
                          key={option.value}
                          htmlFor={`button-style-${option.value}`}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4"
                        >
                          <RadioGroupItem id={`button-style-${option.value}`} value={option.value} className="mt-1" />
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">{option.title}</div>
                            <p className="text-xs text-muted-foreground">{option.description}</p>
                          </div>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <Label>Arredondamento</Label>
                      <RadioGroup
                        value={themeForm.border_radius}
                        onValueChange={(value) =>
                          updateThemeField('border_radius', value as CompanyThemeBorderRadius)
                        }
                        className="space-y-2"
                      >
                        {borderRadiusOptions.map((option) => (
                          <Label
                            key={option.value}
                            htmlFor={`border-radius-${option.value}`}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
                          >
                            <RadioGroupItem id={`border-radius-${option.value}`} value={option.value} className="mt-1" />
                            <div className="space-y-1">
                              <div className="font-medium text-foreground">{option.title}</div>
                              <p className="text-xs text-muted-foreground">{option.description}</p>
                            </div>
                          </Label>
                        ))}
                      </RadioGroup>
                    </div>

                    <div className="space-y-3">
                      <Label>Espessura das bordas</Label>
                      <RadioGroup
                        value={themeForm.border_size}
                        onValueChange={(value) =>
                          updateThemeField('border_size', value as CompanyThemeBorderSize)
                        }
                        className="space-y-2"
                      >
                        {borderSizeOptions.map((option) => (
                          <Label
                            key={option.value}
                            htmlFor={`border-size-${option.value}`}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
                          >
                            <RadioGroupItem id={`border-size-${option.value}`} value={option.value} className="mt-1" />
                            <div className="space-y-1">
                              <div className="font-medium text-foreground">{option.title}</div>
                              <p className="text-xs text-muted-foreground">{option.description}</p>
                            </div>
                          </Label>
                        ))}
                      </RadioGroup>
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <Label>Layout do sistema</Label>
                      <RadioGroup
                        value={themeForm.layout_density}
                        onValueChange={(value) =>
                          updateThemeField('layout_density', value as CompanyThemeLayoutDensity)
                        }
                        className="space-y-2"
                      >
                        {densityOptions.map((option) => (
                          <Label
                            key={option.value}
                            htmlFor={`layout-density-${option.value}`}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
                          >
                            <RadioGroupItem id={`layout-density-${option.value}`} value={option.value} className="mt-1" />
                            <div className="space-y-1">
                              <div className="font-medium text-foreground">{option.title}</div>
                              <p className="text-xs text-muted-foreground">{option.description}</p>
                            </div>
                          </Label>
                        ))}
                      </RadioGroup>
                    </div>

                    <div className="space-y-3">
                      <Label>Impacto do layout</Label>
                      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                        O layout compacto ou espaçado continua afetando cards, tabelas, formulários e navegação lateral em todo o sistema.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Type className="h-4 w-4" />
                      Fonte do sistema
                    </Label>
                    <Select
                      value={themeForm.font_family}
                      onValueChange={(value) =>
                        updateThemeField('font_family', value as CompanyThemeFontFamily)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a fonte" />
                      </SelectTrigger>
                      <SelectContent>
                        {fontOptions.map((fontName) => (
                          <SelectItem key={fontName} value={fontName}>
                            {fontName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="button"
                      onClick={saveTheme}
                      disabled={savingTheme || loadingCompanyTheme || !profile?.company_id || !hasThemeChanges}
                    >
                      {savingTheme && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar tema
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!originalThemeForm || savingTheme}
                      onClick={() => {
                        if (!originalThemeForm) return;
                        setThemeForm(originalThemeForm);
                      }}
                    >
                      Restaurar edição
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6 xl:sticky xl:top-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutGrid className="h-5 w-5" />
                    Preview em tempo real
                  </CardTitle>
                  <CardDescription>
                    Navbar, menu lateral, botões, cards, inputs e listagens usando o tema configurado.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CompanyThemePreview theme={themeForm} previewMode={themePaletteMode} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {isAdmin && (
        <Card className="mt-8 border-destructive/35 bg-[linear-gradient(135deg,hsl(var(--destructive)/0.16),transparent_58%),hsl(var(--card))]">
          <CardHeader>
            <CardTitle className="text-destructive">Área de perigo</CardTitle>
            <CardDescription className="text-destructive/80">
              Ações irreversíveis para dados da empresa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">Zerar dados da empresa</p>
                <p className="text-sm text-muted-foreground">
                  Remove pedidos, produtos, clientes e movimentações da empresa.
                </p>
              </div>
              <Button variant="destructive" onClick={() => setDangerOpen(true)}>
                Zerar dados
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dangerOpen} onOpenChange={setDangerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zerar dados da empresa</DialogTitle>
            <DialogDescription>
              Confirme sua senha e os campos abaixo para continuar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Esta ação é irreversível. Todos os pedidos, produtos e clientes serão apagados permanentemente.
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-password">Senha atual do admin</Label>
              <Input
                id="reset-password"
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-word">Digite RESETAR</Label>
              <Input
                id="reset-word"
                value={resetConfirmText}
                onChange={(event) => setResetConfirmText(event.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="reset-confirm"
                checked={resetChecked}
                onCheckedChange={(checked) => setResetChecked(checked === true)}
              />
              <Label htmlFor="reset-confirm">Eu entendo que isso é irreversível</Label>
            </div>

            {resetError && <p className="text-sm text-destructive">{resetError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDangerOpen(false)} disabled={resetLoading}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetCompany}
              disabled={!resetReady || resetLoading}
            >
              {resetLoading ? 'Zerando...' : 'Confirmar e Zerar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Badge */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="inline-flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 shadow-sm">
          <div className="text-sm text-muted-foreground">
            {companyLoading || loadingCompanyTheme ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </span>
            ) : !company ? null : hasPendingChanges ? (
              <span className="text-amber-600 dark:text-amber-400">
                Alterações não salvas
              </span>
            ) : isSaved ? (
              <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="h-4 w-4" />
                Salvo
              </span>
            ) : null}
          </div>
          <Button
            onClick={() => {
              setNameTouched(true);
              if (!companyForm.name.trim()) {
                setNameError(true);
                return;
              }
              saveCompany();
            }}
            disabled={
              savingCompany ||
              savingTheme ||
              nameError ||
              !company ||
              !hasPendingChanges ||
              hasInvalidMinimumDelivery
            }
            size="lg"
            className="min-w-[200px] hidden"
          >
            {savingCompany || savingTheme ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : hasPendingChanges ? (
              "Salvar Alterações"
            ) : (
              "Salvo"
            )}
          </Button>
        </div>
      </div>

    </div>
  );
}






