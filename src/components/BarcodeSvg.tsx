import { buildBarcodeSvgMarkup, detectBarcodeFormat, type BarcodeFormat } from '@/lib/barcode';

type BarcodeSvgProps = {
  value: string;
  format?: BarcodeFormat;
  height?: number;
  moduleWidth?: number;
  className?: string;
};

export function BarcodeSvg({ value, format, height = 44, moduleWidth = 2, className }: BarcodeSvgProps) {
  const resolvedFormat = format ?? detectBarcodeFormat(value) ?? 'code128';
  const markup = buildBarcodeSvgMarkup({
    value,
    format: resolvedFormat,
    height,
    moduleWidth,
  });

  if (!markup) return null;

  return (
    <span
      className={className}
      aria-label="Barcode"
      role="img"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
