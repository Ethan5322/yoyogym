// Renders the correct input control for the current step type and reports
// the chosen value via onSubmit. Supports all step types used across the
// whole flow (statement / text / tel / email / date / textarea / select /
// multiselect / yesno) so later build steps need no new control code.
import { useEffect, useState } from 'react';
import MembershipControl from './MembershipControl.jsx';
import AddonsControl from './AddonsControl.jsx';
import SummaryView from './SummaryView.jsx';
import AgreementControl from './AgreementControl.jsx';
import FaceCapture from './FaceCapture.jsx';

export default function Controls({ step, error, defaultValue, answers, onSubmit }) {
  switch (step.type) {
    case 'statement':
      return (
        <button className="btn-primary w-full" onClick={() => onSubmit(null)}>
          {step.cta || 'Continue'}
        </button>
      );
    case 'membership':
      return <MembershipControl defaultValue={defaultValue} onSubmit={onSubmit} />;
    case 'addons':
      return <AddonsControl defaultValue={defaultValue} onSubmit={onSubmit} />;
    case 'summary':
      return <SummaryView answers={answers} onSubmit={onSubmit} />;
    case 'agreement':
      return <AgreementControl defaultValue={defaultValue} error={error} onSubmit={onSubmit} />;
    case 'face':
      return <FaceCapture onSubmit={onSubmit} />;
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
      return <TextControl step={step} value={defaultValue} error={error} onSubmit={onSubmit} multiline />;
    default:
      return <TextControl step={step} value={defaultValue} error={error} onSubmit={onSubmit} />;
  }
}

function FieldError({ error }) {
  if (!error) return null;
  return <p className="mt-2 text-sm text-error">{error}</p>;
}

function TextControl({ step, value, error, onSubmit, multiline }) {
  const [val, setVal] = useState(value ?? '');
  useEffect(() => setVal(value ?? ''), [step.id, value]);

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
        {step.optional && (
          <button className="btn-outline" onClick={() => onSubmit('')}>
            Skip
          </button>
        )}
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
