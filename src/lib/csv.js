// CSV export helper — one consistent "Export CSV" behaviour for every list.
// headers: string[]; rows: (Array | object)[] aligned to headers (objects use
// the same keys order as headers when `keys` is supplied).
import { downloadBlob } from './download.js';

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Minimal CSV row splitter that respects double-quoted fields.
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Parse a members CSV into [{ full_name, phone, email, id_number }].
 * Maps header columns by keyword; tolerant of column order. If no header is
 * detected, assumes columns: name, phone, email, id.
 */
export function parseMembersCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const hasHeader = first.some((h) => /name|phone|email|id/.test(h));
  const idx = { full_name: 0, phone: 1, email: 2, id_number: 3 };
  if (hasHeader) {
    first.forEach((h, i) => {
      if (/name/.test(h)) idx.full_name = i;
      else if (/phone|mobile|cell/.test(h)) idx.phone = i;
      else if (/email|mail/.test(h)) idx.email = i;
      else if (/id|passport/.test(h)) idx.id_number = i;
    });
  }
  return lines
    .slice(hasHeader ? 1 : 0)
    .map((line) => {
      const c = splitCsvLine(line).map((x) => x.trim());
      return {
        full_name: c[idx.full_name] || '',
        phone: c[idx.phone] || '',
        email: c[idx.email] || '',
        id_number: c[idx.id_number] || '',
      };
    })
    .filter((r) => r.full_name);
}

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
