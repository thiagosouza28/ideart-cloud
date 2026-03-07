const ORDER_HISTORY_NOTE_TRANSLATIONS: Record<string, string> = {
  'Order created via public catalog': 'Pedido criado via catálogo público',
};

export const localizeOrderHistoryNote = (note?: string | null): string => {
  if (!note) return '';

  const normalizedNote = note.trim();
  return ORDER_HISTORY_NOTE_TRANSLATIONS[normalizedNote] ?? note;
};
