// Fetches the public catalog (plans, add-ons, contract discounts) once and
// caches it for the registration session. Prices always come from the server.
import { useEffect, useState } from 'react';
import { apiFetch } from './api.js';

let _cache = null;

export function useCatalog() {
  const [data, setData] = useState(_cache);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (_cache) return;
    let active = true;
    (async () => {
      try {
        const res = await apiFetch('/catalog', { auth: false });
        _cache = res;
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
  }, []);

  return { catalog: data, loading, error };
}
