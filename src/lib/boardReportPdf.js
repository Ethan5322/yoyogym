// Board / owner monthly report PDF — a one-click management pack pulling the
// dashboard KPIs, retention, revenue trend, tiers, busiest hours and AR aging
// into a branded A4 document. Uses jsPDF (already a dependency).
import { jsPDF } from 'jspdf';

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return [230, 57, 70];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const zar = (n) => 'R ' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 });

export function downloadBoardReportPdf({ gymName = 'Yoyo GYM', accent = '#E63946', dashboard = {}, analytics = {}, finance = {} }) {
  const [r, g, b] = hexToRgb(accent);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = 0;

  // Header band
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, W, 92, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(gymName.toUpperCase(), M, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Management Report · ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`, M, 70);
  y = 120;

  doc.setTextColor(40, 40, 40);

  const heading = (t) => {
    if (y > H - 90) { doc.addPage(); y = 56; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(r, g, b);
    doc.text(t, M, y);
    doc.setDrawColor(220, 220, 220);
    doc.line(M, y + 6, W - M, y + 6);
    doc.setTextColor(40, 40, 40);
    y += 24;
  };
  const line = (label, value) => {
    if (y > H - 60) { doc.addPage(); y = 56; }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(String(label), M + 6, y);
    doc.setFont('helvetica', 'bold');
    doc.text(String(value), W - M - 6, y, { align: 'right' });
    y += 18;
  };

  heading('Key metrics');
  line('Active members', dashboard.active_members ?? '—');
  line('Lapsed members', dashboard.lapsed_members ?? '—');
  line('New this month', dashboard.new_month ?? '—');
  line('Revenue this month', zar(dashboard.revenue_month));
  line('Outstanding balance', zar(dashboard.outstanding_total));

  const ret = analytics.retention || {};
  heading('Retention');
  line('Active', ret.active ?? '—');
  line('Lapsed', ret.lapsed ?? '—');
  line('Churn rate', `${ret.churn_rate ?? 0}%`);
  line('New (30 days)', ret.new_30d ?? '—');

  const rev = analytics.revenue_trend || {};
  const months = Object.keys(rev).sort();
  if (months.length) {
    heading('Revenue trend (6 months)');
    for (const k of months) line(k, zar(rev[k]));
  }

  const tiers = analytics.tier_distribution || {};
  if (Object.keys(tiers).length) {
    heading('Membership tiers');
    for (const [t, c] of Object.entries(tiers)) line(t.toUpperCase(), c);
  }

  const hours = analytics.busiest_hours || {};
  const topHours = Object.entries(hours).sort((a, b2) => b2[1] - a[1]).filter(([, c]) => c > 0).slice(0, 5);
  if (topHours.length) {
    heading('Busiest hours');
    for (const [h, c] of topHours) line(`${h}:00`, `${c} check-ins`);
  }

  const pop = analytics.popular_classes || {};
  if (Object.keys(pop).length) {
    heading('Popular classes (30 days)');
    for (const [name, c] of Object.entries(pop)) line(name, `${c} bookings`);
  }

  if (finance.buckets) {
    heading('Accounts receivable aging');
    line('0–30 days', zar(finance.buckets.current));
    line('31–60 days', zar(finance.buckets.d30));
    line('61–90 days', zar(finance.buckets.d60));
    line('90+ days', zar(finance.buckets.d90));
    line('Total outstanding', zar(finance.total));
  }

  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated ${new Date().toLocaleString('en-ZA')} · ${gymName} management system`, M, H - 32);

  doc.save(`board-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
