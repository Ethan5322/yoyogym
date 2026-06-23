// GET /api/catalog -> public catalog for the registration chatbot.
// Returns enabled membership plans, enabled add-on services, and the
// contract-duration discounts from settings. Prices ALWAYS come from the
// database (spec STEP 8/9 — never hardcoded in the frontend).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { DEFAULT_CONTRACT_DISCOUNTS } from '../../../shared/pricing.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const supabase = getSupabase();

    const [{ data: plans, error: planErr }, { data: addons, error: addonErr }, { data: setting }] =
      await Promise.all([
        supabase
          .from('plans')
          .select('*')
          .eq('is_enabled', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('addon_services')
          .select('*')
          .eq('is_enabled', true)
          .order('category', { ascending: true }),
        supabase.from('settings').select('value').eq('key', 'contract_discounts').maybeSingle(),
      ]);

    if (planErr) return serverError(res, planErr.message);
    if (addonErr) return serverError(res, addonErr.message);

    const contract_discounts =
      setting && setting.value && Object.keys(setting.value).length
        ? setting.value
        : DEFAULT_CONTRACT_DISCOUNTS;

    return ok(res, {
      plans: plans || [],
      addons: addons || [],
      contract_discounts,
    });
  } catch (err) {
    console.error('catalog error:', err.message);
    return serverError(res, 'Could not load catalog');
  }
}
