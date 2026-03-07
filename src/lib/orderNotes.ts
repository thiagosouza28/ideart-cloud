const META_PREFIX = '[meta]';

const splitOrderNotes = (value?: string | null) => {
  const metaLines: string[] = [];
  const visibleLines: string[] = [];

  (value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (line.startsWith(META_PREFIX)) {
        metaLines.push(line);
        return;
      }
      visibleLines.push(line);
    });

  return { metaLines, visibleLines };
};

export const extractVisibleOrderNotes = (value?: string | null) =>
  splitOrderNotes(value).visibleLines.join('\n').trim();

export const mergeOrderNotes = ({
  existingValue,
  visibleNotes,
}: {
  existingValue?: string | null;
  visibleNotes?: string | null;
}) => {
  const { metaLines } = splitOrderNotes(existingValue);
  const visibleText = (visibleNotes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  const parts = [...metaLines];
  if (visibleText) {
    parts.push(visibleText);
  }

  return parts.length > 0 ? parts.join('\n') : null;
};

