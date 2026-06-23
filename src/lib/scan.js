// Logs a QR scan when a landing page is opened via a QR code (?src=qr).
// Fire-and-forget — never blocks the UI.
export function logQrScan(qrType) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('src') !== 'qr') return;
    fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_type: qrType }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
