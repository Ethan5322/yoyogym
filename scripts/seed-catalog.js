// Seeds a sensible default catalog (membership plans, session packs, day pass,
// trial, add-on services) and contract-discount settings, so the registration
// chatbot has data to show. Prices are SA-market example defaults from the spec
// and are fully editable later in the admin panel (Phase 7).
//
// Run:  npm run seed:catalog
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SCHEMA = 'gym' } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✖ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: SUPABASE_SCHEMA },
});

const PLANS = [
  {
    name: 'Basic',
    tier: 'basic',
    visit_type: 'full',
    description: 'Gym floor and equipment access.',
    benefits: ['Full gym floor & equipment', 'Single club access', 'No peak-hour restrictions'],
    monthly_price: 299,
    joining_fee: 199,
    classes_included: 0,
    sort_order: 1,
  },
  {
    name: 'Standard',
    tier: 'standard',
    visit_type: 'full',
    description: 'Gym access plus group classes.',
    benefits: ['Full gym floor access', '4 group classes / month', 'Single club access'],
    monthly_price: 499,
    joining_fee: 199,
    classes_included: 4,
    is_featured: true,
    sort_order: 2,
  },
  {
    name: 'Premium',
    tier: 'premium',
    visit_type: 'full',
    description: 'Unlimited classes + 1 PT session.',
    benefits: ['Full gym floor access', 'Unlimited group classes', '1 personal training session / month', 'Locker access'],
    monthly_price: 799,
    joining_fee: 149,
    classes_included: -1,
    pt_sessions_incl: 1,
    sort_order: 3,
  },
  {
    name: 'VIP / Elite',
    tier: 'vip',
    visit_type: 'full',
    description: 'Everything, plus 4 PT sessions & extras.',
    benefits: [
      'Full gym floor access',
      'Unlimited group classes',
      '4 personal training sessions / month',
      'Priority locker',
      'Monthly nutrition consultation',
      '1 free guest pass / month',
    ],
    monthly_price: 1499,
    joining_fee: 0,
    classes_included: -1,
    pt_sessions_incl: 4,
    sort_order: 4,
  },
  // Session packs
  { name: '5 Session Pack', visit_type: 'session_pack', session_pack_size: 5, session_pack_price: 600, sort_order: 5 },
  { name: '10 Session Pack', visit_type: 'session_pack', session_pack_size: 10, session_pack_price: 1100, sort_order: 6 },
  { name: '20 Session Pack', visit_type: 'session_pack', session_pack_size: 20, session_pack_price: 2000, sort_order: 7 },
  // Day pass & trial
  { name: 'Day Pass', visit_type: 'day_pass', day_pass_price: 80, sort_order: 8 },
  { name: '7-Day Trial', visit_type: 'trial', trial_days: 7, trial_price: 99, sort_order: 9 },
];

const ADDONS = [
  { name: 'Personal Trainer Assessment', category: 'personal_training', description: 'Once-off fitness assessment.', price: 350, billing_type: 'once_off' },
  { name: 'Personal Training Session', category: 'personal_training', description: 'One-on-one PT session.', price: 280, billing_type: 'per_session' },
  { name: 'Online Coaching Program', category: 'personal_training', description: 'Monthly online coaching.', price: 499, billing_type: 'monthly' },
  { name: 'Yoga Classes', category: 'class', description: 'Access to yoga classes.', price: 250, billing_type: 'monthly' },
  { name: 'HIIT / Circuit Training', category: 'class', description: 'High-intensity circuit classes.', price: 250, billing_type: 'monthly' },
  { name: 'Boxing / Kickboxing', category: 'class', description: 'Boxing & kickboxing classes.', price: 300, billing_type: 'monthly' },
  { name: 'Locker Rental', category: 'additional', description: 'Personal locker, monthly.', price: 99, billing_type: 'monthly' },
  { name: 'Towel Service', category: 'additional', description: 'Fresh towels each visit.', price: 79, billing_type: 'monthly' },
  { name: 'Body Composition Assessment', category: 'additional', description: 'BMI & body-fat measurement.', price: 150, billing_type: 'once_off' },
  { name: 'Nutrition Consultation', category: 'additional', description: 'Session with a nutritionist.', price: 400, billing_type: 'once_off' },
];

async function run() {
  // Plans / add-ons: skip if a row with the same name already exists.
  for (const p of PLANS) {
    const { data: existing } = await supabase.from('plans').select('id').eq('name', p.name).maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('plans').insert(p);
    if (error) throw new Error(`plan "${p.name}": ${error.message}`);
  }
  for (const ad of ADDONS) {
    const { data: existing } = await supabase.from('addon_services').select('id').eq('name', ad.name).maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('addon_services').insert(ad);
    if (error) throw new Error(`addon "${ad.name}": ${error.message}`);
  }

  // Contract discounts setting (longer contracts cost less per month).
  const { error: sErr } = await supabase.from('settings').upsert(
    {
      key: 'contract_discounts',
      category: 'payment',
      value: { month_to_month: 0, '3_month': 0, '6_month': 5, '12_month': 10 },
    },
    { onConflict: 'key' }
  );
  if (sErr) throw new Error(`settings: ${sErr.message}`);

  console.log('✔ Catalog seeded: plans, add-ons, and contract discounts.');
}

run().catch((e) => {
  console.error('✖ ' + e.message);
  process.exit(1);
});
