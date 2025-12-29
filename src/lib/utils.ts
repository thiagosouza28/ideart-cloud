import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatOrderNumber(orderNumber: number | string | undefined | null): string {
  if (!orderNumber) return '';
  const num = Number(orderNumber);
  if (isNaN(num)) return String(orderNumber);
  return num.toString().padStart(5, '0');
}
