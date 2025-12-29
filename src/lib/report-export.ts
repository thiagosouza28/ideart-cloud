export type ExportRow = Record<string, string | number | null | undefined>;

const buildHeaders = (rows: ExportRow[]) => {
  if (!rows.length) return [];
  return Object.keys(rows[0]);
};

const normalizeValue = (value: ExportRow[keyof ExportRow]) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toLocaleString('pt-BR');
  return String(value);
};

const buildCsv = (rows: ExportRow[]) => {
  const headers = buildHeaders(rows);
  const body = rows.map((row) =>
    headers.map((header) => normalizeValue(row[header])).join(';'),
  );
  return [headers.join(';'), ...body].join('\n');
};

const buildHtmlTable = (rows: ExportRow[]) => {
  const headers = buildHeaders(rows);
  const headerHtml = headers.map((header) => `<th>${header}</th>`).join('');
  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${headers
          .map((header) => `<td>${normalizeValue(row[header])}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table border="1" cellpadding="6" cellspacing="0"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
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
  const html = buildHtmlTable(rows);
  downloadBlob(html, filename, 'application/vnd.ms-excel;charset=utf-8;');
};

export const openPdfPreview = (title: string, rows: ExportRow[]) => {
  const html = buildHtmlTable(rows);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { font-size: 18px; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; }
          th { text-align: left; background: #f1f5f9; }
          th, td { border: 1px solid #e2e8f0; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${html}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
};

export const printPdf = (title: string, rows: ExportRow[]) => {
  const html = buildHtmlTable(rows);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { font-size: 18px; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; }
          th { text-align: left; background: #f1f5f9; }
          th, td { border: 1px solid #e2e8f0; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${html}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
    win.close();
  };
};
