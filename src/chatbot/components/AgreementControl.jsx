// Indemnity & membership contract acceptance (spec STEP 10 — section 9).
// Scrollable waiver + contract (+ POPIA), two required checkboxes, and a typed
// digital signature. Cannot proceed until all three are satisfied. Submits the
// acceptance object incl. timestamp + terms version.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';

export default function AgreementControl({ defaultValue, error, onSubmit }) {
  const [content, setContent] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [indemnity, setIndemnity] = useState(defaultValue?.indemnity_accepted || false);
  const [contract, setContract] = useState(defaultValue?.contract_accepted || false);
  const [signature, setSignature] = useState(defaultValue?.signature || '');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiFetch('/content', { auth: false });
        if (active) setContent(res);
      } catch (err) {
        if (active) setLoadErr(err.message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loadErr) return <p className="rounded-lg bg-error/10 px-3 py-3 text-sm text-error">{loadErr}</p>;
  if (!content) return <p className="py-6 text-center text-muted">Loading agreements…</p>;

  const ready = indemnity && contract && signature.trim().length >= 3;

  function submit() {
    if (!ready) return;
    onSubmit({
      indemnity_accepted: true,
      contract_accepted: true,
      signature: signature.trim(),
      accepted_at: new Date().toISOString(),
      terms_version: content.contract_terms_version,
    });
  }

  return (
    <div className="space-y-3">
      <Scroll title="Indemnity Waiver" text={content.indemnity_text} />
      <Scroll title="Membership Contract & Terms" text={content.contract_text} />
      <Scroll title="Privacy Policy (POPIA)" text={content.popia_text} />

      <label className="flex items-start gap-3 text-sm text-body">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
          checked={indemnity}
          onChange={(e) => setIndemnity(e.target.checked)}
        />
        I have read and agree to the indemnity waiver.
      </label>
      <label className="flex items-start gap-3 text-sm text-body">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
          checked={contract}
          onChange={(e) => setContract(e.target.checked)}
        />
        I have read and agree to the membership contract and terms.
      </label>

      <div>
        <label className="mb-1 block text-sm text-muted">
          Type your full name as your digital signature
        </label>
        <input
          className="field font-display tracking-wide"
          value={signature}
          placeholder="Your full name"
          onChange={(e) => setSignature(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <button className="btn-primary w-full" disabled={!ready} onClick={submit}>
        Accept &amp; Continue
      </button>
    </div>
  );
}

function Scroll({ title, text }) {
  return (
    <div>
      <h3 className="mb-1 font-display text-sm uppercase tracking-wider text-accent">{title}</h3>
      <div
        className="max-h-28 overflow-y-auto rounded-lg border border-white/10 bg-elevated px-3 py-2 text-xs leading-relaxed text-muted"
        style={{ whiteSpace: 'pre-line' }}
      >
        {text}
      </div>
    </div>
  );
}
