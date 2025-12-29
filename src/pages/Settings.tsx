import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Edit, Trash2, Building2, Upload, Loader2, MapPin, Phone, Mail, Globe, ExternalLink, Copy, Check, Palette, LayoutGrid, List, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { PhoneInput } from '@/components/ui/masked-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Category, Supply, Attribute, AttributeValue, Company } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { z } from 'zod';
import { ensurePublicStorageUrl } from '@/lib/storage';

const categorySchema = z.object({ name: z.string().min(2).max(50) });
const supplySchema = z.object({
  name: z.string().min(2).max(100),
  unit: z.string().min(1).max(10),
  cost_per_unit: z.number().min(0),
  min_stock: z.number().min(0),
});
const attributeSchema = z.object({ name: z.string().min(2).max(50) });

export default function Settings() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [catalogPreviewVisible, setCatalogPreviewVisible] = useState(false);
  const [catalogPreviewKey, setCatalogPreviewKey] = useState(0);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    description: "",
    email: "",
    phone: "",
    whatsapp: "",
    address: "",
    city: "",
    state: "",
    instagram: "",
    facebook: "",
    minimum_order_value: 0,
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
  // Controla a aba por estado para evitar reload e manter o estado dos formulários.
  const [activeTab, setActiveTab] = useState<'company' | 'catalog'>('company');

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
      setCompany({
        ...(data as Company),
        logo_url: normalizedLogoUrl,
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
          phone: data.phone || "",
          whatsapp: data.whatsapp || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          instagram: data.instagram || "",
          facebook: data.facebook || "",
          minimum_order_value: Number(data.minimum_order_value ?? 0),
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
          catalog_layout: (data as any).catalog_layout || "grid",
        };
        setCompanyForm(formData);
        setOriginalForm(formData);
        setLogoPreview(normalizedLogoUrl);
        setIsSaved(true);
      }
    }
    setCompanyLoading(false);
  }, [originalForm, toast]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Check for pending changes
  const hasChanges = useMemo(() => {
    return !!originalForm && (
      JSON.stringify(companyForm) !== JSON.stringify(originalForm) || logoFile !== null
    );
  }, [originalForm, companyForm, logoFile]);

  // Update isSaved when form changes
  useEffect(() => {
    if (hasChanges) {
      setIsSaved(false);
    }
  }, [hasChanges]);

  useEffect(() => {
    if (activeTab === 'catalog' && hasChanges) {
      setCatalogPreviewVisible(false);
    }
  }, [activeTab, hasChanges]);

  // Warn before closing/refreshing the page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

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

    setSavingCompany(true);

    try {
      let logoUrl = company.logo_url;

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
          throw new Error("Logo URL not returned");
        }

        logoUrl = ensurePublicStorageUrl('product-images', urlData.publicUrl);
      }

      const { data: updatedCompany, error } = await supabase
        .from('companies')
        .update({
          name: companyName,
          description: companyForm.description || null,
          email: companyForm.email || null,
          phone: companyForm.phone || null,
          whatsapp: companyForm.whatsapp || null,
          address: companyForm.address || null,
          city: companyForm.city || null,
          state: companyForm.state || null,
          instagram: companyForm.instagram || null,
          facebook: companyForm.facebook || null,
          minimum_order_value: Number(companyForm.minimum_order_value || 0),
          logo_url: logoUrl,
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
        } as any)
        .eq('id', company.id)
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Empresa atualizada com sucesso!" });
      const normalizedUpdatedLogo = ensurePublicStorageUrl('product-images', updatedCompany?.logo_url || null);
      setCompany({
        ...(updatedCompany as Company),
        logo_url: normalizedUpdatedLogo,
      });
      setLogoFile(null);
      setLogoPreview(normalizedUpdatedLogo);
      setIsSaved(true);
      setOriginalForm(companyForm);
      if (activeTab === 'catalog') {
        setCatalogPreviewVisible(true);
        setCatalogPreviewKey((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSavingCompany(false);
    }
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

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

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'company' | 'catalog')}>

        <TabsList>
          <TabsTrigger value="company" type="button">Empresa</TabsTrigger>
          <TabsTrigger value="catalog" type="button">Personalização</TabsTrigger>
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

              <div className="space-y-2">
                <Label htmlFor="company-min-order">Valor minimo do pedido</Label>
                <CurrencyInput
                  id="company-min-order"
                  value={Number(companyForm.minimum_order_value || 0)}
                  onChange={(value) => setCompanyForm({ ...companyForm, minimum_order_value: value })}
                />
                <p className="text-sm text-muted-foreground">
                  Pedidos do catalogo so poderao ser enviados a partir desse valor.
                </p>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
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
                <div className="grid grid-cols-2 gap-4">
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

              <Button onClick={saveCompany} disabled={savingCompany} className="w-full md:w-auto">
                {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </CardContent>
          </Card>

        </TabsContent>
        {/* Personalização */}
        <TabsContent value="catalog">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Personalização do Catálogo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Catalog Colors */}
              <div className="space-y-4" data-catalog-settings>
                <Label className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Cores do Catálogo
                </Label>
                <p className="text-sm text-muted-foreground">
                  Personalize as cores do seu catálogo público
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="catalog-header-bg" className="text-sm">Topo - fundo</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-header-bg"
                        value={companyForm.catalog_header_bg_color}
                        onChange={(e) => setCompanyForm({
                          ...companyForm,
                          catalog_header_bg_color: e.target.value,
                          catalog_secondary_color: e.target.value,
                        })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_header_bg_color}
                        onChange={(e) => setCompanyForm({
                          ...companyForm,
                          catalog_header_bg_color: e.target.value,
                          catalog_secondary_color: e.target.value,
                        })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fundo da barra superior do catalogo.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-header-text" className="text-sm">Topo - texto e icones</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-header-text"
                        value={companyForm.catalog_header_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_header_text_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_header_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_header_text_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cor dos textos e icones no topo.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-footer-bg" className="text-sm">Rodape - fundo</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-footer-bg"
                        value={companyForm.catalog_footer_bg_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_footer_bg_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_footer_bg_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_footer_bg_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fundo do rodape do catalogo.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-footer-text" className="text-sm">Rodape - texto</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-footer-text"
                        value={companyForm.catalog_footer_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_footer_text_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_footer_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_footer_text_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cor do texto do rodape.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-price" className="text-sm">Preco</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-price"
                        value={companyForm.catalog_price_color}
                        onChange={(e) => setCompanyForm({
                          ...companyForm,
                          catalog_price_color: e.target.value,
                          catalog_accent_color: e.target.value,
                        })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_price_color}
                        onChange={(e) => setCompanyForm({
                          ...companyForm,
                          catalog_price_color: e.target.value,
                          catalog_accent_color: e.target.value,
                        })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cor usada no preco do produto.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-badge-bg" className="text-sm">Badge - fundo</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-badge-bg"
                        value={companyForm.catalog_badge_bg_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_badge_bg_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_badge_bg_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_badge_bg_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fundo dos badges de categoria.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-badge-text" className="text-sm">Badge - texto</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-badge-text"
                        value={companyForm.catalog_badge_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_badge_text_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_badge_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_badge_text_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cor do texto dentro dos badges.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-button-bg" className="text-sm">Botao principal - fundo</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-button-bg"
                        value={companyForm.catalog_button_bg_color}
                        onChange={(e) => setCompanyForm({
                          ...companyForm,
                          catalog_button_bg_color: e.target.value,
                          catalog_primary_color: e.target.value,
                        })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_button_bg_color}
                        onChange={(e) => setCompanyForm({
                          ...companyForm,
                          catalog_button_bg_color: e.target.value,
                          catalog_primary_color: e.target.value,
                        })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fundo do botao principal.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-button-text" className="text-sm">Botao principal - texto</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-button-text"
                        value={companyForm.catalog_button_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_button_text_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_button_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_button_text_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cor do texto do botao principal.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-button-outline" className="text-sm">Botao outline - cor</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-button-outline"
                        value={companyForm.catalog_button_outline_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_button_outline_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_button_outline_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_button_outline_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cor da borda e do texto no botao outline.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-card-bg" className="text-sm">Card - fundo</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-card-bg"
                        value={companyForm.catalog_card_bg_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_card_bg_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_card_bg_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_card_bg_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fundo dos cards de produto.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-card-border" className="text-sm">Card - borda</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-card-border"
                        value={companyForm.catalog_card_border_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_card_border_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_card_border_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_card_border_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cor da borda dos cards.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-filter-bg" className="text-sm">Filtros/abas - fundo</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-filter-bg"
                        value={companyForm.catalog_filter_bg_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_filter_bg_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_filter_bg_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_filter_bg_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fundo do filtro selecionado.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-filter-text" className="text-sm">Filtros/abas - texto</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-filter-text"
                        value={companyForm.catalog_filter_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_filter_text_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_filter_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_filter_text_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cor do texto do filtro selecionado.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-text" className="text-sm">Texto geral</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="catalog-text"
                        value={companyForm.catalog_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_text_color: e.target.value })}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={companyForm.catalog_text_color}
                        onChange={(e) => setCompanyForm({ ...companyForm, catalog_text_color: e.target.value })}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cor padrao dos textos do catalogo.
                    </p>
                  </div>
                </div>
                {/* Color Preview */}
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/30 text-xs">
                  <span className="text-muted-foreground">Preview:</span>
                  <span className="flex items-center gap-1">
                    <span className="h-4 w-4 rounded border" style={{ backgroundColor: companyForm.catalog_header_bg_color }} />
                    Topo fundo
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-4 w-4 rounded border" style={{ backgroundColor: companyForm.catalog_footer_bg_color }} />
                    Rodape fundo
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-4 w-4 rounded border" style={{ backgroundColor: companyForm.catalog_button_bg_color }} />
                    Botao fundo
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-4 w-4 rounded border" style={{ backgroundColor: companyForm.catalog_badge_bg_color }} />
                    Badge fundo
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="h-4 w-4 rounded border"
                      style={{ borderColor: companyForm.catalog_button_outline_color }}
                    />
                    Botao outline
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-4 w-4 rounded border" style={{ backgroundColor: companyForm.catalog_filter_bg_color }} />
                    Filtro fundo
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="h-4 w-4 rounded border"
                      style={{
                        backgroundColor: companyForm.catalog_card_bg_color,
                        borderColor: companyForm.catalog_card_border_color,
                      }}
                    />
                    Card
                  </span>
                  <span className="font-medium" style={{ color: companyForm.catalog_header_text_color }}>
                    Topo texto
                  </span>
                  <span className="font-medium" style={{ color: companyForm.catalog_footer_text_color }}>
                    Rodape texto
                  </span>
                  <span className="font-medium" style={{ color: companyForm.catalog_button_text_color }}>
                    Botao texto
                  </span>
                  <span className="font-medium" style={{ color: companyForm.catalog_badge_text_color }}>
                    Badge texto
                  </span>
                  <span className="font-medium" style={{ color: companyForm.catalog_price_color }}>
                    Preco
                  </span>
                  <span className="font-medium" style={{ color: companyForm.catalog_filter_text_color }}>
                    Filtro texto
                  </span>
                  <span className="font-medium" style={{ color: companyForm.catalog_text_color }}>
                    Texto geral
                  </span>
                </div>
              </div>

              {/* Layout Option */}
              <div className="space-y-4">
                <Label className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  Layout Padrão do Catálogo
                </Label>
                <p className="text-sm text-muted-foreground">
                  Escolha o layout padrão para exibição dos produtos
                </p>
                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant={companyForm.catalog_layout === 'grid' ? 'default' : 'outline'}
                    onClick={() => setCompanyForm({ ...companyForm, catalog_layout: 'grid' })}
                    className="flex-1 gap-2"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Grade
                  </Button>
                  <Button
                    type="button"
                    variant={companyForm.catalog_layout === 'list' ? 'default' : 'outline'}
                    onClick={() => setCompanyForm({ ...companyForm, catalog_layout: 'list' })}
                    className="flex-1 gap-2"
                  >
                    <List className="h-4 w-4" />
                    Lista
                  </Button>
                </div>
              </div>

              <Button onClick={saveCompany} disabled={savingCompany} className="w-full md:w-auto">
                {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alteracoes
              </Button>
            </CardContent>
          </Card>
          {/* Catalog Preview Card */}
          {activeTab === 'catalog' && company?.slug && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Catálogo Público
                </CardTitle>
                <CardDescription>
                  Compartilhe seu catálogo de produtos com clientes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <code className="flex-1 text-sm truncate">
                    {window.location.origin}/catalogo/{company.slug}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/catalogo/${company.slug}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(`/catalogo/${company.slug}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir Catálogo
                  </Button>
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => {
                      // Mantém a troca de abas via estado para evitar reload.
                      setActiveTab('catalog');
                      setTimeout(() => {
                        document.querySelector('[data-catalog-settings]')?.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    }}
                  >
                    <SettingsIcon className="h-4 w-4 mr-2" />
                    Configurar Catálogo
                  </Button>
                </div>

                {/* Preview iframe */}
                <div className="border rounded-lg overflow-hidden bg-background">
                  <div className="bg-muted px-3 py-2 border-b flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-destructive/50" />
                      <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
                      <div className="h-3 w-3 rounded-full bg-green-500/50" />
                    </div>
                    <span className="text-xs text-muted-foreground truncate flex-1 text-center">
                      {window.location.origin}/catalogo/{company.slug}
                    </span>
                  </div>
                  {catalogPreviewVisible ? (
                    <iframe
                      key={catalogPreviewKey}
                      src={`/catalogo/${company.slug}`}
                      className="w-full h-[400px] border-0"
                      title="Catologo Preview"
                    />
                  ) : (
                    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                      Salve as alteracoes para atualizar o preview do catalogo.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </TabsContent>
      </Tabs>

      {/* Status Badge */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="inline-flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 shadow-sm">
          <div className="text-sm text-muted-foreground">
            {companyLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </span>
            ) : !company ? null : hasChanges ? (
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
            disabled={savingCompany || nameError || !company || !hasChanges}
            size="lg"
            className="min-w-[200px] hidden"
          >
            {savingCompany ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : hasChanges ? (
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



