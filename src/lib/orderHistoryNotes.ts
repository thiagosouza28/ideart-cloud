const normalizeGeneratedNote = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const ensureTrailingPeriod = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const ORDER_HISTORY_NOTE_TRANSLATIONS: Record<string, string> = {
  'order created via public catalog': 'Pedido criado via catálogo público.',
  'pedido criado via catalogo publico': 'Pedido criado via catálogo público.',
  'orcamento aprovado pelo cliente': 'Orçamento aprovado pelo cliente.',
  'arte aprovada pelo cliente': 'Arte aprovada pelo cliente.',
  'pedido criado': 'Pedido criado.',
  'orcamento criado': 'Orçamento criado.',
  'entrada registrada': 'Entrada registrada.',
  cancelado: 'Pedido cancelado.',
};

export const localizeOrderHistoryNote = (note?: string | null): string => {
  if (!note) return '';

  const trimmedNote = note.trim();
  if (!trimmedNote) return '';

  const cancelledMatch = trimmedNote.match(/^cancelado:\s*(.+)$/i);
  if (cancelledMatch) {
    return ensureTrailingPeriod(`Cancelado: ${cancelledMatch[1].trim()}`);
  }

  const statusChangedMatch = trimmedNote.match(/^status alterado para:\s*(.+)$/i);
  if (statusChangedMatch) {
    return ensureTrailingPeriod(`Status alterado para: ${statusChangedMatch[1].trim()}`);
  }

  const normalizedNote = normalizeGeneratedNote(trimmedNote);
  return ORDER_HISTORY_NOTE_TRANSLATIONS[normalizedNote] ?? trimmedNote;
};
