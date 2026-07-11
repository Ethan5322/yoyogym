// Renders the correct input control for the current step type and reports
// the chosen value via onSubmit. Supports all step types used across the
// whole flow (statement / text / tel / email / date / textarea / select /
// multiselect / yesno) so later build steps need no new control code.
import { useEffect, useMemo, useState } from 'react';
import MembershipControl from './MembershipControl.jsx';
import AddonsControl from './AddonsControl.jsx';
import SummaryView from './SummaryView.jsx';
import AgreementControl from './AgreementControl.jsx';
import IdPhotoStep from './IdPhotoStep.jsx';
import { COUNTRIES } from '../../../shared/countries.js';

export default function Controls({ step, error, defaultValue, answers, onSubmit }) {
  switch (step.type) {
    case 'statement':
      return (
        <button className="btn-primary w-full" onClick={() => onSubmit(null)}>
          {step.cta || 'Continue'}
        </button>
      );
    case 'country':
      return <CountryControl step={step} value={defaultValue} onSubmit={onSubmit} />;
    case 'membership':
      return <MembershipControl defaultValue={defaultValue} answers={answers} onSubmit={onSubmit} />;
    case 'addons':
      return <AddonsControl defaultValue={defaultValue} answers={answers} onSubmit={onSubmit} />;
    case 'summary':
      return <SummaryView answers={answers} onSubmit={onSubmit} />;
    case 'agreement':
      return <AgreementControl defaultValue={defaultValue} error={error} onSubmit={onSubmit} />;
    case 'face':
      return <IdPhotoStep onSubmit={onSubmit} />;
    case 'select':
      return <SelectControl step={step} value={defaultValue} onSubmit={onSubmit} />;
    case 'multiselect':
      return <MultiSelectControl step={step} value={defaultValue} onSubmit={onSubmit} />;
    case 'yesno':
      return (
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-outline" onClick={() => onSubmit(false)}>
            No
          </button>
          <button className="btn-primary" onClick={() => onSubmit(true)}>
            Yes
          </button>
        </div>
      );
    case 'textarea':
      return <TextControl step={step} value={defaultValue} error={error} answers={answers} onSubmit={onSubmit} multiline />;
    default:
      return <TextControl step={step} value={defaultValue} error={error} answers={answers} onSubmit={onSubmit} />;
  }
}

function FieldError({ error }) {
  if (!error) return null;
  return <p className="mt-2 text-sm text-error">{error}</p>;
}

function TextControl({ step, value, error, answers, onSubmit, multiline }) {
  const [val, setVal] = useState(value ?? '');
  useEffect(() => setVal(value ?? ''), [step.id, value]);

  // `optional` may be a boolean or a predicate of the answers so far (e.g.
  // address fields are optional only for members living outside South Africa).
  const optional = typeof step.optional === 'function' ? step.optional(answers || {}) : !!step.optional;

  const inputType =
    step.type === 'email' ? 'email' : step.type === 'tel' ? 'tel' : step.type === 'date' ? 'date' : 'text';

  function submit() {
    onSubmit(typeof val === 'string' ? val.trim() : val);
  }

  return (
    <div>
      {multiline ? (
        <textarea
          className="field min-h-[96px] resize-none"
          value={val}
          placeholder={step.placeholder || 'Type your answer…'}
          onChange={(e) => setVal(e.target.value)}
        />
      ) : (
        <input
          className="field"
          type={inputType}
          value={val}
          placeholder={step.placeholder || ''}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      )}
      <FieldError error={error} />
      <div className="mt-3 flex gap-3">
        <button className="btn-primary flex-1" onClick={submit}>
          Continue
        </button>
        {optional && (
          <button className="btn-outline" onClick={() => onSubmit('')}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

// Searchable country picker. Buttons carry the flag + name; typing filters the
// list. Submits the ISO-3166 alpha-2 code (e.g. 'ZA'). The rest of the flow
// reads that code to adapt ID type, phone, address, medical aid and currency.
function CountryControl({ step, value, onSubmit }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle
    );
  }, [q]);

  return (
    <div>
      <input
        className="field"
        placeholder="Search country…"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="mt-3 grid max-h-[42vh] gap-2 overflow-y-auto pr-1">
        {list.map((c) => (
          <button
            key={c.code}
            onClick={() => onSubmit(c.code)}
            className={[
              'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition',
              value === c.code
                ? 'border-accent bg-accent text-black'
                : 'border-accent/50 text-body hover:bg-accent-soft',
            ].join(' ')}
          >
            <span className="text-xl">{c.flag}</span>
            <span className="font-display uppercase tracking-wide">{c.name}</span>
          </button>
        ))}
        {!list.length && <p className="py-4 text-center text-sm text-muted">No match — try another spelling.</p>}
      </div>
    </div>
  );
}

function SelectControl({ step, value, onSubmit }) {
  return (
    <div className="grid gap-3">
      {step.options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSubmit(opt.value)}
          className={[
            'w-full rounded-lg border px-4 py-3 text-left font-display uppercase tracking-wide transition',
            value === opt.value
              ? 'border-accent bg-accent text-black'
              : 'border-accent/60 text-accent hover:bg-accent-soft',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MultiSelectControl({ step, value, onSubmit }) {
  const [selected, setSelected] = useState(Array.isArray(value) ? value : []);
  useEffect(() => setSelected(Array.isArray(value) ? value : []), [step.id]);

  function toggle(v) {
    setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  return (
    <div>
      <div className="grid gap-3">
        {step.options.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className={[
                'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition',
                on ? 'border-accent bg-accent text-black' : 'border-accent/60 text-accent hover:bg-accent-soft',
              ].join(' ')}
            >
              <span className="font-display uppercase tracking-wide">{opt.label}</span>
              <span className={on ? 'text-black' : 'text-accent'}>{on ? '✓' : '+'}</span>
            </button>
          );
        })}
      </div>
      <button
        className="btn-primary mt-4 w-full"
        disabled={selected.length < (step.min || 1)}
        onClick={() => onSubmit(selected)}
      >
        Continue{selected.length ? ` (${selected.length} selected)` : ''}
      </button>
    </div>
  );
}
