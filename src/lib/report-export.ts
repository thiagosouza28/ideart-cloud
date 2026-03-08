export type ExportRow = Record<string, string | number | null | undefined>;

const buildHeaders = (rows: ExportRow[]) => {
  if (!rows.length) return [];
  return Object.keys(rows[0]);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeValue = (value: ExportRow[keyof ExportRow]) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toLocaleString('pt-BR');
  return String(value);
};

const escapeCsv = (value: string) => {
  if (!/[;"\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
};

const buildCsv = (rows: ExportRow[]) => {
  const headers = buildHeaders(rows);
  const body = rows.map((row) =>
    headers.map((header) => escapeCsv(normalizeValue(row[header]))).join(';'),
  );
  return [headers.map(escapeCsv).join(';'), ...body].join('\n');
};

const buildHtmlTable = (rows: ExportRow[]) => {
  const headers = buildHeaders(rows);
  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${headers
          .map((header) => `<td>${escapeHtml(normalizeValue(row[header]))}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `
    <div class="table-shell">
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
};

const buildHtmlDocument = (title: string, rows: ExportRow[], includeToolbar: boolean) => {
  const html = buildHtmlTable(rows);
  const generatedAt = new Date().toLocaleString('pt-BR');
  const safeTitle = escapeHtml(title);

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${safeTitle}</title>
        <style>
          :root {
            color-scheme: light;
            --page-bg: #f8fafc;
            --surface: #ffffff;
            --surface-soft: #f8fafc;
            --border: #dbe4f0;
            --text: #0f172a;
            --muted: #475569;
            --primary: #2563eb;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: var(--page-bg);
            color: var(--text);
            font-family: "Segoe UI", Arial, sans-serif;
          }

          .toolbar {
            position: sticky;
            top: 0;
            z-index: 20;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding: 16px 24px;
            border-bottom: 1px solid var(--border);
            background: rgba(248, 250, 252, 0.96);
            backdrop-filter: blur(10px);
          }

          .toolbar button {
            border: 1px solid var(--border);
            border-radius: 999px;
            background: var(--surface);
            color: var(--text);
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }

          .toolbar button.primary {
            border-color: var(--primary);
            background: var(--primary);
            color: #fff;
          }

          .page {
            padding: 24px;
          }

          .report-card {
            border: 1px solid var(--border);
            border-radius: 20px;
            background: var(--surface);
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
            overflow: hidden;
          }

          .report-head {
            display: flex;
            flex-wrap: wrap;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            padding: 24px;
            border-bottom: 1px solid var(--border);
          }

          .report-head h1 {
            margin: 0;
            font-size: 28px;
            line-height: 1.1;
          }

          .report-head p {
            margin: 6px 0 0;
            color: var(--muted);
            font-size: 14px;
          }

          .report-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 104px;
            padding: 10px 14px;
            border-radius: 999px;
            background: #eff6ff;
            color: var(--primary);
            font-size: 13px;
            font-weight: 700;
          }

          .table-shell {
            width: 100%;
            overflow: auto;
          }

          table {
            width: 100%;
            min-width: 960px;
            border-collapse: collapse;
          }

          th,
          td {
            padding: 12px 14px;
            border-bottom: 1px solid var(--border);
            border-right: 1px solid var(--border);
            text-align: left;
            font-size: 13px;
            vertical-align: top;
          }

          th:last-child,
          td:last-child {
            border-right: 0;
          }

          th {
            position: sticky;
            top: 0;
            background: var(--surface-soft);
            color: var(--muted);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.02em;
            text-transform: uppercase;
          }

          tbody tr:nth-child(even) td {
            background: #fcfdff;
          }

          .empty-state {
            padding: 24px;
            color: var(--muted);
            font-size: 14px;
          }

          @page {
            size: A4 landscape;
            margin: 12mm;
          }

          @media print {
            body {
              background: #fff;
            }

            .toolbar {
              display: none;
            }

            .page {
              padding: 0;
            }

            .report-card {
              border: 0;
              border-radius: 0;
              box-shadow: none;
            }

            .report-head {
              padding: 0 0 16px;
            }

            .table-shell {
              overflow: visible;
            }

            table {
              min-width: 0;
            }

            th {
              position: static;
            }
          }
        </style>
      </head>
      <body>
        ${
          includeToolbar
            ? `
              <div class="toolbar">
                <button onclick="window.close()">Fechar</button>
                <button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button>
              </div>
            `
            : ''
        }
        <main class="page">
          <section class="report-card">
            <header class="report-head">
              <div>
                <h1>${safeTitle}</h1>
                <p>Gerado em ${escapeHtml(generatedAt)} • ${rows.length} linha(s)</p>
              </div>
              <span class="report-badge">Exportação</span>
            </header>
            ${rows.length ? html : '<div class="empty-state">Nenhum dado para exportar.</div>'}
          </section>
        </main>
      </body>
    </html>
  `;
};

const downloadBlob = (content: string, filename: string, type: string) => {
  const blob = new Blob(['\ufeff' + content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToCsv = (rows: ExportRow[], filename: string) => {
  const csv = buildCsv(rows);
  downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
};

export const exportToExcel = (rows: ExportRow[], filename: string) => {
  const html = buildHtmlDocument(filename.replace(/\.[^.]+$/, ''), rows, false);
  downloadBlob(html, filename, 'application/vnd.ms-excel;charset=utf-8;');
};

const openExportWindow = () => {
  const width = Math.max(window.screen.availWidth - 32, 1200);
  const height = Math.max(window.screen.availHeight - 48, 820);
  const popup = window.open('', '_blank', `popup=yes,left=0,top=0,width=${width},height=${height}`);

  if (!popup) return null;

  try {
    popup.moveTo(0, 0);
    popup.resizeTo(window.screen.availWidth, window.screen.availHeight);
  } catch {
    // Ignore environments that block window repositioning.
  }

  return popup;
};

export const openPdfPreview = (title: string, rows: ExportRow[]) => {
  const html = buildHtmlDocument(title, rows, true);
  const win = openExportWindow();
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
};

export const printPdf = (title: string, rows: ExportRow[]) => {
  const html = buildHtmlDocument(title, rows, false);
  const win = openExportWindow();
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
};
