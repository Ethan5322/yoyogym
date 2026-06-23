// Formats a stored answer back into a human-readable string for the
// transcript (the "you said" bubble) and the final summary.
export function formatAnswer(step, value) {
  if (value === null || value === undefined || value === '') {
    return step?.optional ? 'Skipped' : '—';
  }
  switch (step?.type) {
    case 'yesno':
      return value ? 'Yes' : 'No';
    case 'select': {
      const o = (step.options || []).find((o) => o.value === value);
      return o ? o.label : String(value);
    }
    case 'multiselect':
      return (value || [])
        .map((v) => {
          const o = (step.options || []).find((o) => o.value === v);
          return o ? o.label : v;
        })
        .join(', ');
    case 'membership':
      return [value.plan_name, value.contract_label].filter(Boolean).join(' · ');
    case 'addons':
      return value.length ? value.map((a) => a.name).join(', ') : 'No add-ons';
    case 'agreement':
      return `Accepted & signed — ${value.signature}`;
    case 'date':
      try {
        return new Date(value).toLocaleDateString('en-ZA', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch {
        return String(value);
      }
    default:
      return String(value);
  }
}
