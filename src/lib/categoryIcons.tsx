import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  Coffee,
  Gift,
  ImageIcon,
  LayoutGrid,
  Package,
  Palette,
  PaintBucket,
  ShoppingBag,
  Shirt,
  Sparkles,
  Tag,
} from "lucide-react";
import { ensurePublicStorageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

const categoryIconMap = {
  LayoutGrid,
  Package,
  CalendarDays,
  Gift,
  Coffee,
  ImageIcon,
  ShoppingBag,
  Tag,
  Palette,
  PaintBucket,
  Sparkles,
  Boxes,
  Shirt,
  BriefcaseBusiness,
  BookOpen,
} satisfies Record<string, LucideIcon>;

export const categoryIconOptions = [
  { name: "LayoutGrid", label: "Grade" },
  { name: "Package", label: "Produto" },
  { name: "CalendarDays", label: "Calendário" },
  { name: "Gift", label: "Presente" },
  { name: "Coffee", label: "Caneca" },
  { name: "ImageIcon", label: "Imagem" },
  { name: "ShoppingBag", label: "Sacola" },
  { name: "Tag", label: "Etiqueta" },
  { name: "Palette", label: "Paleta" },
  { name: "PaintBucket", label: "Pintura" },
  { name: "Sparkles", label: "Destaque" },
  { name: "Boxes", label: "Caixas" },
  { name: "Shirt", label: "Vestuário" },
  { name: "BriefcaseBusiness", label: "Serviço" },
  { name: "BookOpen", label: "Catálogo" },
] as const;

export const resolveCategoryIconComponent = (iconName?: string | null) => {
  if (!iconName) return LayoutGrid;
  return categoryIconMap[iconName] || LayoutGrid;
};

type CategoryIconProps = {
  iconName?: string | null;
  iconUrl?: string | null;
  className?: string;
  imageClassName?: string;
  title?: string;
};

export function CategoryIcon({
  iconName,
  iconUrl,
  className,
  imageClassName,
  title,
}: CategoryIconProps) {
  const normalizedUrl = ensurePublicStorageUrl("product-images", iconUrl || null);

  if (normalizedUrl) {
    return (
      <img
        src={normalizedUrl}
        alt={title || "Ícone da categoria"}
        className={cn("h-4 w-4 rounded-sm object-contain", imageClassName, className)}
        loading="lazy"
      />
    );
  }

  const Icon = resolveCategoryIconComponent(iconName);
  return <Icon className={cn("h-4 w-4", className)} aria-hidden="true" />;
}
