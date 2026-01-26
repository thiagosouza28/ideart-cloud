import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { ensurePublicStorageUrl } from "@/lib/storage";
import {
  buildPaymentReceiptHtml,
  type PaymentReceiptPayload,
  type PaymentReceiptTheme,
} from "@/templates/paymentReceiptTemplate";

export type ReceiptPdfOptions = {
  theme?: PaymentReceiptTheme;
  widthPx?: number;
  marginPt?: number;
};

export type ReceiptUploadResult = {
  number: string;
  path: string;
  publicUrl: string | null;
};

const defaultWidth = 540;
const defaultMargin = 32;

const generateReceiptNumber = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `REC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
};

const ensureReceiptNumber = (payload: PaymentReceiptPayload) => {
  const trimmed = payload.numeroRecibo?.trim();
  if (trimmed) return trimmed;
  return generateReceiptNumber();
};

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR");
};

const buildPdfHtml = (payload: PaymentReceiptPayload, options?: ReceiptPdfOptions) => {
  const normalized: PaymentReceiptPayload = {
    ...payload,
    numeroRecibo: ensureReceiptNumber(payload),
    pagamento: {
      ...payload.pagamento,
      data: formatDateTime(payload.pagamento.data),
    },
  };

  const html = buildPaymentReceiptHtml(normalized, { theme: options?.theme });
  return { html, receiptNumber: normalized.numeroRecibo };
};

const waitForImages = async (container: HTMLElement) => {
  const images = Array.from(container.querySelectorAll("img"));
  if (images.length === 0) return;
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
};

const createHiddenContainer = (html: string, widthPx: number) => {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = `${widthPx}px`;
  container.style.background = "#ffffff";
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
};

export const generatePaymentReceiptPdf = async (
  payload: PaymentReceiptPayload,
  options?: ReceiptPdfOptions,
) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PDF generation requires a browser environment.");
  }

  const widthPx = options?.widthPx ?? defaultWidth;
  const marginPt = options?.marginPt ?? defaultMargin;
  const { html, receiptNumber } = buildPdfHtml(payload, options);

  const container = createHiddenContainer(html, widthPx);
  const root = container.querySelector(".receipt-root") as HTMLElement | null;
  if (!root) {
    container.remove();
    throw new Error("Receipt template root not found.");
  }

  await waitForImages(container);
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  if (typeof window !== "undefined" && !(window as { html2canvas?: unknown }).html2canvas) {
    (window as { html2canvas?: typeof html2canvas }).html2canvas = html2canvas;
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  await pdf.html(root, {
    margin: [marginPt, marginPt, marginPt, marginPt],
    autoPaging: "text",
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    },
    windowWidth: widthPx,
  });

  const blob = pdf.output("blob");
  container.remove();

  return { blob, receiptNumber };
};

export const uploadPaymentReceiptPdf = async (blob: Blob, path: string, bucket = "payment-receipts") => {
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (error) {
    throw error;
  }

  const publicUrl = ensurePublicStorageUrl(bucket, path);
  return { path, publicUrl };
};

export const generateAndUploadPaymentReceipt = async (
  payload: PaymentReceiptPayload,
  options?: ReceiptPdfOptions & { bucket?: string; path?: string },
): Promise<ReceiptUploadResult> => {
  const { blob, receiptNumber } = await generatePaymentReceiptPdf(payload, options);
  const bucket = options?.bucket || "payment-receipts";
  const path = options?.path || `receipts/recibo-${receiptNumber}.pdf`;
  const { publicUrl } = await uploadPaymentReceiptPdf(blob, path, bucket);
  return { number: receiptNumber, path, publicUrl };
};
