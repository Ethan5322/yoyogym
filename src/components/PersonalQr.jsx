// Renders a person's personal QR (Type B) from their public-profile URL,
// with download + print. Used in the member portal and admin records.
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function PersonalQr({ url, name = 'profile', label }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 1, errorCorrectionLevel: 'H' });
  }, [url]);

  function download() {
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = `yoyo-qr-${name.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }
  function print() {
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const w = window.open('', '_blank');
    w.document.write(`<html><body style="text-align:center;font-family:sans-serif;padding:40px">
      <h1>YOYO GYM</h1><h2>${name}</h2><img src="${dataUrl}" style="width:240px"/>
      <p style="color:#888;font-size:12px">Scan to verify membership</p></body></html>`);
    w.document.close();
    w.print();
  }

  return (
    <div className="text-center">
      {label && <div className="mb-2 text-sm text-muted">{label}</div>}
      <div className="inline-block rounded-xl bg-white p-3">
        <canvas ref={canvasRef} />
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button className="btn-primary px-4 py-2 text-sm" onClick={download}>Download</button>
        <button className="btn-outline px-4 py-2 text-sm" onClick={print}>Print</button>
      </div>
    </div>
  );
}
