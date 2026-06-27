// CSV export helper — one consistent "Export CSV" behaviour for every list.
// headers: string[]; rows: (Array | object)[] aligned to headers (objects use
// the same keys order as headers when `keys` is supplied).
import { downloadBlob } from './download.js';

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function exportCsv(filename, headers, rows) {
  const lines = [headers.map(cell).join(',')];
  for (const r of rows) {
    const arr = Array.isArray(r) ? r : headers.map((_, i) => r[i]);
    lines.push(arr.map(cell).join(','));
  }
  // BOM so Excel opens UTF-8 (ZAR/accents) correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}
