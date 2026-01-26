import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Search,
    LayoutGrid,
    List as ListIcon,
    MoreVertical,
    Edit,
    Trash2,
    ExternalLink,
    Calendar,
    Image as ImageIcon,
    CheckCircle2,
    XCircle,
    Clock,
    Upload,
    Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Banner {
    id: string;
    company_id: string;
    title: string | null;
    image_url: string;
    link_url: string | null;
    position: 'catalog' | 'dashboard';
    is_active: boolean;
    sort_order: number;
    starts_at: string | null;
    ends_at: string | null;
    created_at: string;
}

const emptyBanner: Partial<Banner> = {
    title: '',
    image_url: '',
    link_url: '',
    position: 'catalog',
    is_active: true,
    sort_order: 0,
    starts_at: null,
    ends_at: null,
};

export default function BannerManagement() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Form State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [currentBanner, setCurrentBanner] = useState<Partial<Banner>>(emptyBanner);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [initialBannerSnapshot, setInitialBannerSnapshot] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLDivElement>(null);
    const confirm = useConfirm();

    const currentSnapshot = useMemo(() => JSON.stringify(currentBanner), [currentBanner]);
    const isDirty = Boolean(
        isDialogOpen
        && initialBannerSnapshot
        && initialBannerSnapshot !== currentSnapshot
    );

    useUnsavedChanges(isDirty && !saving);

    useEffect(() => {
        if (profile?.company_id) {
            loadBanners();
        }
    }, [profile?.company_id]);

    const loadBanners = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('banners')
                .select('*')
                .eq('company_id', profile!.company_id)
                .order('sort_order', { ascending: true });

            if (error) throw error;
            setBanners(data || []);
        } catch (error: any) {
            toast.error('Erro ao carregar banners: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenCreate = () => {
        const nextBanner = { ...emptyBanner, company_id: profile?.company_id };
        setCurrentBanner(nextBanner);
        setInitialBannerSnapshot(JSON.stringify(nextBanner));
        setIsDialogOpen(true);
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    };

    const handleOpenEdit = (banner: Banner) => {
        setCurrentBanner(banner);
        setInitialBannerSnapshot(JSON.stringify(banner));
        setIsDialogOpen(true);
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    };

    const handleDelete = async (id: string) => {
        const approved = await confirm({
            title: 'Excluir banner',
            description: 'Tem certeza que deseja excluir este banner?',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            destructive: true,
        });
        if (!approved) return;

        try {
            const { error } = await supabase
                .from('banners')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Banner excluído com sucesso');
            loadBanners();
        } catch (error: any) {
            toast.error('Erro ao excluir banner: ' + error.message);
        }
    };

    const handleToggleActive = async (banner: Banner) => {
        try {
            const { error } = await supabase
                .from('banners')
                .update({ is_active: !banner.is_active })
                .eq('id', banner.id);

            if (error) throw error;
            setBanners(banners.map(b => b.id === banner.id ? { ...b, is_active: !b.is_active } : b));
        } catch (error: any) {
            toast.error('Erro ao atualizar status: ' + error.message);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `banners/${profile?.company_id}/${Math.random()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

            setCurrentBanner(prev => ({ ...prev, image_url: publicUrl }));
            toast.success('Imagem enviada com sucesso');
        } catch (error: any) {
            toast.error('Erro ao enviar imagem: ' + error.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSave = async () => {
        if (!currentBanner.image_url) {
            toast.error('A imagem do banner é obrigatória');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                ...currentBanner,
                title: currentBanner.title || null,
                link_url: currentBanner.link_url || null,
                company_id: profile?.company_id,
            };

            if (currentBanner.id) {
                const { error } = await supabase
                    .from('banners')
                    .update(payload)
                    .eq('id', currentBanner.id);
                if (error) throw error;
                toast.success('Banner atualizado com sucesso');
            } else {
                const { error } = await supabase
                    .from('banners')
                    .insert(payload);
                if (error) throw error;
                toast.success('Banner criado com sucesso');
            }

            setIsDialogOpen(false);
            loadBanners();
        } catch (error: any) {
            toast.error('Erro ao salvar banner: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const filteredBanners = banners.filter(b =>
        (b.title?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (b.link_url?.toLowerCase() || '').includes(search.toLowerCase())
    );

    const getStatusBadge = (banner: Banner) => {
        const now = new Date();
        const start = banner.starts_at ? new Date(banner.starts_at) : null;
        const end = banner.ends_at ? new Date(banner.ends_at) : null;

        if (!banner.is_active) return <Badge variant="secondary">Inativo</Badge>;
        if (start && start > now) return <Badge variant="outline" className="text-blue-500 border-blue-500">Agendado</Badge>;
        if (end && end < now) return <Badge variant="outline" className="text-red-500 border-red-500">Expirado</Badge>;
        return <Badge className="bg-emerald-500">Ativo</Badge>;
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Banners</h1>
                    <p className="text-muted-foreground">Gerencie propagandas e avisos para catálogo ou dashboard</p>
                </div>
                <Button onClick={handleOpenCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Banner
                </Button>
            </div>

            {isDialogOpen && (
                <Card ref={formRef} className="mb-6 border border-muted-foreground/10">
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle>{currentBanner.id ? 'Editar Banner' : 'Novo Banner'}</CardTitle>
                                <CardDescription>
                                    Preencha os dados abaixo para configurar o banner.
                                </CardDescription>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsDialogOpen(false)}
                            >
                                Fechar
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                        <div className="grid gap-2">
                            <Label>Imagem do Banner *</Label>
                            <div
                                className="relative aspect-[21/9] border-2 border-dashed rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 transition-colors flex items-center justify-center bg-muted/20"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {currentBanner.image_url ? (
                                    <>
                                        <img
                                            src={ensurePublicStorageUrl('product-images', currentBanner.image_url) || ''}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                            <Button variant="secondary" size="sm">Trocar imagem</Button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center">
                                        {uploading ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                                <span className="text-sm text-muted-foreground">Enviando...</span>
                                            </div>
                                        ) : (
                                            <>
                                                <ImageIcon className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                                                <p className="text-sm text-muted-foreground">Clique para selecionar</p>
                                                <p className="text-[10px] text-muted-foreground mt-1">Recomendado: 1200x500px</p>
                                            </>
                                        )}
                                    </div>
                                )}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    disabled={uploading}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="title">Título (opcional)</Label>
                                <Input
                                    id="title"
                                    value={currentBanner.title || ''}
                                    onChange={(e) => setCurrentBanner(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="Promoção de Verão"
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="position">Onde exibir *</Label>
                                <Select
                                    value={currentBanner.position}
                                    onValueChange={(val: any) => setCurrentBanner(prev => ({ ...prev, position: val }))}
                                >
                                    <SelectTrigger id="position">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="catalog">Catálogo Online</SelectItem>
                                        <SelectItem value="dashboard">Dashboard Interno</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="link">Link de Redirecionamento</Label>
                                <Input
                                    id="link"
                                    value={currentBanner.link_url || ''}
                                    onChange={(e) => setCurrentBanner(prev => ({ ...prev, link_url: e.target.value }))}
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="order">Ordem de Exibição</Label>
                                <Input
                                    id="order"
                                    type="number"
                                    value={currentBanner.sort_order}
                                    onChange={(e) => setCurrentBanner(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="start">Data de Início</Label>
                                <Input
                                    id="start"
                                    type="datetime-local"
                                    value={currentBanner.starts_at ? currentBanner.starts_at.slice(0, 16) : ''}
                                    onChange={(e) => setCurrentBanner(prev => ({ ...prev, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="end">Data de Fim</Label>
                                <Input
                                    id="end"
                                    type="datetime-local"
                                    value={currentBanner.ends_at ? currentBanner.ends_at.slice(0, 16) : ''}
                                    onChange={(e) => setCurrentBanner(prev => ({ ...prev, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 border p-3 rounded-md bg-muted/20">
                            <Switch
                                id="active"
                                checked={currentBanner.is_active}
                                onCheckedChange={(val) => setCurrentBanner(prev => ({ ...prev, is_active: val }))}
                            />
                            <Label htmlFor="active" className="cursor-pointer">Banner Ativo</Label>
                            <p className="text-[10px] text-muted-foreground ml-auto">
                                Desative para ocultar o banner manualmente.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSave} disabled={saving || uploading}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {currentBanner.id ? 'Salvar Alterações' : 'Criar Banner'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar banners..."
                        className="pl-10"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 border rounded-md p-1 bg-muted/50">
                    <Button
                        variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="px-2 h-8"
                        onClick={() => setViewMode('grid')}
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="px-2 h-8"
                        onClick={() => setViewMode('list')}
                    >
                        <ListIcon className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => (
                        <Card key={i} className="animate-pulse">
                            <div className="aspect-video bg-muted rounded-t-lg" />
                            <CardHeader className="space-y-2">
                                <div className="h-4 bg-muted rounded w-3/4" />
                                <div className="h-3 bg-muted rounded w-1/2" />
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            ) : filteredBanners.length === 0 ? (
                <div className="text-center py-20 bg-muted/30 rounded-lg border-2 border-dashed">
                    <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium">Nenhum banner encontrado</h3>
                    <p className="text-muted-foreground mb-6">Comece criando seu primeiro banner promocional.</p>
                    <Button onClick={handleOpenCreate}>Criar Banner</Button>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredBanners.map((banner) => (
                        <Card key={banner.id} className="overflow-hidden group">
                            <div className="relative aspect-[21/9] bg-muted overflow-hidden">
                                <img
                                    src={ensurePublicStorageUrl('product-images', banner.image_url) || ''}
                                    alt={banner.title || 'Banner'}
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                />
                                <div className="absolute top-2 right-2 flex gap-2">
                                    {getStatusBadge(banner)}
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button size="icon" variant="secondary" onClick={() => handleOpenEdit(banner)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="destructive" onClick={() => handleDelete(banner.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h3 className="font-semibold line-clamp-1">{banner.title || 'Sem título'}</h3>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            {banner.position === 'catalog' ? 'Catálogo' : 'Dashboard'} · Ordem: {banner.sort_order}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={banner.is_active}
                                        onCheckedChange={() => handleToggleActive(banner)}
                                    />
                                </div>

                                {banner.link_url && (
                                    <div className="flex items-center gap-1 mt-3 text-xs text-blue-500 truncate underline">
                                        <ExternalLink className="h-3 w-3" />
                                        {banner.link_url}
                                    </div>
                                )}

                                {(banner.starts_at || banner.ends_at) && (
                                    <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                                        <Calendar className="h-3 w-3" />
                                        {banner.starts_at && format(new Date(banner.starts_at), 'dd/MM/yy')}
                                        {banner.starts_at && banner.ends_at && ' até '}
                                        {banner.ends_at && format(new Date(banner.ends_at), 'dd/MM/yy')}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="border rounded-md overflow-hidden bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="text-left py-3 px-4 font-medium">Banner</th>
                                <th className="text-left py-3 px-4 font-medium">Título</th>
                                <th className="text-left py-3 px-4 font-medium">Posição</th>
                                <th className="text-left py-3 px-4 font-medium">Status</th>
                                <th className="text-left py-3 px-4 font-medium">Agendamento</th>
                                <th className="text-right py-3 px-4 font-medium">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBanners.map((banner) => (
                                <tr key={banner.id} className="border-b last:border-0 hover:bg-muted/30">
                                    <td className="py-3 px-4">
                                        <div className="w-20 aspect-video rounded overflow-hidden bg-muted">
                                            <img
                                                src={ensurePublicStorageUrl('product-images', banner.image_url) || ''}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className="font-medium">{banner.title || '-'}</span>
                                    </td>
                                    <td className="py-3 px-4">
                                        {banner.position === 'catalog' ? 'Catálogo' : 'Dashboard'}
                                    </td>
                                    <td className="py-3 px-4">
                                        {getStatusBadge(banner)}
                                    </td>
                                    <td className="py-3 px-4 text-xs text-muted-foreground">
                                        {banner.starts_at ? format(new Date(banner.starts_at), 'dd/MM/yy') : '-'}
                                        {' — '}
                                        {banner.ends_at ? format(new Date(banner.ends_at), 'dd/MM/yy') : '-'}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleOpenEdit(banner)}>
                                                    <Edit className="h-4 w-4 mr-2" /> Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleToggleActive(banner)}>
                                                    {banner.is_active ? <XCircle className="h-4 w-4 mr-2 text-red-500" /> : <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" />}
                                                    {banner.is_active ? 'Desativar' : 'Ativar'}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(banner.id)}>
                                                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
