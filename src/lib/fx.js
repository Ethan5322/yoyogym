// Live currency conversion for DISPLAY ONLY.
//
// The gym charges in ZAR (Paystack is a ZAR account), but international members
// registering through MuleSoo should see the price in their own currency as a
// guide. This module fetches ZAR→X rates from a free, no-key FX service, caches
// them, and formats an "≈ local" hint. It never changes what is charged.
//
// If the network or the service is unavailable, every helper degrades to "no
// hint" and the UI simply shows the ZAR amount — conversion is never a blocker.
import { useEffect, useState } from 'react';

const ENDPOINT = 'https://open.er-api.com/v6/latest/ZAR'; // rates = foreign per 1 ZAR
const CACHE_KEY = 'gym_fx_rates_zar_v1';
const TTL_MS = 12 * 60 * 60 * 1000; // refresh twice a day

let _promise = null; // de-dupe concurrent fetches within a session

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c && c.rates && Date.now() - c.at < TTL_MS) return c.rates;
  } catch {
    /* ignore */
  }
  return null;
}

/** Resolve ZAR→X rates ({ USD: 0.054, ETB: 3.1, … }), cached. Never throws. */
export function getRates() {
  const cached = readCache();
  if (cached) return Promise.resolve(cached);
  if (_promise) return _promise;
  _promise = fetch(ENDPOINT)
    .then((r) => r.json())
    .then((j) => {
      const rates = j && (j.result === 'success' || j.rates) ? j.rates : null;
      if (rates) {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rates }));
        } catch {
          /* ignore quota */
        }
      }
      return rates || {};
    })
    .catch(() => ({}))
    .finally(() => {
      _promise = null;
    });
  return _promise;
}

/** React hook — returns the ZAR→X rate map (or {} until loaded / on failure). */
export function useFxRates() {
  const [rates, setRates] = useState(() => readCache() || {});
  useEffect(() => {
    let alive = true;
    getRates().then((r) => alive && setRates(r || {}));
    return () => {
      alive = false;
    };
  }, []);
  return rates;
}

/** Format an amount in a given currency using the browser's locale rules. */
export function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    // Unknown ISO code — fall back to a plain number + code.
    return `${Number(amount).toLocaleString()} ${currency}`;
  }
}

/**
 * "≈ $35.20" hint for a ZAR amount in the member's `currency`.
 * Falls back to a USD reference when the local currency has no live rate (some
 * smaller-market currencies aren't quoted), and returns '' when the currency is
 * ZAR, nothing is available, or rates aren't loaded — so callers can render it
 * unconditionally.
 */
export function localHint(zar, currency, rates) {
  if (!currency || currency === 'ZAR') return '';
  const amt = Number(zar || 0);
  if (rates?.[currency]) return `≈ ${formatCurrency(amt * rates[currency], currency)}`;
  if (rates?.USD) return `≈ ${formatCurrency(amt * rates.USD, 'USD')}`;
  return '';
}
