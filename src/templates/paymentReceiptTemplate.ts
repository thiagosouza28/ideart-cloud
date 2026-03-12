export type ReceiptPersonType = "PF" | "PJ";

export type PaymentReceiptParty = {
  nome: string;
  documento?: string | null;
};

export type PaymentReceiptPayment = {
  valor: number;
  forma: string;
  descricao: string;
  data: string;
};

export type PaymentReceiptStore = {
  nome: string;
  tipoPessoa?: ReceiptPersonType | null;
  documento?: string | null;
  endereco?: string | null;
  logo?: string | null;
  assinaturaImagem?: string | null;
  responsavel?: string | null;
  cargo?: string | null;
};

export type ReceiptReferenceType = "pedido" | "pdv" | "venda" | "outro";

export type PaymentReceiptReference = {
  tipo?: ReceiptReferenceType | null;
  numero?: string | null;
  codigo?: string | null;
};

export type PaymentReceiptPayload = {
  cliente: PaymentReceiptParty;
  pagamento: PaymentReceiptPayment;
  loja: PaymentReceiptStore;
  numeroRecibo: string;
  referencia?: PaymentReceiptReference | null;
  pedido?: {
    tempoProducaoDias?: number | null;
    previsaoEntrega?: string | null;
  } | null;
};

export type PaymentReceiptTheme = {
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  borderColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
};

type PaymentReceiptTemplateOptions = {
  theme?: PaymentReceiptTheme;
};

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeDigits = (value: string) => value.replace(/\D/g, "");

const formatCpfCnpj = (value: string) => {
  const digits = normalizeDigits(value).slice(0, 14);
  if (!digits) return "";

  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const formatDateTime = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatDateOnly = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const resolvePersonType = (
  documento?: string | null,
  tipoPessoa?: ReceiptPersonType | null,
): ReceiptPersonType | null => {
  if (tipoPessoa === "PF" || tipoPessoa === "PJ") return tipoPessoa;

  const digits = normalizeDigits(documento || "");
  if (digits.length === 11) return "PF";
  if (digits.length >= 14) return "PJ";
  return null;
};

const renderLogo = (logo?: string | null, nome?: string | null) => {
  if (!logo) return "";

  return `
    <div class="receipt-logo">
      <img src="${escapeHtml(logo)}" alt="${escapeHtml(nome || "Logo")}" crossorigin="anonymous" />
    </div>
  `;
};

const renderSignature = (payload: PaymentReceiptPayload) => {
  const signatureImage = payload.loja.assinaturaImagem;
  const responsavel = payload.loja.responsavel || payload.loja.nome || "Responsável";
  const cargo = payload.loja.cargo || "Responsável";

  if (signatureImage) {
    return `
      <div class="receipt-signature-image">
        <img src="${escapeHtml(signatureImage)}" alt="Assinatura" crossorigin="anonymous" />
      </div>
      <div class="receipt-signature-text">
        <div class="receipt-signature-name">${escapeHtml(responsavel)}</div>
        <div class="receipt-signature-role">${escapeHtml(cargo)}</div>
      </div>
    `;
  }

  return `
    <div class="receipt-signature-line"></div>
    <div class="receipt-signature-text">
      <div class="receipt-signature-name">${escapeHtml(responsavel)}</div>
      <div class="receipt-signature-role">${escapeHtml(cargo)}</div>
    </div>
  `;
};

const buildThemeVars = (theme?: PaymentReceiptTheme) => {
  const vars = {
    primary: theme?.primaryColor || "#0f172a",
    accent: theme?.accentColor || "#2563eb",
    text: theme?.textColor || "#0f172a",
    muted: theme?.mutedTextColor || "#64748b",
    border: theme?.borderColor || "#dbe3ef",
    background: theme?.backgroundColor || "#ffffff",
    font: theme?.fontFamily || "Helvetica, Arial, sans-serif",
  };

  return `
    --receipt-primary: ${vars.primary};
    --receipt-accent: ${vars.accent};
    --receipt-text: ${vars.text};
    --receipt-muted: ${vars.muted};
    --receipt-border: ${vars.border};
    --receipt-bg: ${vars.background};
    --receipt-font: ${vars.font};
  `;
};

export const buildPaymentReceiptHtml = (
  payload: PaymentReceiptPayload,
  options?: PaymentReceiptTemplateOptions,
) => {
  const storeName = payload.loja.nome || "Loja";
  const storeDoc = payload.loja.documento || "";
  const personType = resolvePersonType(storeDoc, payload.loja.tipoPessoa);
  const storeDocLabel = personType === "PJ" ? "CNPJ" : personType === "PF" ? "CPF" : "Documento";
  const storeDocValue = storeDoc ? formatCpfCnpj(storeDoc) : "-";
  const storeAddress = payload.loja.endereco || "-";

  const customerName = payload.cliente.nome || "Cliente";
  const customerDoc = payload.cliente.documento ? formatCpfCnpj(payload.cliente.documento) : "-";
  const receiptNumber = payload.numeroRecibo || "-";
  const paymentDate = formatDateTime(payload.pagamento.data || "-");
  const paymentMethod = payload.pagamento.forma || "-";
  const paymentDescription = payload.pagamento.descricao || "-";
  const paymentValue = formatCurrency(payload.pagamento.valor || 0);
  const productionTimeRaw = Number(payload.pedido?.tempoProducaoDias);
  const productionTimeDays =
    Number.isFinite(productionTimeRaw) && productionTimeRaw >= 0
      ? Math.trunc(productionTimeRaw)
      : null;
  const estimatedDeliveryRaw = payload.pedido?.previsaoEntrega || "";
  const estimatedDeliveryLabel = estimatedDeliveryRaw ? formatDateOnly(estimatedDeliveryRaw) : "-";
  const hasProductionInfo = productionTimeDays !== null || Boolean(estimatedDeliveryRaw);

  const referenceType = payload.referencia?.tipo || null;
  const referenceLabel =
    referenceType === "pedido"
      ? "Pedido"
      : referenceType === "pdv" || referenceType === "venda"
        ? "Venda PDV"
        : "Referência";
  const referenceNumber = payload.referencia?.numero || "-";
  const referenceCode = payload.referencia?.codigo || "-";

  const title =
    referenceType === "pedido"
      ? "Comprovante de pagamento"
      : referenceType === "pdv" || referenceType === "venda"
        ? "Comprovante de venda"
        : "Comprovante de pagamento";

  const themeVars = buildThemeVars(options?.theme);

  return `
    <style>
      .receipt-root {
        ${themeVars}
        font-family: var(--receipt-font);
        color: var(--receipt-text);
        background: var(--receipt-bg);
        border: 1px solid var(--receipt-border);
        border-radius: 14px;
        padding: 24px;
        width: min(100%, 794px);
        margin: 0 auto;
        box-sizing: border-box;
      }

      .receipt-block {
        page-break-inside: avoid;
      }

      .receipt-header {
        border-bottom: 1px solid var(--receipt-border);
        padding-bottom: 16px;
      }

      .receipt-header-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }

      .receipt-brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .receipt-logo img {
        width: 48px;
        height: 48px;
        object-fit: contain;
        border: 1px solid var(--receipt-border);
        border-radius: 8px;
        background: #ffffff;
        padding: 4px;
      }

      .receipt-title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        line-height: 1.2;
      }

      .receipt-kicker {
        margin: 2px 0 0;
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--receipt-muted);
      }

      .receipt-meta {
        margin-top: 8px;
        font-size: 11px;
        color: var(--receipt-muted);
        line-height: 1.45;
      }

      .receipt-header-side {
        min-width: 170px;
        border: 1px solid var(--receipt-border);
        border-radius: 10px;
        background: #f8fafc;
        padding: 10px 12px;
        text-align: right;
        font-size: 11px;
      }

      .label {
        display: block;
        color: var(--receipt-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 4px;
      }

      .value {
        color: var(--receipt-text);
        font-weight: 600;
        word-break: break-word;
      }

      .receipt-header-side .value {
        display: block;
        font-size: 14px;
      }

      .receipt-summary {
        margin-top: 16px;
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        border: 1px solid var(--receipt-border);
        border-radius: 10px;
        background: #f8fafc;
        padding: 10px 12px;
        font-size: 11px;
      }

      .receipt-box {
        margin-top: 16px;
        border: 1px solid var(--receipt-border);
        border-radius: 10px;
        padding: 12px;
        font-size: 11px;
      }

      .receipt-grid {
        margin-top: 16px;
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .receipt-signatures {
        margin-top: 24px;
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .receipt-signature-box {
        border: 1px solid var(--receipt-border);
        border-radius: 10px;
        padding: 12px;
        font-size: 11px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .receipt-signature-image {
        min-height: 64px;
        display: flex;
        width: 100%;
        align-items: flex-end;
        justify-content: center;
      }

      .receipt-signature-image img {
        max-width: 220px;
        max-height: 56px;
        object-fit: contain;
      }

      .receipt-signature-line {
        width: 100%;
        max-width: 220px;
        border-top: 1px dashed #cbd5e1;
        min-height: 56px;
      }

      .receipt-signature-text {
        margin-top: 8px;
        width: 100%;
        text-align: center;
      }

      .receipt-signature-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--receipt-text);
      }

      .receipt-signature-role {
        margin-top: 2px;
        font-size: 10px;
        color: var(--receipt-muted);
      }

      .receipt-footer {
        margin-top: 20px;
        text-align: center;
        font-size: 11px;
        color: var(--receipt-muted);
      }

      @media (max-width: 640px) {
        .receipt-root {
          padding: 16px;
        }

        .receipt-header-row {
          flex-direction: column;
        }

        .receipt-header-side {
          width: 100%;
          text-align: left;
        }

        .receipt-summary,
        .receipt-grid,
        .receipt-signatures {
          grid-template-columns: 1fr;
        }
      }
    </style>

    <div class="receipt-root">
      <div class="receipt-block receipt-header">
        <div class="receipt-header-row">
          <div>
            <div class="receipt-brand">
              ${renderLogo(payload.loja.logo, storeName)}
              <div>
                <p class="receipt-title">${escapeHtml(storeName)}</p>
                <p class="receipt-kicker">${escapeHtml(title)}</p>
              </div>
            </div>
            <div class="receipt-meta">
              <p>${escapeHtml(storeDocLabel)}: ${escapeHtml(storeDocValue)}</p>
              <p>Endereço: ${escapeHtml(storeAddress)}</p>
            </div>
          </div>
          <div class="receipt-header-side">
            <span class="label">Recibo</span>
            <span class="value">${escapeHtml(receiptNumber)}</span>
            <span class="label" style="margin-top:8px;">Emitido em</span>
            <span class="value" style="font-size:12px;">${escapeHtml(paymentDate)}</span>
          </div>
        </div>
      </div>

      <div class="receipt-block receipt-summary">
        <div>
          <span class="label">Cliente</span>
          <span class="value">${escapeHtml(customerName)}</span>
        </div>
        <div>
          <span class="label">${escapeHtml(referenceLabel)}</span>
          <span class="value">${escapeHtml(referenceNumber)}</span>
        </div>
        <div>
          <span class="label">Forma</span>
          <span class="value">${escapeHtml(paymentMethod)}</span>
        </div>
        <div>
          <span class="label">Valor</span>
          <span class="value">${escapeHtml(paymentValue)}</span>
        </div>
      </div>

      <div class="receipt-block receipt-box">
        <span class="label">Descrição</span>
        <span class="value">Recebemos de <strong>${escapeHtml(customerName)}</strong> o valor de <strong>${escapeHtml(paymentValue)}</strong>, referente a <strong>${escapeHtml(paymentDescription)}</strong>.</span>
      </div>

      <div class="receipt-block receipt-grid">
        <div class="receipt-box" style="margin-top:0;">
          <span class="label">Dados do cliente</span>
          <span class="value">${escapeHtml(customerName)}</span>
          <span class="value" style="display:block; margin-top:4px; font-weight:500; color: var(--receipt-muted);">Documento: ${escapeHtml(customerDoc)}</span>
        </div>
        <div class="receipt-box" style="margin-top:0;">
          <span class="label">Dados do pagamento</span>
          <span class="value">Forma: ${escapeHtml(paymentMethod)}</span>
          <span class="value" style="display:block; margin-top:4px;">Valor recebido: ${escapeHtml(paymentValue)}</span>
          <span class="value" style="display:block; margin-top:4px; font-weight:500; color: var(--receipt-muted);">Código interno: ${escapeHtml(referenceCode)}</span>
        </div>
      </div>

      ${hasProductionInfo ? `
        <div class="receipt-block receipt-box">
          <span class="label">Prazos do pedido</span>
          <span class="value">Tempo de produção: ${escapeHtml(
            productionTimeDays !== null
              ? `${productionTimeDays} ${productionTimeDays === 1 ? "dia" : "dias"}`
              : "-"
          )}</span>
          <span class="value" style="display:block; margin-top:4px; font-weight:500; color: var(--receipt-muted);">Previsão de entrega: ${escapeHtml(estimatedDeliveryLabel)}</span>
        </div>
      ` : ""}

      <div class="receipt-block receipt-signatures">
        <div class="receipt-signature-box">
          <span class="label">Assinatura da loja</span>
          ${renderSignature(payload)}
        </div>
        <div class="receipt-signature-box">
          <span class="label">Assinatura do cliente</span>
          <div class="receipt-signature-image">
            <div class="receipt-signature-line"></div>
          </div>
          <div class="receipt-signature-text">
            <div class="receipt-signature-name">${escapeHtml(customerName)}</div>
          </div>
        </div>
      </div>

      <div class="receipt-footer">Documento não fiscal</div>
    </div>
  `;
};
