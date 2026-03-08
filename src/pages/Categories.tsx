import { useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  FolderPlus,
  FolderTree,
  GripVertical,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Category, Product } from '@/types/database';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { useAuth } from '@/contexts/AuthContext';
import { categoryIconOptions, CategoryIcon } from '@/lib/categoryIcons';
import {
  buildCategoryProductCountMap,
  buildCategoryTree,
  collectDescendantIds,
  flattenCategoryTree,
} from '@/lib/categoryTree';
import { ensurePublicStorageUrl, getStoragePathFromUrl } from '@/lib/storage';

type ParentOption = {
  id: string;
  name: string;
  level: number;
};

type DropMode = 'before' | 'inside' | 'after';

type DropTarget = {
  targetId: string;
  mode: DropMode;
} | null;

type CategoryFormState = {
  name: string;
  parent_id: string | null;
  icon_name: string | null;
  icon_url: string | null;
};

const emptyForm: CategoryFormState = {
  name: '',
  parent_id: null,
  icon_name: 'LayoutGrid',
  icon_url: null,
};

const compareCategory = (a: Category, b: Category) => {
  const orderDiff = Number(a.order_position ?? 0) - Number(b.order_position ?? 0);
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name, 'pt-BR');
};

export default function Categories() {
  const { profile, company } = useAuth();
  const companyId = profile?.company_id || company?.id || null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Array<Pick<Product, 'id' | 'category_id'>>>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<string | null>(null);
  const [formData, setFormData] = useState<CategoryFormState>(emptyForm);

  useEffect(() => {
    void loadData();
  }, [companyId]);

  const loadData = async () => {
    setLoading(true);

    let categoriesQuery = supabase.from('categories').select('*');
    let productsQuery = supabase.from('products').select('id, category_id');

    if (companyId) {
      categoriesQuery = categoriesQuery.eq('company_id', companyId);
      productsQuery = productsQuery.eq('company_id', companyId);
    }

    const [{ data: categoriesData, error: categoriesError }, { data: productsData, error: productsError }] =
      await Promise.all([
        categoriesQuery.order('order_position', { ascending: true }).order('name', { ascending: true }),
        productsQuery,
      ]);

    if (categoriesError || productsError) {
      toast.error('Erro ao carregar categorias');
      setLoading(false);
      return;
    }

    setCategories(((categoriesData || []) as Category[]).sort(compareCategory));
    setProducts(((productsData || []) as Array<Pick<Product, 'id' | 'category_id'>>) || []);
    setLoading(false);
  };

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

  const displayCategories = useMemo(() => flattenCategoryTree(categoryTree), [categoryTree]);

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const productCountMap = useMemo(
    () => buildCategoryProductCountMap(categories, products as Product[]),
    [categories, products],
  );

  const descendantIds = useMemo(() => {
    if (!selectedCategory) return new Set<string>();
    return collectDescendantIds(categories, selectedCategory.id);
  }, [categories, selectedCategory]);

  const parentOptions = useMemo(() => {
    return displayCategories
      .filter(({ category }) => {
        if (!selectedCategory) return true;
        if (category.id === selectedCategory.id) return false;
        return !descendantIds.has(category.id);
      })
      .map(({ category, level }) => ({
        id: category.id,
        name: category.name,
        level,
      })) satisfies ParentOption[];
  }, [descendantIds, displayCategories, selectedCategory]);

  const formSnapshotJson = useMemo(() => JSON.stringify(formData), [formData]);
  const isDirty = dialogOpen && initialFormSnapshot !== null && initialFormSnapshot !== formSnapshotJson;

  useUnsavedChanges(isDirty && !saving);

  const getParentName = (parentId: string | null) => {
    if (!parentId) return 'Categoria principal';
    return categoryMap.get(parentId)?.name || 'Categoria principal';
  };

  const openDialog = (category?: Category) => {
    if (category) {
      const nextForm = {
        name: category.name,
        parent_id: category.parent_id || null,
        icon_name: category.icon_name || 'LayoutGrid',
        icon_url: category.icon_url || null,
      };
      setSelectedCategory(category);
      setFormData(nextForm);
      setInitialFormSnapshot(JSON.stringify(nextForm));
    } else {
      setSelectedCategory(null);
      setFormData(emptyForm);
      setInitialFormSnapshot(JSON.stringify(emptyForm));
    }
    setDialogOpen(true);
  };

  const openSubcategoryDialog = (parent: Category) => {
    const nextForm = {
      ...emptyForm,
      parent_id: parent.id,
    };
    setSelectedCategory(null);
    setFormData(nextForm);
    setInitialFormSnapshot(JSON.stringify(nextForm));
    setDialogOpen(true);
  };

  const handleIconUpload = async (file: File) => {
    if (!companyId) {
      toast.error('Empresa não identificada para salvar o ícone');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
    const objectPath = `categories/${companyId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

    setUploadingIcon(true);
    const { error } = await supabase.storage.from('product-images').upload(objectPath, file, {
      upsert: false,
      cacheControl: '3600',
      contentType: file.type || undefined,
    });
    setUploadingIcon(false);

    if (error) {
      toast.error('Não foi possível enviar o ícone da categoria');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      icon_url: objectPath,
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (selectedCategory && formData.parent_id) {
      if (formData.parent_id === selectedCategory.id) {
        toast.error('A categoria não pode ser pai de si mesma');
        return;
      }
      if (descendantIds.has(formData.parent_id)) {
        toast.error('Categoria pai inválida');
        return;
      }
    }

    setSaving(true);

    const siblingCategories = categories.filter(
      (category) =>
        category.id !== selectedCategory?.id &&
        (category.parent_id ?? null) === (formData.parent_id ?? null),
    );

    const categoryData = {
      company_id: companyId,
      name: formData.name.trim(),
      parent_id: formData.parent_id || null,
      icon_name: formData.icon_name || null,
      icon_url: formData.icon_url || null,
      order_position:
        selectedCategory?.order_position ??
        siblingCategories.length,
    };

    const { error } = selectedCategory
      ? await supabase.from('categories').update(categoryData).eq('id', selectedCategory.id)
      : await supabase.from('categories').insert(categoryData);

    if (error) {
      toast.error('Erro ao salvar categoria');
      setSaving(false);
      return;
    }

    toast.success(selectedCategory ? 'Categoria atualizada!' : 'Categoria criada!');
    setDialogOpen(false);
    setSaving(false);
    await loadData();
  };

  const handleDelete = async () => {
    if (!selectedCategory) return;

    const { error } = await supabase.from('categories').delete().eq('id', selectedCategory.id);

    if (error) {
      toast.error('Erro ao excluir categoria');
      return;
    }

    toast.success('Categoria excluída!');
    setDeleteDialogOpen(false);
    await loadData();
  };

  const persistCategoryMove = async (sourceId: string, targetId: string, mode: DropMode) => {
    const source = categoryMap.get(sourceId);
    const target = categoryMap.get(targetId);

    if (!source || !target || source.id === target.id) return;
    if (mode === 'inside' && collectDescendantIds(categories, source.id).has(target.id)) {
      toast.error('Não é possível mover uma categoria para dentro de uma subcategoria dela.');
      return;
    }

    const oldParentId = source.parent_id ?? null;
    const newParentId = mode === 'inside' ? target.id : target.parent_id ?? null;
    const sameParent = oldParentId === newParentId;

    const nextUpdates = new Map<string, { parent_id: string | null; order_position: number }>();

    const oldSiblings = categories
      .filter((category) => category.id !== source.id && (category.parent_id ?? null) === oldParentId)
      .sort(compareCategory);

    const newSiblings = categories
      .filter((category) => category.id !== source.id && (category.parent_id ?? null) === newParentId)
      .sort(compareCategory);

    if (!sameParent) {
      oldSiblings.forEach((category, index) => {
        nextUpdates.set(category.id, {
          parent_id: oldParentId,
          order_position: index,
        });
      });
    }

    const nextOrderedSiblings = [...newSiblings];
    const targetIndex = nextOrderedSiblings.findIndex((category) => category.id === target.id);
    const insertIndex =
      mode === 'inside'
        ? nextOrderedSiblings.length
        : targetIndex === -1
          ? nextOrderedSiblings.length
          : mode === 'before'
            ? targetIndex
            : targetIndex + 1;

    nextOrderedSiblings.splice(insertIndex, 0, {
      ...source,
      parent_id: newParentId,
    });

    nextOrderedSiblings.forEach((category, index) => {
      nextUpdates.set(category.id, {
        parent_id: category.id === source.id ? newParentId : category.parent_id ?? null,
        order_position: index,
      });
    });

    const updateEntries = [...nextUpdates.entries()];
    const results = await Promise.all(
      updateEntries.map(([categoryId, payload]) =>
        supabase.from('categories').update(payload).eq('id', categoryId),
      ),
    );

    const failed = results.find((result) => result.error);
    if (failed?.error) {
      toast.error('Não foi possível reorganizar as categorias');
      return;
    }

    setCategories((prev) =>
      prev
        .map((category) => {
          const update = nextUpdates.get(category.id);
          if (!update) return category;
          return {
            ...category,
            parent_id: update.parent_id,
            order_position: update.order_position,
          };
        })
        .sort(compareCategory),
    );
  };

  const resolveDropMode = (event: DragEvent<HTMLDivElement>): DropMode => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    if (offsetY < rect.height * 0.28) return 'before';
    if (offsetY > rect.height * 0.72) return 'after';
    return 'inside';
  };

  const handleRowDragOver = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    event.preventDefault();
    const mode = resolveDropMode(event);
    setDropTarget({ targetId, mode });
  };

  const handleRowDrop = async (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    if (!draggingId || draggingId === targetId) return;
    const mode = resolveDropMode(event);
    setDropTarget({ targetId, mode });
    await persistCategoryMove(draggingId, targetId, mode);
    setDraggingId(null);
    setDropTarget(null);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Categorias</h1>
          <p className="text-muted-foreground">Organize seus produtos em categorias, subcategorias, ícones e ordem do catálogo.</p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Categoria
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Categorias de Produtos
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <span>
              {categories.length} {categories.length === 1 ? 'categoria' : 'categorias'} cadastradas
            </span>
            <Badge variant="secondary">Arraste para reordenar</Badge>
            <Badge variant="secondary">Solte no meio para virar subcategoria</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Carregando...</div>
          ) : categories.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <FolderTree className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p className="font-medium">Nenhuma categoria cadastrada</p>
              <p className="text-sm">Clique em "Nova Categoria" para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayCategories.map(({ category, level }) => {
                const isDropTarget = dropTarget?.targetId === category.id;
                const dropMode = isDropTarget ? dropTarget?.mode : null;

                return (
                  <div
                    key={category.id}
                    draggable
                    onDragStart={() => setDraggingId(category.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropTarget(null);
                    }}
                    onDragOver={(event) => handleRowDragOver(event, category.id)}
                    onDrop={(event) => void handleRowDrop(event, category.id)}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        setDropTarget((prev) => (prev?.targetId === category.id ? null : prev));
                      }
                    }}
                    className={[
                      'relative rounded-2xl border bg-card transition-all',
                      draggingId === category.id ? 'opacity-55' : '',
                      dropMode === 'inside' ? 'border-primary/70 bg-primary/5 shadow-sm' : 'border-border',
                    ].join(' ')}
                  >
                    {dropMode === 'before' ? (
                      <span className="absolute inset-x-4 top-0 h-1 rounded-full bg-primary" />
                    ) : null}
                    {dropMode === 'after' ? (
                      <span className="absolute inset-x-4 bottom-0 h-1 rounded-full bg-primary" />
                    ) : null}

                    <div
                      className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.8fr)_180px_200px_150px]"
                      style={{ paddingLeft: `${16 + level * 20}px` }}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-1 cursor-grab text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/40">
                          <CategoryIcon
                            iconName={category.icon_name}
                            iconUrl={category.icon_url}
                            className="h-4 w-4 text-primary"
                            imageClassName="h-5 w-5 rounded-md"
                            title={category.name}
                          />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold">{category.name}</p>
                            {category.parent_id ? (
                              <Badge variant="secondary" className="text-[11px]">
                                Subcategoria
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[11px]">
                                Principal
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {level > 0 ? `Nível ${level + 1}` : 'Categoria raiz'}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Categoria pai
                        </p>
                        <p className="mt-1 text-sm">{getParentName(category.parent_id)}</p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Produtos
                        </p>
                        <p className="mt-1 text-sm font-semibold">{productCountMap.get(category.id) || 0}</p>
                      </div>

                      <div className="flex items-start justify-start gap-1 md:justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openSubcategoryDialog(category)}
                          title="Nova subcategoria"
                        >
                          <FolderPlus className="h-4 w-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDialog(category)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedCategory(category);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCategory
                ? 'Editar Categoria'
                : formData.parent_id
                  ? 'Nova Subcategoria'
                  : 'Nova Categoria'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={formData.name}
                  onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Ex: Impressos, Brindes, Vestuário"
                />
              </div>

              <div className="space-y-2">
                <Label>Categoria Pai (opcional)</Label>
                <Select
                  value={formData.parent_id || 'none'}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, parent_id: value === 'none' ? null : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem categoria pai" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria pai</SelectItem>
                    {parentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {`${'-- '.repeat(option.level)}${option.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Ícone da categoria</Label>
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                  <CategoryIcon
                    iconName={formData.icon_name}
                    iconUrl={formData.icon_url}
                    className="h-3.5 w-3.5 text-primary"
                    imageClassName="h-4 w-4 rounded-sm"
                  />
                  Preview
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {categoryIconOptions.map((option) => {
                  const selected = formData.icon_name === option.name && !formData.icon_url;
                  return (
                    <button
                      key={option.name}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          icon_name: option.name,
                          icon_url: null,
                        }))
                      }
                      className={[
                        'flex min-h-[74px] flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-sm transition-colors',
                        selected ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-muted/20 hover:bg-muted/40',
                      ].join(' ')}
                    >
                      <CategoryIcon iconName={option.name} className="h-5 w-5" />
                      <span className="text-center text-xs font-medium">{option.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium">
                    <Upload className="h-4 w-4" />
                    Enviar SVG ou PNG
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleIconUpload(file);
                        }
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>

                  {uploadingIcon ? (
                    <span className="text-sm text-muted-foreground">Enviando ícone...</span>
                  ) : null}

                  {formData.icon_url ? (
                    <>
                      <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                        <ImagePlus className="h-4 w-4 text-primary" />
                        Arquivo enviado
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData((prev) => ({ ...prev, icon_url: null }))}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Remover imagem
                      </Button>
                    </>
                  ) : null}
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Você pode usar um ícone da biblioteca ou enviar uma imagem própria. Se enviar uma imagem, ela terá prioridade na exibição.
                </p>

                {formData.icon_url ? (
                  <div className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                    <CategoryIcon
                      iconUrl={formData.icon_url}
                      className="h-8 w-8"
                      imageClassName="h-10 w-10 rounded-lg border border-border bg-white p-1"
                    />
                    <div>
                      <p className="text-sm font-semibold">Prévia do ícone enviado</p>
                      <p className="text-xs text-muted-foreground">
                        {getStoragePathFromUrl('product-images', formData.icon_url)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || uploadingIcon}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Excluir Categoria</DialogTitle>
          </DialogHeader>
          <p>Tem certeza que deseja excluir a categoria "{selectedCategory?.name}"?</p>
          <p className="text-sm text-muted-foreground">
            Produtos ficarão sem categoria e as subcategorias serão promovidas para o nível principal.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
