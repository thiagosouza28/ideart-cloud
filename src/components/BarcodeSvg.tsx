import { buildBarcodeSvgMarkup, detectBarcodeFormat, type BarcodeFormat } from '@/lib/barcode';
import { cn } from '@/lib/utils';

type BarcodeSvgProps = {
  value: string;
  format?: BarcodeFormat;
  height?: number;
  moduleWidth?: number;
  className?: string;
};

export function BarcodeSvg({
  value,
  format,
  height = 44,
  moduleWidth = 2,
  className,
}: BarcodeSvgProps) {
  const resolvedFormat = format ?? detectBarcodeFormat(value) ?? 'code128';
  const markup = buildBarcodeSvgMarkup({
    value,
    format: resolvedFormat,
    height,
    moduleWidth,
  });

  if (!markup) return null;

  const previewMarkup = markup.replace(
    'preserveAspectRatio="none"',
    'preserveAspectRatio="xMidYMid meet"',
  );

  return (
    <span
      className={cn('block [&_svg]:block [&_svg]:h-auto [&_svg]:w-full', className)}
      aria-label="Código de barras"
      role="img"
      dangerouslySetInnerHTML={{ __html: previewMarkup }}
    />
  );
}
