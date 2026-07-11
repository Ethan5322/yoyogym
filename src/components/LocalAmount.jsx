// Muted "≈ local currency" hint shown next to a ZAR price for international
// members. Renders nothing when the member's currency is ZAR / unknown or the
// FX rates haven't loaded, so it can be dropped in anywhere unconditionally.
import { useFxRates, localHint } from '../lib/fx.js';

export default function LocalAmount({ zar, currency, className = '' }) {
  const rates = useFxRates();
  const hint = localHint(zar, currency, rates);
  if (!hint) return null;
  return <span className={`text-xs text-muted ${className}`}>{hint}</span>;
}
