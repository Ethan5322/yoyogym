// One-time script to create the first OWNER admin account.
// Run locally after setting .env:   npm run seed:owner
//
// Reads SEED_OWNER_* from the environment, hashes the password with bcrypt,
// and inserts (or updates) the owner in gym.admin_users.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SCHEMA = 'gym',
  SEED_OWNER_USERNAME = 'owner',
  SEED_OWNER_EMAIL,
  SEED_OWNER_PASSWORD,
  SEED_OWNER_FULLNAME = 'Gym Owner',
  BCRYPT_ROUNDS = '12',
} = process.env;

function fail(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) fail('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
if (!SEED_OWNER_EMAIL) fail('Missing SEED_OWNER_EMAIL in .env');
if (!SEED_OWNER_PASSWORD) fail('Missing SEED_OWNER_PASSWORD in .env');
if (SEED_OWNER_PASSWORD.length < 8) fail('SEED_OWNER_PASSWORD must be at least 8 characters');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: SUPABASE_SCHEMA },
});

const hash = await bcrypt.hash(SEED_OWNER_PASSWORD, parseInt(BCRYPT_ROUNDS, 10));

const { data, error } = await supabase
  .from('admin_users')
  .upsert(
    {
      username: SEED_OWNER_USERNAME,
      email: SEED_OWNER_EMAIL,
      password_hash: hash,
      full_name: SEED_OWNER_FULLNAME,
      role: 'owner',
      is_active: true,
    },
    { onConflict: 'username' }
  )
  .select('id, username, email, role')
  .single();

if (error) fail('Insert failed: ' + error.message);

console.log('✔ Owner account ready:');
console.log('  username:', data.username);
console.log('  email:   ', data.email);
console.log('  role:    ', data.role);
console.log('\nYou can now log in at /admin/login');
