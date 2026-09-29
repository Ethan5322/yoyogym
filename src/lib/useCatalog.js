// Fetches the public catalog (plans, add-ons, contract discounts) once and
// caches it for the registration session. Prices always come from the server.
import { useEffect, useState } from 'react';
import { apiFetch } from './api.js';
import { currentGymSlug } from './gym.js';

// ONE ENTRY PER GYM. This was a single slot, so moving from one gym's sign-up
// to another's in the same session showed the first gym's plans and prices.
const _cache = new Map();

export function useCatalog() {
  const key = currentGymSlug() || '~home';
  const [data, setData] = useState(_cache.get(key) || null);
  const [loading, setLoading] = useState(!_cache.has(key));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (_cache.has(key)) return;
    let active = true;
    (async () => {
      try {
        const res = await apiFetch('/catalog', { auth: false });
        _cache.set(key, res);
        if (active) setData(res);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [key]);

  return { catalog: data, loading, error };
}
