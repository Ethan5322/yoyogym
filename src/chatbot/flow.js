// Registration conversation flow — the single source of truth the engine walks.
//
// The flow is an ordered array of "steps". Each step renders one question.
// Steps grow phase by phase; STEP 5 (this build) defines sections 1–2.
// Later build steps append PAR-Q, goals, plans, add-ons, and contract.
//
// Step shape:
//   id          unique key
//   section     which of the 11 registration sections (drives the progress bar)
//   type        'statement' | 'text' | 'tel' | 'email' | 'date' | 'textarea'
//               | 'select' | 'multiselect' | 'yesno'
//   field       key under which the answer is stored (omit for statements)
//   prompt(a)   returns the AI message string (a = answers so far)
//   options     [{ label, value }] for select / multiselect
//   optional    true to allow skipping (textarea)
//   cta         button label for statement steps
//   when(a)     optional predicate; step is skipped when it returns false
//   validate(v, a)  returns null or an error string
import { greeting, firstName } from './messages.js';
import {
  validateName,
  validateDOB,
  validateSAID,
  validatePassport,
  validatePhone,
  validateEmail,
  validatePostal,
  required,
} from './validators.js';

// Titles for the 11 registration sections (progress: "Step X of 11").
export const SECTION_TITLES = [
  'Welcome',
  'Personal Information',
  'Health Screening (PAR-Q)',
  'Fitness Goals',
  'Membership Plan',
  'Add-On Services',
  'Medical Aid',
  'Summary',
  'Agreement',
  'Payment',
  'Confirmation',
];
export const TOTAL_SECTIONS = SECTION_TITLES.length;

export const FLOW = [
  // ---- SECTION 1 — WELCOME -------------------------------------------------
  {
    id: 'welcome',
    section: 1,
    type: 'statement',
    cta: "Let's Begin",
    prompt: () =>
      `${greeting()}! 👋 Welcome — you’re making a fantastic decision for your health and fitness today.\n\n` +
      `I’ll guide you through a quick, secure registration. It takes about 5–7 minutes, and I’ll ask just one thing at a time.\n\n` +
      `Your information is private and protected (POPIA compliant). Ready? Let’s do this! 💪`,
  },

  // ---- SECTION 2 — PERSONAL INFORMATION ------------------------------------
  {
    id: 'full_name',
    section: 2,
    type: 'text',
    field: 'full_name',
    prompt: () => `First things first — what’s your full name? (First and last name)`,
    validate: (v) => validateName(v),
  },
  {
    id: 'date_of_birth',
    section: 2,
    type: 'date',
    field: 'date_of_birth',
    prompt: (a) => `Great to meet you${firstName(a)}! What’s your date of birth?`,
    validate: (v) => validateDOB(v),
  },
  {
    id: 'gender',
    section: 2,
    type: 'select',
    field: 'gender',
    prompt: () => `How do you identify?`,
    options: [
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' },
      { label: 'Prefer not to say', value: 'prefer_not_to_say' },
    ],
  },
  {
    id: 'id_type',
    section: 2,
    type: 'select',
    field: 'id_type',
    prompt: () =>
      `For identity verification (a standard requirement at SA gyms), will you use your South African ID or a passport?`,
    options: [
      { label: 'South African ID', value: 'sa_id' },
      { label: 'Passport', value: 'passport' },
    ],
  },
  {
    id: 'id_number',
    section: 2,
    type: 'text',
    field: 'id_number',
    when: (a) => a.id_type === 'sa_id',
    prompt: () => `Please enter your 13-digit South African ID number.`,
    validate: (v) => validateSAID(v),
  },
  {
    id: 'passport_number',
    section: 2,
    type: 'text',
    field: 'passport_number',
    when: (a) => a.id_type === 'passport',
    prompt: () => `Please enter your passport number.`,
    validate: (v) => validatePassport(v),
  },
  {
    id: 'phone',
    section: 2,
    type: 'tel',
    field: 'phone',
    prompt: () => `What’s the best phone number to reach you? Include your country code (e.g. +27 82 123 4567).`,
    validate: (v) => validatePhone(v),
  },
  {
    id: 'email',
    section: 2,
    type: 'email',
    field: 'email',
    prompt: () => `And your email address? We’ll send your membership card and receipts here.`,
    validate: (v) => validateEmail(v),
  },
  {
    id: 'address_street',
    section: 2,
    type: 'text',
    field: 'address_street',
    prompt: () => `Almost there with the basics. What’s your street address?`,
    validate: (v) => required(v, 'Street address'),
  },
  {
    id: 'address_suburb',
    section: 2,
    type: 'text',
    field: 'address_suburb',
    prompt: () => `Which suburb?`,
    validate: (v) => required(v, 'Suburb'),
  },
  {
    id: 'address_city',
    section: 2,
    type: 'text',
    field: 'address_city',
    prompt: () => `And the city/town?`,
    validate: (v) => required(v, 'City'),
  },
  {
    id: 'address_postal_code',
    section: 2,
    type: 'text',
    field: 'address_postal_code',
    prompt: () => `Last bit of your address — your 4-digit postal code.`,
    validate: (v) => validatePostal(v),
  },
  {
    id: 'emergency_name',
    section: 2,
    type: 'text',
    field: 'emergency_name',
    prompt: () =>
      `For your safety, we keep an emergency contact on file. Who should we contact in an emergency? (Full name)`,
    validate: (v) => validateName(v),
  },
  {
    id: 'emergency_phone',
    section: 2,
    type: 'tel',
    field: 'emergency_phone',
    prompt: (a) => `And ${a.emergency_name ? a.emergency_name.split(/\s+/)[0] + '’s' : 'their'} phone number?`,
    validate: (v) => validatePhone(v),
  },

  // ---- SECTION 3 — PAR-Q HEALTH SCREENING ----------------------------------
  // Mandatory in the SA fitness industry. 7 YES/NO questions, exact wording
  // from CLAUDE.md. Field keys match the parq_responses table columns so the
  // STEP 11 save maps 1:1. Any YES => MEDICAL CLEARANCE REQUIRED flag.
  {
    id: 'parq_intro',
    section: 3,
    type: 'statement',
    cta: 'Start Health Check',
    prompt: (a) =>
      `Now a quick, important health check${firstName(a)} — the Physical Activity Readiness Questionnaire (PAR-Q). ` +
      `It’s a standard safety step at South African gyms.\n\n` +
      `Just answer YES or NO to 7 short questions. It only takes a minute. 🩺`,
  },
  {
    id: 'q1_heart_condition',
    section: 3,
    type: 'yesno',
    field: 'q1_heart_condition',
    prompt: () =>
      `1 of 7 — Has your doctor ever said that you have a heart condition and that you should only do physical activity recommended by a doctor?`,
  },
  {
    id: 'q2_chest_pain_activity',
    section: 3,
    type: 'yesno',
    field: 'q2_chest_pain_activity',
    prompt: () => `2 of 7 — Do you feel pain in your chest when you do physical activity?`,
  },
  {
    id: 'q3_chest_pain_rest',
    section: 3,
    type: 'yesno',
    field: 'q3_chest_pain_rest',
    prompt: () =>
      `3 of 7 — In the past month, have you had chest pain when you were NOT doing physical activity?`,
  },
  {
    id: 'q4_dizziness_balance',
    section: 3,
    type: 'yesno',
    field: 'q4_dizziness_balance',
    prompt: () =>
      `4 of 7 — Do you lose your balance because of dizziness, or do you ever lose consciousness?`,
  },
  {
    id: 'q5_bone_joint_problem',
    section: 3,
    type: 'yesno',
    field: 'q5_bone_joint_problem',
    prompt: () =>
      `5 of 7 — Do you have a bone or joint problem that could be made worse by a change in your physical activity?`,
  },
  {
    id: 'q6_bp_heart_meds',
    section: 3,
    type: 'yesno',
    field: 'q6_bp_heart_meds',
    prompt: () =>
      `6 of 7 — Is your doctor currently prescribing drugs (for example, water pills) for your blood pressure or heart condition?`,
  },
  {
    id: 'q7_other_reason',
    section: 3,
    type: 'yesno',
    field: 'q7_other_reason',
    prompt: () => `7 of 7 — Do you know of any other reason why you should not do physical activity?`,
  },
  {
    id: 'parq_result',
    section: 3,
    type: 'statement',
    cta: 'Continue',
    prompt: (a) =>
      parqAnyYes(a)
        ? `Thank you for being honest${firstName(a)} — that matters for your safety. 🙏\n\n` +
          `Because you answered YES to at least one question, we recommend you speak with your doctor before starting or significantly changing your physical activity.\n\n` +
          `You can still complete your registration today. Your profile will be marked “Medical Clearance Required”, and our team will ask for a doctor’s clearance note before your first session. You’re welcome to bring or send it to reception at any time.`
        : `Excellent${firstName(a)} — you answered NO to all 7 questions. You’re cleared to get started! 💪\n\n` +
          `Let’s build your perfect membership. Onwards!`,
  },

  // ---- SECTION 4 — FITNESS GOALS & EXPERIENCE ------------------------------
  {
    id: 'fitness_goals',
    section: 4,
    type: 'multiselect',
    field: 'fitness_goals',
    min: 1,
    prompt: (a) =>
      `Let’s personalise your journey${firstName(a)}! What are your main fitness goals? (Pick one or more)`,
    options: [
      { label: 'Weight Loss / Fat Burning', value: 'weight_loss' },
      { label: 'Muscle Building / Strength', value: 'muscle_building' },
      { label: 'Improve Fitness / Cardio', value: 'fitness_cardio' },
      { label: 'Stress Relief / Mental Health', value: 'stress_relief' },
      { label: 'Sports Performance', value: 'sports_performance' },
      { label: 'Rehabilitation / Injury Recovery', value: 'rehab' },
      { label: 'General Health & Wellness', value: 'general_health' },
      { label: 'Body Toning & Definition', value: 'toning' },
    ],
    validate: (v) => (Array.isArray(v) && v.length ? null : 'Please choose at least one goal.'),
  },
  {
    id: 'experience_level',
    section: 4,
    type: 'select',
    field: 'experience_level',
    prompt: () => `What’s your training experience level?`,
    options: [
      { label: 'Complete Beginner (never trained)', value: 'complete_beginner' },
      { label: 'Beginner (trained occasionally)', value: 'beginner' },
      { label: 'Intermediate (1–2 years)', value: 'intermediate' },
      { label: 'Advanced (3+ years)', value: 'advanced' },
      { label: 'Athlete / Professional', value: 'athlete' },
    ],
  },
  {
    id: 'training_frequency',
    section: 4,
    type: 'select',
    field: 'training_frequency',
    prompt: () => `How often do you plan to train each week?`,
    options: [
      { label: '1–2 times per week', value: '1_2' },
      { label: '3–4 times per week', value: '3_4' },
      { label: '5–6 times per week', value: '5_6' },
      { label: 'Every day', value: 'daily' },
    ],
  },
  {
    id: 'preferred_time',
    section: 4,
    type: 'select',
    field: 'preferred_time',
    prompt: () => `When do you prefer to train?`,
    options: [
      { label: 'Early Morning (5AM–8AM)', value: 'early_morning' },
      { label: 'Morning (8AM–12PM)', value: 'morning' },
      { label: 'Afternoon (12PM–5PM)', value: 'afternoon' },
      { label: 'Evening (5PM–9PM)', value: 'evening' },
      { label: 'Flexible / No preference', value: 'flexible' },
    ],
  },
  {
    id: 'injuries_notes',
    section: 4,
    type: 'textarea',
    field: 'injuries_notes',
    optional: true,
    placeholder: 'e.g. previous knee surgery, lower-back sensitivity…',
    prompt: () =>
      `Any injuries or physical limitations we should know about? This helps our trainers keep you safe. ` +
      `(Optional — tap Skip if none.)`,
  },

  // ---- SECTION 5 — MEMBERSHIP PLAN -----------------------------------------
  // Rich selector control; prices are fetched from Supabase (gym.plans) via
  // /api/catalog. Never hardcoded in the frontend.
  {
    id: 'membership',
    section: 5,
    type: 'membership',
    field: 'membership',
    prompt: (a) => `Time to choose your membership${firstName(a)}! Pick the option that fits you best. 🏋️`,
    validate: (v) => (v && v.plan_id ? null : 'Please choose a membership option.'),
  },

  // ---- SECTION 6 — ADD-ON SERVICES -----------------------------------------
  {
    id: 'addons',
    section: 6,
    type: 'addons',
    field: 'addons',
    prompt: () =>
      `Want to add anything extra? These are optional — tap “No thanks” to skip them entirely.`,
  },

  // ---- SECTION 7 — MEDICAL AID ---------------------------------------------
  {
    id: 'has_medical_aid',
    section: 7,
    type: 'yesno',
    field: 'has_medical_aid',
    prompt: () =>
      `Do you have a medical aid? Some providers (like Discovery Vitality) offer gym discounts or cashbacks — well worth checking! 💳`,
  },
  {
    id: 'medical_aid_provider',
    section: 7,
    type: 'select',
    field: 'medical_aid_provider',
    when: (a) => a.has_medical_aid === true,
    prompt: () => `Great! Which medical aid provider?`,
    options: [
      { label: 'Discovery Vitality', value: 'discovery_vitality' },
      { label: 'Momentum Multiply', value: 'momentum_multiply' },
      { label: 'Bonitas', value: 'bonitas' },
      { label: 'GEMS', value: 'gems' },
      { label: 'Bankmed', value: 'bankmed' },
      { label: 'Sanlam', value: 'sanlam' },
      { label: 'Liberty', value: 'liberty' },
      { label: 'PPS', value: 'pps' },
      { label: 'Universal 360', value: 'universal_360' },
      { label: 'Other', value: 'other' },
    ],
  },

  // ---- SECTION 8 — SUMMARY -------------------------------------------------
  {
    id: 'summary',
    section: 8,
    type: 'summary',
    prompt: (a) => `Here’s your full summary${firstName(a)} — please review before we finalise.`,
  },

  // ---- SECTION 9 — INDEMNITY & MEMBERSHIP CONTRACT -------------------------
  {
    id: 'agreement',
    section: 9,
    type: 'agreement',
    field: 'agreement',
    prompt: () =>
      `Final step — the legal bit. Please read and accept the indemnity waiver and membership contract, then sign with your name.`,
    validate: (v) =>
      v && v.indemnity_accepted && v.contract_accepted && v.signature
        ? null
        : 'Please accept both agreements and type your full name to sign.',
  },

  // Section 10 (Payment) is built in Phase 3. Section 11 (Confirmation) is the
  // success screen shown after the STEP 11 save.
];

export const PARQ_KEYS = [
  'q1_heart_condition',
  'q2_chest_pain_activity',
  'q3_chest_pain_rest',
  'q4_dizziness_balance',
  'q5_bone_joint_problem',
  'q6_bp_heart_meds',
  'q7_other_reason',
];

/** True if the member answered YES to any PAR-Q question (=> medical clearance). */
export function parqAnyYes(answers = {}) {
  return PARQ_KEYS.some((k) => answers[k] === true);
}
