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
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0),
  );

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
    accent: theme?.accentColor || "#1d4ed8",
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
  const customerDoc = payload.cliente.documento ? formatCpfCnpj(payload.cliente.documento) : "";
  const customerDocLine = customerDoc
    ? `<p class="receipt-small">Documento: ${escapeHtml(customerDoc)}</p>`
    : "";

  const receiptNumber = payload.numeroRecibo || "-";
  const paymentDate = formatDateTime(payload.pagamento.data || "-");
  const paymentMethod = payload.pagamento.forma || "-";
  const paymentDescription = payload.pagamento.descricao || "-";
  const paymentValue = formatCurrency(payload.pagamento.valor || 0);

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
        ? "Recibo de venda"
        : "Recibo de pagamento";

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
        padding: 22px;
        width: min(100%, 560px);
        max-width: 560px;
        margin: 0 auto;
        box-sizing: border-box;
      }

      .receipt-header {
        display: flex;
        justify-content: space-between;
        align-items: stretch;
        gap: 12px;
        padding: 14px;
        border-radius: 12px;
        border: 1px solid var(--receipt-border);
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(255, 255, 255, 0.92));
      }

      .receipt-header-main {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .receipt-logo {
        display: flex;
        align-items: center;
      }

      .receipt-logo img {
        max-width: 72px;
        max-height: 72px;
        object-fit: contain;
      }

      .receipt-store h1 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.3px;
        text-transform: uppercase;
      }

      .receipt-store p {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--receipt-muted);
        line-height: 1.35;
      }

      .receipt-header-side {
        text-align: right;
        min-width: 145px;
      }

      .receipt-header-side span {
        display: block;
        color: var(--receipt-muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .receipt-header-side strong {
        display: block;
        margin-top: 5px;
        color: var(--receipt-primary);
        font-size: 13px;
        word-break: break-word;
      }

      .receipt-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin: 16px 0 10px;
      }

      .receipt-title h2 {
        margin: 0;
        font-size: 17px;
        color: var(--receipt-primary);
      }

      .receipt-subtitle {
        font-size: 11px;
        color: var(--receipt-muted);
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }

      .receipt-statement {
        margin-top: 10px;
        border: 1px solid var(--receipt-border);
        border-left: 4px solid var(--receipt-accent);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 13px;
        line-height: 1.5;
        background: #f8fbff;
      }

      .receipt-statement strong {
        color: var(--receipt-primary);
      }

      .receipt-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        background: #f8fafc;
        border: 1px solid var(--receipt-border);
        border-radius: 10px;
        padding: 10px;
        margin-top: 14px;
      }

      .receipt-field span {
        display: block;
        font-size: 10px;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: var(--receipt-muted);
        margin-bottom: 4px;
      }

      .receipt-field strong {
        font-size: 13px;
        color: var(--receipt-text);
        word-break: break-word;
      }

      .receipt-section {
        margin-top: 12px;
        border: 1px solid var(--receipt-border);
        border-radius: 10px;
        padding: 12px;
      }

      .receipt-section h3 {
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: var(--receipt-muted);
      }

      .receipt-section p {
        margin: 0;
        font-size: 13px;
        color: var(--receipt-text);
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      .receipt-section .receipt-small {
        font-size: 12px;
        color: var(--receipt-muted);
        margin-top: 4px;
      }

      .receipt-signature {
        margin-top: 8px;
        text-align: center;
      }

      .receipt-signature-line {
        border-top: 1px solid var(--receipt-text);
        width: 240px;
        margin: 12px auto 8px;
      }

      .receipt-signature-image img {
        max-width: 200px;
        max-height: 100px;
        object-fit: contain;
      }

      .receipt-signature-name {
        font-size: 12px;
        font-weight: 600;
      }

      .receipt-signature-role {
        font-size: 11px;
        color: var(--receipt-muted);
        margin-top: 2px;
      }

      .receipt-footer {
        margin-top: 16px;
        text-align: center;
        font-size: 11px;
        color: var(--receipt-muted);
      }

      @media (max-width: 640px) {
        .receipt-root {
          padding: 16px;
          border-radius: 10px;
        }

        .receipt-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }

        .receipt-header-main {
          width: 100%;
        }

        .receipt-header-side {
          text-align: left;
          width: 100%;
        }

        .receipt-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>

    <div class="receipt-root">
      <div class="receipt-header">
        <div class="receipt-header-main">
          ${renderLogo(payload.loja.logo, storeName)}
          <div class="receipt-store">
            <h1>${escapeHtml(storeName)}</h1>
            <p>Tipo de pessoa: ${escapeHtml(personType || "-")}</p>
            <p>${escapeHtml(storeDocLabel)}: ${escapeHtml(storeDocValue)}</p>
            <p>Endereço: ${escapeHtml(storeAddress)}</p>
          </div>
        </div>
        <div class="receipt-header-side">
          <span>Número do recibo</span>
          <strong>${escapeHtml(receiptNumber)}</strong>
        </div>
      </div>

      <div class="receipt-title">
        <h2>${escapeHtml(title)}</h2>
        <div class="receipt-subtitle">${escapeHtml(referenceLabel)} ${escapeHtml(referenceNumber)}</div>
      </div>

      <div class="receipt-statement">
        Recebemos de <strong>${escapeHtml(customerName)}</strong> o valor de
        <strong>${escapeHtml(paymentValue)}</strong>, referente a
        <strong>${escapeHtml(paymentDescription)}</strong>.
      </div>

      <div class="receipt-grid">
        <div class="receipt-field">
          <span>Data e hora</span>
          <strong>${escapeHtml(paymentDate)}</strong>
        </div>
        <div class="receipt-field">
          <span>Forma de pagamento</span>
          <strong>${escapeHtml(paymentMethod)}</strong>
        </div>
        <div class="receipt-field">
          <span>Valor recebido</span>
          <strong>${escapeHtml(paymentValue)}</strong>
        </div>
        <div class="receipt-field">
          <span>Código interno</span>
          <strong>${escapeHtml(referenceCode)}</strong>
        </div>
      </div>

      <div class="receipt-section">
        <h3>Cliente</h3>
        <p>${escapeHtml(customerName)}</p>
        ${customerDocLine}
      </div>

      <div class="receipt-section">
        <h3>Descrição</h3>
        <p>${escapeHtml(paymentDescription)}</p>
      </div>

      <div class="receipt-section">
        <h3>Assinatura da loja</h3>
        <div class="receipt-signature">
          ${renderSignature(payload)}
        </div>
      </div>

      <div class="receipt-footer">Documento não fiscal</div>
    </div>
  `;
};
