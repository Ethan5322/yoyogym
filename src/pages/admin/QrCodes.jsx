// QR code generation (spec 2.1 / 4.10 / Phase 9 #54). Generates the two
// branded QR codes (new member + existing member) pointing at the public
// flows with ?src=qr for scan tracking. Each is downloadable (PNG) and
// printable. Also shows QR scan conversion analytics.
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const origin = typeof window !== 'undefined' ? window.location.origin : '';

const CODES = [
  { key: 'new', title: 'New Member', subtitle: 'Join / Register', url: `${origin}/register?src=qr` },
  { key: 'existing', title: 'Existing Member', subtitle: 'Check-in / Book', url: `${origin}/member?src=qr` },
];

export default function QrCodes() {
  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">QR Codes</h1>
      <p className="mt-1 text-muted">Print these and place them at your entrance, reception, and on flyers.</p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {CODES.map((c) => (
          <QrCard key={c.key} {...c} />
        ))}
      </div>

      <ScanStats />
    </AdminShell>
  );
}

function QrCard({ title, subtitle, url }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    QRCode.toCanvas(canvasRef.current, url, { width: 320, margin: 2, errorCorrectionLevel: 'H' }, () => setReady(true));
  }, [url]);

  function download() {
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = `qr-${title.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  }
  function print() {
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const w = window.open('', '_blank');
    w.document.write(
      `<html><body style="text-align:center;font-family:sans-serif;padding:40px">
        <h1>${title}</h1><p>${subtitle}</p>
        <img src="${dataUrl}" style="width:320px"/>
        <p style="color:#888;font-size:12px">${url}</p>
       </body></html>`
    );
    w.document.close();
    w.print();
  }

  return (
    <div className="card text-center">
      <h2 className="font-display text-xl uppercase text-body">{title}</h2>
      <p className="text-sm text-muted">{subtitle}</p>
      <div className="mt-4 inline-block rounded-xl bg-white p-3">
        <canvas ref={canvasRef} />
      </div>
      <p className="mt-2 break-all text-xs text-muted">{url}</p>
      <div className="mt-4 flex justify-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" disabled={!ready} onClick={download}>Download PNG</button>
        <button className="btn-outline px-4 py-2 text-sm" disabled={!ready} onClick={print}>Print</button>
      </div>
    </div>
  );
}

function ScanStats() {
  const [d, setD] = useState(null);
  useEffect(() => {
    apiFetch('/admin/qr-stats').then(setD).catch(() => setD({ error: true }));
  }, []);
  if (!d || d.error) return null;
  return (
    <div className="card mt-8">
      <h2 className="font-display uppercase text-body">Scan Analytics</h2>
      <div className="mt-3 grid grid-cols-3 gap-4 text-center">
        <div><div className="font-display text-2xl text-body">{d.total_scans}</div><div className="text-xs text-muted">Total scans</div></div>
        <div><div className="font-display text-2xl text-body">{d.new_member_scans}</div><div className="text-xs text-muted">New-member scans</div></div>
        <div><div className="font-display text-2xl text-accent">{d.conversion_rate}%</div><div className="text-xs text-muted">Scan → registration</div></div>
      </div>
    </div>
  );
}
