import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Tags, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Attribute, AttributeValue } from '@/types/database';

export default function Attributes() {
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [attributeDialogOpen, setAttributeDialogOpen] = useState(false);
  const [valueDialogOpen, setValueDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const [selectedAttribute, setSelectedAttribute] = useState<Attribute | null>(null);
  const [attributeName, setAttributeName] = useState('');
  const [valueName, setValueName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [attrResult, valResult] = await Promise.all([
      supabase.from('attributes').select('*').order('name'),
      supabase.from('attribute_values').select('*').order('value')
    ]);

    if (attrResult.error || valResult.error) {
      toast.error('Erro ao carregar dados');
      return;
    }

    setAttributes(attrResult.data || []);
    setAttributeValues(valResult.data || []);
    setLoading(false);
  };

  const openAttributeDialog = (attribute?: Attribute) => {
    if (attribute) {
      setSelectedAttribute(attribute);
      setAttributeName(attribute.name);
    } else {
      setSelectedAttribute(null);
      setAttributeName('');
    }
    setAttributeDialogOpen(true);
  };

  const openValueDialog = (attribute: Attribute) => {
    setSelectedAttribute(attribute);
    setValueName('');
    setValueDialogOpen(true);
  };

  const handleSaveAttribute = async () => {
    if (!attributeName.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);

    const { error } = selectedAttribute
      ? await supabase.from('attributes').update({ name: attributeName.trim() }).eq('id', selectedAttribute.id)
      : await supabase.from('attributes').insert({ name: attributeName.trim() });

    if (error) {
      toast.error('Erro ao salvar atributo');
    } else {
      toast.success(selectedAttribute ? 'Atributo atualizado!' : 'Atributo criado!');
      setAttributeDialogOpen(false);
      loadData();
    }

    setSaving(false);
  };

  const handleSaveValue = async () => {
    if (!valueName.trim() || !selectedAttribute) {
      toast.error('Valor é obrigatório');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('attribute_values').insert({
      attribute_id: selectedAttribute.id,
      value: valueName.trim()
    });

    if (error) {
      toast.error('Erro ao salvar valor');
    } else {
      toast.success('Valor adicionado!');
      setValueDialogOpen(false);
      loadData();
    }

    setSaving(false);
  };

  const handleDeleteAttribute = async () => {
    if (!selectedAttribute) return;

    // First delete all values
    await supabase.from('attribute_values').delete().eq('attribute_id', selectedAttribute.id);
    
    const { error } = await supabase.from('attributes').delete().eq('id', selectedAttribute.id);

    if (error) {
      toast.error('Erro ao excluir atributo');
    } else {
      toast.success('Atributo excluído!');
      setDeleteDialogOpen(false);
      loadData();
    }
  };

  const handleDeleteValue = async (valueId: string) => {
    const { error } = await supabase.from('attribute_values').delete().eq('id', valueId);

    if (error) {
      toast.error('Erro ao excluir valor');
    } else {
      toast.success('Valor excluído!');
      loadData();
    }
  };

  const getValuesForAttribute = (attributeId: string) => {
    return attributeValues.filter(v => v.attribute_id === attributeId);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Atributos</h1>
          <p className="text-muted-foreground">Defina variações para seus produtos</p>
        </div>
        <Button onClick={() => openAttributeDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Atributo
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : attributes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Tags className="mx-auto h-12 w-12 opacity-30 mb-2" />
            <p>Nenhum atributo cadastrado</p>
            <p className="text-sm">Crie atributos como Tamanho, Cor, Material etc.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {attributes.map((attr) => {
            const values = getValuesForAttribute(attr.id);
            return (
              <Card key={attr.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{attr.name}</CardTitle>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openAttributeDialog(attr)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => { setSelectedAttribute(attr); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>
                    {values.length} {values.length === 1 ? 'valor' : 'valores'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {values.map((val) => (
                      <Badge key={val.id} variant="secondary" className="gap-1">
                        {val.value}
                        <button
                          onClick={() => handleDeleteValue(val.id)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {values.length === 0 && (
                      <span className="text-sm text-muted-foreground">Nenhum valor definido</span>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => openValueDialog(attr)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Valor
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Attribute Dialog */}
      <Dialog open={attributeDialogOpen} onOpenChange={setAttributeDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{selectedAttribute ? 'Editar' : 'Novo'} Atributo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={attributeName}
                onChange={(e) => setAttributeName(e.target.value)}
                placeholder="Ex: Tamanho, Cor, Material"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttributeDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveAttribute} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Value Dialog */}
      <Dialog open={valueDialogOpen} onOpenChange={setValueDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Adicionar Valor - {selectedAttribute?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input
                value={valueName}
                onChange={(e) => setValueName(e.target.value)}
                placeholder="Ex: P, M, G, GG / Vermelho, Azul..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValueDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveValue} disabled={saving}>
              {saving ? 'Salvando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Excluir Atributo</DialogTitle>
          </DialogHeader>
          <p>Tem certeza que deseja excluir o atributo "{selectedAttribute?.name}"?</p>
          <p className="text-sm text-muted-foreground">
            Todos os valores associados também serão excluídos.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteAttribute}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


