import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, FolderTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Category } from '@/types/database';

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    parent_id: '' as string | null
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) {
      toast.error('Erro ao carregar categorias');
      return;
    }
    setCategories(data || []);
    setLoading(false);
  };

  const openDialog = (category?: Category) => {
    if (category) {
      setSelectedCategory(category);
      setFormData({
        name: category.name,
        parent_id: category.parent_id || ''
      });
    } else {
      setSelectedCategory(null);
      setFormData({ name: '', parent_id: '' });
    }
    setDialogOpen(true);
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

    const categoryData = {
      name: formData.name.trim(),
      parent_id: formData.parent_id || null
    };

    const { error } = selectedCategory
      ? await supabase.from('categories').update(categoryData).eq('id', selectedCategory.id)
      : await supabase.from('categories').insert(categoryData);

    if (error) {
      toast.error('Erro ao salvar categoria');
    } else {
      toast.success(selectedCategory ? 'Categoria atualizada!' : 'Categoria criada!');
      setDialogOpen(false);
      loadCategories();
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedCategory) return;

    const { error } = await supabase.from('categories').delete().eq('id', selectedCategory.id);

    if (error) {
      toast.error('Erro ao excluir categoria');
    } else {
      toast.success('Categoria excluída!');
      setDeleteDialogOpen(false);
      loadCategories();
    }
  };

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

  const getParentName = (parentId: string | null) => {
    if (!parentId) return '-';
    return categoryMap.get(parentId)?.name || '-';
  };

  const rootCategories = useMemo(() => {
    return categories.filter(
      (category) => !category.parent_id || !categoryMap.has(category.parent_id)
    );
  }, [categories, categoryMap]);

  const descendantIds = useMemo(() => {
    if (!selectedCategory) {
      return new Set<string>();
    }

    const collected = new Set<string>();
    const stack = [selectedCategory.id];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      const children = childrenByParent.get(current) ?? [];
      children.forEach((child) => {
        if (!collected.has(child.id)) {
          collected.add(child.id);
          stack.push(child.id);
        }
      });
    }

    return collected;
  }, [childrenByParent, selectedCategory]);

    const parentOptions = useMemo(() => {
    const rows: Array<{ id: string; name: string; level: number }> = [];

    const walk = (items: Category[], level: number) => {
      items.forEach((item) => {
        rows.push({ id: item.id, name: item.name, level });
        const children = childrenByParent.get(item.id) ?? [];
        if (children.length > 0) {
          walk(children, level + 1);
        }
      });
    };

    const roots = [...rootCategories].sort((a, b) => a.name.localeCompare(b.name));
    walk(roots, 0);

    return rows.filter((option) => {
      if (!selectedCategory) return true;
      if (option.id === selectedCategory.id) return false;
      return !descendantIds.has(option.id);
    });
  }, [childrenByParent, descendantIds, rootCategories, selectedCategory]);

  const displayCategories = useMemo(() => {
    const rows: Array<{ category: Category; level: number }> = [];

    const walk = (items: Category[], level: number) => {
      items.forEach((item) => {
        rows.push({ category: item, level });
        const children = childrenByParent.get(item.id) ?? [];
        if (children.length > 0) {
          walk(children, level + 1);
        }
      });
    };

    const roots = [...rootCategories].sort((a, b) => a.name.localeCompare(b.name));
    walk(roots, 0);

    return rows;
  }, [childrenByParent, rootCategories]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Categorias</h1>
          <p className="text-muted-foreground">Organize seus produtos em categorias</p>
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
          <CardDescription>
            {categories.length} {categories.length === 1 ? 'categoria' : 'categorias'} cadastradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderTree className="mx-auto h-12 w-12 opacity-30 mb-2" />
              <p>Nenhuma categoria cadastrada</p>
              <p className="text-sm">Clique em "Nova Categoria" para começar</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria Pai</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayCategories.map(({ category, level }) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">
  <span className="inline-flex items-center gap-2" style={{ paddingLeft: level * 16 }}>
    {level > 0 && <span className="text-muted-foreground">���</span>}
    {category.name}
    {category.parent_id && (
      <Badge variant="secondary" className="text-[11px]">
        Subcategoria
      </Badge>
    )}
  </span>
</TableCell>
                    <TableCell className="text-muted-foreground">
                      {getParentName(category.parent_id)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openDialog(category)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => { setSelectedCategory(category); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{selectedCategory ? 'Editar' : 'Nova'} Categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Impressos, Brindes, Vestuário"
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria Pai (opcional)</Label>
              <Select
                value={formData.parent_id || "none"}
                onValueChange={(v) => setFormData({ ...formData, parent_id: v === "none" ? null : v })}
              >
                <SelectTrigger>
                <SelectValue placeholder="Sem categoria pai (categoria principal)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria pai (categoria principal)</SelectItem>
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {`${'-- '.repeat(option.level)}${option.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Excluir Categoria</DialogTitle>
          </DialogHeader>
          <p>Tem certeza que deseja excluir a categoria "{selectedCategory?.name}"?</p>
          <p className="text-sm text-muted-foreground">
            Esta ação não pode ser desfeita. Produtos associados ficarão sem categoria.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}




