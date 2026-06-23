// Connectivity check against the gym schema. Run: node scripts/test-connection.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: process.env.SUPABASE_SCHEMA || 'gym' },
});

const tables = ['settings', 'plans', 'addon_services', 'members', 'admin_users'];
let failed = false;
for (const t of tables) {
  const { count, error } = await sb.from(t).select('id', { count: 'exact', head: false }).limit(1);
  if (error) {
    console.log(`✖ ${t}: [${error.code || '?'}] ${error.message}`);
    failed = true;
  } else {
    console.log(`✔ ${t}: reachable`);
  }
}
console.log(failed ? '\nSome tables failed — see errors above.' : '\nAll good — gym schema reachable.');
