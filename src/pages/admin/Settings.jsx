// Settings & configuration (spec 4.13). OWNER ONLY. Edits gym profile,
// notification contacts, contract discounts, and legal text — all stored as
// rows in the settings table and consumed across the app.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import FaceCapture from '../../chatbot/components/FaceCapture.jsx';
import IdPhotoUpload from '../../components/IdPhotoUpload.jsx';
import CredentialActions from '../../components/CredentialActions.jsx';
import { DEFAULT_ACCENT } from '../../../shared/brand.js';

export default function Settings() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState('');

  function load() {
    apiFetch('/admin/settings').then((d) => setS(d.settings || {})).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function save(key, value, category) {
    setSavedKey('');
    try {
      await apiFetch('/admin/settings', { method: 'PUT', body: { key, value, category } });
      setSavedKey(key);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <AdminShell><p className="text-error">{error}</p></AdminShell>;
  if (!s) return <AdminShell><p className="text-muted">Loading…</p></AdminShell>;
  const DEFAULTS = defaultsFor(s.gym_profile?.name);

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Settings</h1>
      <p className="mt-1 text-muted">
        Configure your gym below. Everything is pre-filled with professional defaults — review each section,
        edit anything you like, and click <b>Save</b> on that section. Changes apply across the member app, emails, and PDFs.
      </p>

      <Section title="Gym Profile" saved={savedKey === 'gym_profile'}
        note="Your brand identity. The name and accent colour appear on the splash screen, membership card, emails and PDFs."
        initial={{ ...DEFAULTS.gym_profile, ...(s.gym_profile || {}) }}
        fields={[['name', 'Gym name'], ['tagline', 'Tagline (shown on the splash screen)'], ['accent_color', 'Brand accent colour (hex — Yoyo lime is #BFF642)'], ['phone', 'Contact phone'], ['email', 'Contact email'], ['website', 'Website (optional)'], ['address', 'Physical address'], ['operating_hours', 'Operating hours'], ['welcome_message', 'Welcome message (splash screen)'], ['notice', 'Notice for members, e.g. “Closed on Friday” — shown on your gym’s home in the app (leave empty for none)']]}
        onSave={(v) => save('gym_profile', v, 'gym_profile')} />

      <LogoSection profile={{ ...DEFAULTS.gym_profile, ...(s.gym_profile || {}) }} saved={savedKey === 'gym_profile_logo'}
        onSave={(profile) => save('gym_profile', profile, 'gym_profile').then(() => setSavedKey('gym_profile_logo'))} />

      <CoverSection profile={{ ...DEFAULTS.gym_profile, ...(s.gym_profile || {}) }} saved={savedKey === 'gym_profile_cover'}
        onSave={(profile) => save('gym_profile', profile, 'gym_profile').then(() => setSavedKey('gym_profile_cover'))} />

      <Section title="Owner Notifications" saved={savedKey === 'notifications'}
        initial={s.notifications || {}}
        fields={[['owner_email', 'Owner email'], ['owner_whatsapp_phone', 'WhatsApp phone (+27…)'], ['owner_whatsapp_apikey', 'CallMeBot WhatsApp API key'], ['owner_telegram_user', 'Telegram username (@…)']]}
        note="Where instant alerts (new members, payments, capacity, incidents) are sent. CallMeBot needs a one-time activation per number/username — WhatsApp: message the CallMeBot number to get your API key; Telegram: start the CallMeBot and send /start."
        onSave={(v) => save('notifications', v, 'notifications')} />

      <Section title="Contract Discounts (%)" saved={savedKey === 'contract_discounts'}
        note="Percentage discount applied to the monthly fee for longer commitments. Longer contracts reward loyalty and reduce churn."
        initial={s.contract_discounts || { month_to_month: 0, '3_month': 0, '6_month': 5, '12_month': 10 }}
        fields={[['month_to_month', 'Month-to-month'], ['3_month', '3 month'], ['6_month', '6 month'], ['12_month', '12 month']]}
        numeric
        onSave={(v) => save('contract_discounts', v, 'payment')} />

      <ComplianceSection initial={s.compliance} saved={savedKey === 'compliance'} onSave={(v) => save('compliance', v, 'access')} />

      <PasswordSection />

      <AdminFaceEnroll />

      <MyIdCard />

      <TextSection title="Gym Rules & Code of Conduct" k="gym_rules" value={s.gym_rules?.text} defaultText={DEFAULTS.gym_rules} note="Shown to members during registration and printed on their confirmation." saved={savedKey === 'gym_rules'} onSave={(text) => save('gym_rules', { text }, 'rules')} />
      <TextSection title="Indemnity Waiver" k="indemnity_text" value={s.indemnity_text?.text} defaultText={DEFAULTS.indemnity_text} note="Legal waiver the member must accept before joining (CPA-aligned)." saved={savedKey === 'indemnity_text'} onSave={(text) => save('indemnity_text', { text }, 'terms')} />
      <TextSection title="Membership Contract" k="contract_text" value={s.contract_text?.text} defaultText={DEFAULTS.contract_text} note="Your membership terms: billing, cancellation (20 business days, CPA), conduct." saved={savedKey === 'contract_text'} onSave={(text) => save('contract_text', { text }, 'terms')} />
      <TextSection title="POPIA Privacy Policy" k="popia_text" value={s.popia_text?.text} defaultText={DEFAULTS.popia_text} note="How you process members' personal information (POPIA compliant)." saved={savedKey === 'popia_text'} onSave={(text) => save('popia_text', { text }, 'terms')} />
    </AdminShell>
  );
}

// The pre-filled texts, in THIS gym's name — never the old single-gym name
// (CLAUDE.md §37.1). A gym with no saved name yet reads "the gym".
function defaultsFor(gymName) {
  const gym = String(gymName || '').trim() || 'the gym';
  return {
  gym_profile: {
    name: '',
    tagline: 'Train harder. Live stronger.',
    accent_color: DEFAULT_ACCENT,
    logo_url: '',
    operating_hours: 'Mon–Fri 05:00–21:00 · Sat–Sun 07:00–18:00',
    welcome_message: `Welcome to ${gym} — your journey to a stronger, healthier you starts here. Scan, register, and let’s get moving.`,
    website: '',
  },
  gym_rules: `1. Always carry and present your membership for access.
2. Wipe down equipment after every use and re-rack your weights.
3. Appropriate gym attire and closed training shoes are required.
4. Respect staff, trainers and fellow members at all times.
5. Personal belongings are the member's responsibility — use the lockers provided.
6. No outside trainers may operate on the gym floor without authorisation.
7. Report any faulty equipment or injuries to reception immediately.
8. The gym reserves the right to suspend membership for serious misconduct.`,
  indemnity_text:
    'I acknowledge that physical exercise carries inherent risks including injury or illness. ' +
    `I confirm that I am physically capable of participating in a gym environment. I indemnify ${gym} and ` +
    'its staff against any injury, illness, loss, or damage arising from my use of the facilities, to the extent ' +
    'permitted by South African law.',
  contract_text:
    'MEMBERSHIP CONTRACT & TERMS\n\n' +
    '1. Billing: Monthly fees are collected by debit order / card on the agreed billing date.\n' +
    '2. Cancellation: 20 business days written notice is required (Consumer Protection Act compliant).\n' +
    '3. Early cancellation of a fixed-term contract may attract a reasonable cancellation fee.\n' +
    '4. Members agree to follow the gym rules and code of conduct at all times.\n' +
    '5. Guests are subject to the gym guest policy and applicable fees.\n' +
    '6. In a medical emergency, the gym may obtain emergency assistance on the member’s behalf.\n' +
    '7. Personal information is processed in line with POPIA (see privacy policy).',
  popia_text:
    'PRIVACY POLICY (POPIA)\n\n' +
    `${gym} processes your personal information solely to administer your membership, payments, health & safety ` +
    'screening, and communications. Your data is stored securely and is never sold. You may request access to, ' +
    'correction of, or deletion of your personal information at any time. (Protection of Personal Information Act, 2013.)',
};
}

const TIERS = ['basic', 'standard', 'premium', 'vip'];
const DEFAULT_COMPLIANCE = {
  capacity: 120,
  session_minutes: 120,
  peak_hours: { start: 17, end: 20 },
  plan_rules: {
    basic: { access: 'off_peak', classes_per_month: 0 },
    standard: { access: 'anytime', classes_per_month: 4 },
    premium: { access: 'anytime', classes_per_month: -1 },
    vip: { access: 'anytime', classes_per_month: -1 },
  },
};

function ComplianceSection({ initial, onSave, saved }) {
  const [c, setC] = useState({ ...DEFAULT_COMPLIANCE, ...(initial || {}), peak_hours: { ...DEFAULT_COMPLIANCE.peak_hours, ...(initial?.peak_hours || {}) }, plan_rules: { ...DEFAULT_COMPLIANCE.plan_rules, ...(initial?.plan_rules || {}) } });
  useEffect(() => {
    if (initial) setC((p) => ({ ...DEFAULT_COMPLIANCE, ...initial, peak_hours: { ...DEFAULT_COMPLIANCE.peak_hours, ...(initial.peak_hours || {}) }, plan_rules: { ...DEFAULT_COMPLIANCE.plan_rules, ...(initial.plan_rules || {}) } }));
  }, [JSON.stringify(initial)]); // eslint-disable-line
  const setRule = (t, k, v) => setC({ ...c, plan_rules: { ...c.plan_rules, [t]: { ...c.plan_rules[t], [k]: v } } });

  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">Access &amp; Compliance</h2>
      <p className="mb-3 text-xs text-muted">Powers the scan card, attendance board, plan-limit enforcement and adherence scoring.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Gym capacity"><input className="field" type="number" value={c.capacity} onChange={(e) => setC({ ...c, capacity: Number(e.target.value) })} /></Field>
        <Field label="Session length (min)"><input className="field" type="number" value={c.session_minutes} onChange={(e) => setC({ ...c, session_minutes: Number(e.target.value) })} /></Field>
        <Field label="Peak hours (24h)">
          <div className="flex gap-2">
            <input className="field" type="number" value={c.peak_hours.start} onChange={(e) => setC({ ...c, peak_hours: { ...c.peak_hours, start: Number(e.target.value) } })} />
            <input className="field" type="number" value={c.peak_hours.end} onChange={(e) => setC({ ...c, peak_hours: { ...c.peak_hours, end: Number(e.target.value) } })} />
          </div>
        </Field>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted"><tr><th className="py-1">Tier</th><th>Access</th><th>Classes / month (-1 = unlimited)</th></tr></thead>
          <tbody>
            {TIERS.map((t) => (
              <tr key={t} className="border-t border-white/5">
                <td className="py-1.5 uppercase text-body">{t}</td>
                <td>
                  <select className="field w-32 py-1" value={c.plan_rules[t]?.access || 'anytime'} onChange={(e) => setRule(t, 'access', e.target.value)}>
                    <option value="anytime">Anytime</option>
                    <option value="off_peak">Off-peak only</option>
                  </select>
                </td>
                <td><input className="field w-24 py-1" type="number" value={c.plan_rules[t]?.classes_per_month ?? 0} onChange={(e) => setRule(t, 'classes_per_month', Number(e.target.value))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => onSave(c)}>Save</button>
        {saved && <span className="text-sm text-success">Saved ✓</span>}
      </div>
    </div>
  );
}

function PasswordSection() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMsg('');
    setErr('');
    if (next.length < 8) return setErr('New password must be at least 8 characters.');
    if (next !== confirm) return setErr('New passwords do not match.');
    setBusy(true);
    try {
      const r = await apiFetch('/auth/change-password', {
        method: 'POST',
        body: { current_password: cur, new_password: next },
      });
      setMsg(r.message || 'Password updated.');
      setCur(''); setNext(''); setConfirm('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">Change Password</h2>
      <p className="mb-3 text-xs text-muted">Update the password for your own admin login. Minimum 8 characters.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Current password"><input className="field" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="New password"><input className="field" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Confirm new password"><input className="field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" onClick={submit} disabled={busy || !cur || !next}>
          {busy ? 'Updating…' : 'Update Password'}
        </button>
        {msg && <span className="text-sm text-success">{msg}</span>}
        {err && <span className="text-sm text-error">{err}</span>}
      </div>
    </div>
  );
}

function AdminFaceEnroll() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  async function onCapture(result) {
    if (!result?.descriptor) { setOpen(false); return; }
    try {
      // Send the full multi-pose gallery so a later hair/beard change still matches.
      await apiFetch('/admin/enroll-face', {
        method: 'POST',
        body: { descriptors: result.descriptors || [result.descriptor], images: result.images || [] },
      });
      setMsg('Face enrolled — you can now log in with your face.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setOpen(false);
    }
  }
  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">Admin Face Login (QR Type C)</h2>
      <p className="mb-3 text-xs text-muted">Enrol your face so you can unlock the admin panel by face scan at the gate.</p>
      {msg && <p className="mb-3 text-sm text-success">{msg}</p>}
      {open ? (
        <div className="max-w-xs">
          <FaceCapture onSubmit={onCapture} />
        </div>
      ) : (
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => { setMsg(''); setOpen(true); }}>Enrol my face</button>
      )}
    </div>
  );
}

// My ID photo & card — self-service for the signed-in admin/owner. Change the
// photo that appears on your ID as often as you like: take a fresh one with
// the camera OR upload from your gallery (auto-cropped to the corporate ID
// standard), then download your updated card.
function MyIdCard() {
  const [profile, setProfile] = useState(null);
  const [mode, setMode] = useState(null); // null | 'camera'
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function load() {
    apiFetch('/admin/profile').then((d) => setProfile(d.profile)).catch((e) => setErr(e.message));
  }
  useEffect(load, []);

  async function savePhoto(photo_url) {
    if (!photo_url) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      await apiFetch('/admin/profile', { method: 'POST', body: { photo_url } });
      setMsg('ID photo updated. Download your refreshed card below.');
      setMode(null);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">My ID Photo &amp; Card</h2>
      <p className="mb-3 text-xs text-muted">
        Change the photo on your ID whenever you like — take a new one or upload from your gallery.
        We auto-crop it to the corporate ID standard. Stored privately (POPIA).
      </p>
      {msg && <p className="mb-3 text-sm text-success">{msg}</p>}
      {err && <p className="mb-3 text-sm text-error">{err}</p>}

      {mode === 'camera' ? (
        <div className="max-w-xs">
          <FaceCapture mode="verify" onSubmit={(res) => savePhoto(res?.image)} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {profile?.photo_url ? (
            <img src={profile.photo_url} alt="" className="h-24 w-[72px] rounded object-cover gold-frame" />
          ) : (
            <div className="flex h-24 w-[72px] items-center justify-center rounded bg-elevated text-center text-[10px] text-muted">
              No photo
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline px-4 py-2 text-sm" disabled={busy} onClick={() => { setMsg(''); setErr(''); setMode('camera'); }}>
              📷 Take a photo
            </button>
            <IdPhotoUpload
              className="btn-outline px-4 py-2 text-sm"
              label={busy ? 'Saving…' : '🖼️ Upload from gallery'}
              onPhoto={(url) => savePhoto(url)}
            />
          </div>
        </div>
      )}

      {profile && mode !== 'camera' && (
        <div className="mt-4 border-t border-white/5 pt-4">
          <p className="mb-2 text-xs text-muted">
            {profile.staff_number ? <>ID No: <span className="text-accent">{profile.staff_number}</span> · </> : null}
            Download your corporate ID card:
          </p>
          <CredentialActions
            person={{
              kind: 'staff',
              id: profile.id,
              name: profile.full_name || profile.username,
              number: profile.staff_number,
              verification_code: profile.verification_code,
              badge: profile.job_title || profile.role,
              photo_url: profile.photo_url,
              job_title: profile.job_title || profile.role,
              phone: profile.phone,
              email: profile.email,
              contract_start: profile.contract_start,
              contract_end: profile.contract_end,
            }}
          />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted">{label}</label>
      {children}
    </div>
  );
}

function Section({ title, fields, initial, numeric, note, onSave, saved }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [JSON.stringify(initial)]); // eslint-disable-line
  return (
    <div className="card mt-6">
      <h2 className="mb-3 font-display uppercase text-body">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-xs text-muted">{label}</label>
            <input
              className="field"
              value={v[key] ?? ''}
              onChange={(e) => setV({ ...v, [key]: numeric ? Number(e.target.value) : e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => onSave(v)}>Save</button>
        {saved && <span className="text-sm text-success">Saved ✓</span>}
      </div>
    </div>
  );
}

/** Largest logo side, in pixels, and the most a saved logo may weigh. */
const LOGO_PX = 256;
const LOGO_MAX_BYTES = 300 * 1024;

/**
 * Shrink an image file to fit LOGO_PX × LOGO_PX, as a PNG data URL (PNG keeps
 * a transparent background). Done in the browser, so what is saved is small:
 * it travels to every member on every visit.
 */
function shrinkLogo(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Choose a PNG, JPG or WebP image.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, LOGO_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/png');
      if (data.length > LOGO_MAX_BYTES) return reject(new Error('That image is too detailed to use as a logo. Try a simpler one.'));
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
    img.src = url;
  });
}

/**
 * The gym's own logo (CLAUDE.md §37.1 Q6): what its MEMBERS see — the welcome
 * page, registration, sign-in, the member portal and the app. Until one is
 * uploaded they see the gym's first letter in its colour. IDs and PDFs keep the
 * Yoyo Gyms logo with the gym's name.
 */
function LogoSection({ profile, onSave, saved }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const logo = profile.logo_url || '';
  const initial = (String(profile.name || '').trim()[0] || '·').toUpperCase();

  async function choose(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    setBusy(true);
    try {
      await onSave({ ...profile, logo_url: await shrinkLogo(file) });
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">Gym logo</h2>
      <p className="mb-4 text-xs text-muted">
        Your members see it on your welcome page, registration, sign-in and in the app. Until you upload one they see
        your gym's first letter in your colour. IDs and PDFs carry the Yoyo Gyms logo with your gym's name.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {logo ? (
          <img src={logo} alt="Your gym logo" className="h-20 w-auto rounded-lg bg-elevated object-contain p-2" />
        ) : (
          <span className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-accent font-display text-4xl font-bold text-accent-ink">{initial}</span>
        )}
        <label className="btn-primary cursor-pointer px-4 py-2 text-sm">
          {busy ? 'Saving…' : logo ? 'Change logo' : 'Upload logo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={choose} disabled={busy} />
        </label>
        {logo && !busy && (
          <button className="text-sm text-muted hover:text-error" onClick={() => onSave({ ...profile, logo_url: '' })}>
            Remove logo
          </button>
        )}
        {saved && <span className="text-sm text-success">Saved ✓</span>}
      </div>
      <p className="mt-2 text-xs text-muted">PNG, JPG or WebP. A square logo on a transparent background looks best.</p>
      {err && <p className="mt-2 text-sm text-error">{err}</p>}
    </div>
  );
}

/** Widest cover picture, in pixels. Shrunk in the browser to a JPEG this size. */
const COVER_PX = 1600;

/** Shrink a photo to at most COVER_PX wide, as a JPEG blob — well under the bucket's 2 MB. */
function shrinkCover(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Choose a PNG, JPG or WebP photo.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, COVER_PX / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#070C10'; // a transparent PNG gets the app's ground, not black
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('That photo could not be prepared.'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a photo.')); };
    img.src = url;
  });
}

/**
 * The gym's cover picture (CLAUDE.md §38.1 Q4, Q5): the big photo at the top of
 * its home in the app. Sent straight to storage with a one-time link — it
 * never passes through our server — then saved on the gym's profile.
 */
function CoverSection({ profile, onSave, saved }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const cover = profile.cover_url || '';

  async function choose(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try {
      setBusy('Preparing…');
      const blob = await shrinkCover(file);
      setBusy('Uploading…');
      const target = await apiFetch('/admin/settings?upload=cover', { method: 'POST' });
      const put = await fetch(target.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${target.token}` },
        body: blob,
      });
      if (!put.ok) throw new Error('The upload did not finish. Please try again.');
      setBusy('Saving…');
      await onSave({ ...profile, cover_url: target.public_url });
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">Cover picture</h2>
      <p className="mb-4 text-xs text-muted">
        The big photo at the top of your gym's home in the app — what your members see every time they open it. A wide
        photo of your gym floor or your team works best.
      </p>
      {cover ? (
        <img src={cover} alt="Your gym's cover" className="mb-4 aspect-[16/9] w-full max-w-md rounded-xl object-cover" />
      ) : (
        <div className="mb-4 flex aspect-[16/9] w-full max-w-md items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-muted">
          No cover picture yet
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <label className="btn-primary cursor-pointer px-4 py-2 text-sm">
          {busy || (cover ? 'Change cover picture' : 'Upload cover picture')}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={choose} disabled={Boolean(busy)} />
        </label>
        {cover && !busy && (
          <button className="text-sm text-muted hover:text-error" onClick={() => onSave({ ...profile, cover_url: '' })}>
            Remove cover picture
          </button>
        )}
        {saved && <span className="text-sm text-success">Saved ✓</span>}
      </div>
      {err && <p className="mt-2 text-sm text-error">{err}</p>}
    </div>
  );
}

function TextSection({ title, value, defaultText = '', note, onSave, saved }) {
  // Pre-fill the professional default when nothing is saved yet, so the admin
  // can review/edit and save rather than start from a blank box.
  const [t, setT] = useState(value ?? defaultText);
  useEffect(() => setT(value ?? defaultText), [value, defaultText]);
  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted">{note}</p>}
      <textarea className="field min-h-[140px]" value={t} onChange={(e) => setT(e.target.value)} />
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => onSave(t)}>Save</button>
        {saved && <span className="text-sm text-success">Saved ✓</span>}
        <button className="text-xs text-muted hover:text-body" onClick={() => setT(defaultText)}>Reset to default</button>
      </div>
    </div>
  );
}
