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
  fitSinglePage?: boolean;
};

export type ReceiptUploadResult = {
  number: string;
  path: string;
  publicUrl: string | null;
};

const defaultWidth = 560;
const defaultMargin = 32;
const defaultFitSinglePage = true;

const generateUniqueStorageSuffix = () => {
  const iso = new Date().toISOString();
  const stamp = iso
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replace("T", "")
    .replace("Z", "")
    .slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${stamp}-${random}`;
};

const appendSuffixToPath = (path: string, suffix: string) => {
  const normalized = String(path || "").trim().replace(/^\/+/, "");
  const lastSlash = normalized.lastIndexOf("/");
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : "";
  const file = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dotIndex = file.lastIndexOf(".");

  if (dotIndex <= 0) {
    return `${dir}${file}-${suffix}`;
  }

  return `${dir}${file.slice(0, dotIndex)}-${suffix}${file.slice(dotIndex)}`;
};

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
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = `${widthPx}px`;
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
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
  const fitSinglePage = options?.fitSinglePage ?? defaultFitSinglePage;
  const { html, receiptNumber } = buildPdfHtml(payload, options);

  const container = createHiddenContainer(html, widthPx);
  try {
    const root = container.querySelector(".receipt-root") as HTMLElement | null;
    if (!root) {
      throw new Error("Receipt template root not found.");
    }

    await waitForImages(container);
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: root.scrollWidth,
      height: root.scrollHeight,
      windowWidth: Math.max(widthPx, root.scrollWidth),
      windowHeight: Math.max(root.scrollHeight, root.clientHeight),
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidthPt = pdf.internal.pageSize.getWidth();
    const pageHeightPt = pdf.internal.pageSize.getHeight();
    const contentWidthPt = pageWidthPt - marginPt * 2;
    const contentHeightPt = pageHeightPt - marginPt * 2;
    const imgData = canvas.toDataURL("image/png");

    if (fitSinglePage) {
      const safeInsetPt = 6;
      const safeContentWidthPt = Math.max(1, contentWidthPt - safeInsetPt * 2);
      const safeContentHeightPt = Math.max(1, contentHeightPt - safeInsetPt * 2);
      const scaleByWidth = safeContentWidthPt / canvas.width;
      const scaleByHeight = safeContentHeightPt / canvas.height;
      const scale = Math.min(scaleByWidth, scaleByHeight);
      const renderWidthPt = canvas.width * scale;
      const renderHeightPt = canvas.height * scale;
      const renderX = marginPt + safeInsetPt + (safeContentWidthPt - renderWidthPt) / 2;
      const renderY = marginPt + safeInsetPt + (safeContentHeightPt - renderHeightPt) / 2;

      pdf.addImage(
        imgData,
        "PNG",
        renderX,
        renderY,
        renderWidthPt,
        renderHeightPt,
        undefined,
        "FAST",
      );
    } else {
      const pxPerPt = canvas.width / contentWidthPt;
      const pageHeightPx = Math.max(1, Math.floor(contentHeightPt * pxPerPt));

      let offsetY = 0;
      let page = 0;

      while (offsetY < canvas.height) {
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - offsetY);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;

        const ctx = pageCanvas.getContext("2d");
        if (!ctx) {
          throw new Error("Unable to render receipt PDF page.");
        }

        ctx.drawImage(
          canvas,
          0,
          offsetY,
          canvas.width,
          sliceHeightPx,
          0,
          0,
          canvas.width,
          sliceHeightPx,
        );

        const pageImgData = pageCanvas.toDataURL("image/png");
        if (page > 0) {
          pdf.addPage();
        }

        const sliceHeightPt = sliceHeightPx / pxPerPt;
        pdf.addImage(
          pageImgData,
          "PNG",
          marginPt,
          marginPt,
          contentWidthPt,
          sliceHeightPt,
          undefined,
          "FAST",
        );

        offsetY += sliceHeightPx;
        page += 1;
      }
    }

    const blob = pdf.output("blob");
    return { blob, receiptNumber };
  } finally {
    container.remove();
  }
};

export const uploadPaymentReceiptPdf = async (blob: Blob, path: string, bucket = "payment-receipts") => {
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: "application/pdf",
    upsert: false,
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
  const basePath = options?.path || `receipts/recibo-${receiptNumber}.pdf`;
  const path = appendSuffixToPath(basePath, generateUniqueStorageSuffix());
  const { publicUrl } = await uploadPaymentReceiptPdf(blob, path, bucket);
  return { number: receiptNumber, path, publicUrl };
};
