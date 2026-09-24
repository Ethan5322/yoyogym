// Logs a QR scan when a landing page is opened via a QR code (?src=qr).
// Fire-and-forget — never blocks the UI.
import { gymHeaders } from './gym.js';

export function logQrScan(qrType) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('src') !== 'qr') return;
    fetch('/api/scan', {
      method: 'POST',
      // The gym, or the scan is counted against the default schema's gym.
      headers: { 'Content-Type': 'application/json', ...gymHeaders() },
      body: JSON.stringify({ qr_type: qrType }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
