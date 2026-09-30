// Platform screens — server-rendered HTML.
//
// No build step, no second Vite config, no React. This is an internal panel for
// one or two people, and the pattern is the one already proven next door in
// Telga, whose app is a shell around server-rendered screens.
//
//   >>> EVERY VALUE THAT CAME FROM A HUMAN GOES THROUGH escapeHtml. <<<
//
// These pages display text a stranger typed — gym names, document filenames,
// rejection reasons. Escaping is the entire security story for this file, which
// is why the tests are mostly about that rather than about layout. Staff input
// is escaped too: a reviewer is still a person typing into a box.
//
// Styling is deliberately inline and minimal. It cannot import the gym app's
// components (D-081 forbids cross-imports), and duplicating a design system for
// an internal panel would be work with no return.

import { when, exact, until, money as fmtMoney } from './format.js';
import { pageLink } from './paging.js';
import { gymAdminPath, OWNER_USERNAME } from './gym-admin.js';
import { BRAND, LOGO_ON_DARK } from '../shared/brand.js';
import { REQUIRED_DOCUMENTS, DOCUMENT_LABELS, missingRequiredDocuments, MAX_DOCUMENT_BYTES } from './documents.js';
import { INVITE_TTL_HOURS } from './team.js';
import { SERVICE_INFO, SERVICE_GROUPS, ALL_SERVICES, CORE_FEATURES, effectiveFeatures } from '../shared/features.js';
import { planByKey, EVERY_PLAN_INCLUDES, PLAN_PROMISES, promisesOf, trialDaysOf } from './plans.js';
import { COUNTRIES, countryName } from '../shared/countries.js';
import { closeBy } from './owner-closure.js';
import { planStanding, planFee, planWords, cardText } from '../shared/yoyo-plan.js';

/** Escape text for safe interpolation into markup or an attribute. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shorthand used throughout: `h` is "escaped". */
const h = escapeHtml;

/**
 * A plan as a person names it — "Prime", never the key "prime" (design
 * critique 2026-09-29). The live plans' own labels when a page has them, the
 * built-in label otherwise, and the key only for a plan nobody knows.
 * Returns plain text: escape it where it is drawn.
 */
export function planName(key, plans = null) {
  if (!key) return '';
  const live = Array.isArray(plans) ? plans.find((p) => p && p.key === key) : null;
  return live?.label || live?.name || planByKey(key)?.label || String(key);
}

// The Yoyo Gyms brand on every page of the website (CLAUDE.md §37): near-black,
// white type, electric lime — the same in light and dark system themes, like
// the app. Values from shared/brand.js.
const STYLE = `
  :root { color-scheme: dark; --ink:#F2F5F3; --muted:rgba(255,255,255,.62); --line:rgba(255,255,255,.12);
          --accent:${BRAND.lime}; --accent-ink:${BRAND.limeInk}; --bg:${BRAND.ground}; --card:${BRAND.surface};
          --bad:#ff6b5e; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { border-bottom:1px solid var(--line); padding:12px 20px; display:flex;
           justify-content:space-between; align-items:center; gap:16px; background:var(--card); }
  header .brand { display:inline-flex; align-items:center; }
  header .brand img { display:block; height:48px; width:auto; }
  header nav a { color:var(--ink); text-decoration:none; font-weight:600; }
  header nav a:hover { color:var(--accent); }
  main { max-width:900px; margin:0 auto; padding:24px 20px 64px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .muted { color:var(--muted); font-size:13px; }
  table { width:100%; border-collapse:collapse; margin-top:16px; }
  th, td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--line); }
  th { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  /* Figures line up in a column: right-aligned, equal-width digits (design
     critique 2026-09-29). */
  th.num, td.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  a { color:var(--accent); }
  .empty { border:1px dashed var(--line); border-radius:8px; padding:40px 20px;
           text-align:center; color:var(--muted); margin-top:16px; }
  .tag { font-size:12px; padding:2px 8px; border:1px solid var(--line); border-radius:99px; }
  form.card { border:1px solid var(--line); border-radius:8px; padding:20px; max-width:360px;
              margin:64px auto; display:grid; gap:12px; }
  label { font-size:13px; color:var(--muted); display:grid; gap:4px; }
  input, textarea, select { font:inherit; min-height:44px; padding:10px 12px; border:1px solid var(--line);
                    border-radius:6px; background:var(--bg); color:inherit; width:100%; }
  input:focus, textarea:focus, select:focus { outline:2px solid var(--accent); outline-offset:1px; }
  /* Inside the store app, no price of the Yoyo subscription is shown
     (router.js marks the page; CLAUDE.md §46.1 Q4). */
  [data-store-app] .store-hide { display:none !important; }
  /* Keyboard focus on every control, in the brand's lime — the browser's own
     ring was the only one links, buttons and disclosures had. */
  a:focus-visible, button:focus-visible, summary:focus-visible, label:focus-visible, .btn:focus-visible {
    outline:2px solid var(--accent); outline-offset:2px; border-radius:8px; }
  main:focus { outline:none; }
  /* Skip past the menu: first thing a keyboard reaches on every page. */
  .skip { position:absolute; left:12px; top:-60px; z-index:50; background:var(--accent); color:var(--accent-ink);
          font-weight:800; padding:10px 16px; border-radius:99px; text-decoration:none; }
  .skip:focus { top:12px; }
  /* A second, explicit click before switching anyone off (CLAUDE.md §45 critique). */
  details.confirm { display:inline-block; }
  details.confirm > summary { list-style:none; cursor:pointer; display:inline-flex; align-items:center; min-height:44px;
                              padding:0 16px; border-radius:99px; font-weight:700; border:1px solid rgba(255,107,94,.55);
                              color:var(--bad); }
  details.confirm > summary::-webkit-details-marker { display:none; }
  details.confirm[open] > summary { background:rgba(255,107,94,.1); }
  details.confirm form { margin:10px 0 0; max-width:min(340px,100%); white-space:normal; }
  details.confirm p { margin:0 0 10px; font-size:14px; color:var(--ink); }
  /* Every control at least 44 px tall — a comfortable target for a finger, and
     big enough to read at a glance (CLAUDE.md §41). */
  button { font:inherit; font-size:15px; font-weight:700; min-height:44px; padding:10px 20px; border:0; border-radius:99px;
           background:var(--accent); color:var(--accent-ink); cursor:pointer; }
  .err { color:var(--bad); font-size:13px; }
  /* The parts of the page nobody draws still wear the brand. */
  ::selection { background:rgba(191,246,66,.32); color:#fff; }
  input, textarea { caret-color:var(--accent); }

  /* ONE TYPE SCALE for every page outside the main admin panel — the app's
     own (.y-title 28/1.15, h2 20, body 16, small 13). The owner, terms and
     "sent" pages read 15/17/20px, too close to tell apart (design critique
     2026-09-29). :where() keeps it a default a page's own class can refine. */
  body:not(.panel) { font-size:16px; line-height:1.55; }
  :where(body:not(.panel)) main { max-width:720px; }
  :where(body:not(.panel)) h1 { font-size:28px; line-height:1.15; letter-spacing:-.01em; margin:0 0 10px; text-wrap:balance; }
  :where(body:not(.panel)) h2, :where(body:not(.panel)) .card h2 { font-size:20px; line-height:1.25; margin:0 0 10px; }
  :where(body:not(.panel)) main > h2 { margin:36px 0 12px; }
  :where(body:not(.panel)) label { font-weight:700; }
  :where(body:not(.panel)) label :is(.muted, small) { display:block; font-weight:400; }
  /* A field inherits its label's small type unless told otherwise, and a
     phone zooms into any field under 16px. */
  :where(body:not(.panel)) :is(input, textarea, select) { font-size:16px; font-weight:400; }
  :where(body:not(.panel)) button, :where(body:not(.panel)) .btn { font-size:16px; }
  :where(body:not(.panel)) :is(p, li) { max-width:70ch; }
  /* A tick box and its sentence side by side, the whole row a target. */
  label.agree { display:flex; gap:12px; align-items:flex-start; font-size:16px; font-weight:400; color:var(--ink);
                cursor:pointer; border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  label.agree input { width:22px; height:22px; margin-top:1px; flex:none; }
  /* How to put a problem right: set apart by tone, never a card in a card. */
  .fix { background:rgba(245,196,81,.08); border:1px solid rgba(245,196,81,.3); border-radius:12px; padding:14px 16px; margin:14px 0; }
  .fix p { margin:4px 0 0; }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  ul.events { list-style:none; padding:0; margin:12px 0 0; }
  ul.events li { border-left:2px solid var(--line); padding:6px 0 6px 12px; margin-bottom:6px; }

  /* The sign-in page (CLAUDE.md §36, §36.1 Q8): the Yoyo Gyms brand — near-
     black, white type, electric lime — in both colour schemes. */
  body.auth { --ink:#fff; --muted:rgba(255,255,255,.62); --line:rgba(255,255,255,.12);
              --bg:#070c10; --accent:#bff642; min-height:100vh; display:grid; place-items:center; }
  body.auth main { width:100%; max-width:440px; padding:48px 24px; }
  body.auth a { color:#fff; }
  .auth-logo { display:block; width:144px; height:auto; margin:0 auto 32px; }
  body.auth form.card { max-width:none; margin:0; padding:32px 24px; gap:16px;
                        background:#10181d; border-radius:24px; }
  body.auth h1 { font-size:28px; line-height:1.15; text-align:center; margin:0; }
  body.auth .auth-sub { text-align:center; margin:0 0 8px; }
  body.auth input { padding:14px 16px; border-radius:14px; font-size:16px; background:#070c10; }
  body.auth input:focus { outline:2px solid #bff642; outline-offset:1px; }
  body.auth button { min-height:52px; border-radius:26px; color:#0b1400; font-weight:800; font-size:16px; }
  body.auth .err { color:#ff6b5e; }
  body.auth .auth-links { text-align:center; margin:0; }
  body.auth .auth-foot { text-align:center; margin:24px 0 0; }

  /* Every page's cards and status labels. */
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px 22px; margin:16px 0; }
  .card > :first-child { margin-top:0; } .card > :last-child { margin-bottom:0; }
  .tag { display:inline-block; font-size:12px; font-weight:700; padding:3px 10px; border-radius:99px;
         border:1px solid var(--line); color:var(--muted); white-space:nowrap; }
  .tag::first-letter { text-transform:uppercase; }
  .tag--good { color:#8ee07a; background:rgba(142,224,122,.1); border-color:rgba(142,224,122,.3); }
  .tag--warn { color:#f5c451; background:rgba(245,196,81,.1); border-color:rgba(245,196,81,.3); }
  .tag--bad  { color:#ff8a7e; background:rgba(255,107,94,.1); border-color:rgba(255,107,94,.32); }
  .tag--info { color:#7cc4ff; background:rgba(124,196,255,.1); border-color:rgba(124,196,255,.3); }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:15px; font-weight:700;
         min-height:44px; padding:10px 20px; border-radius:99px; background:var(--accent); color:var(--accent-ink);
         text-decoration:none; }
  .btn.ghost, button.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
  button.danger { background:var(--bad); color:#1a0503; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .lede { color:var(--muted); margin:0 0 8px; }
  .card h2 { font-size:17px; margin:0 0 10px; }
  .svc-block { border-top:1px solid var(--line); padding-top:14px; margin-top:4px; }
  .svc-title { font-weight:800; margin:0 0 4px; }
  .svc-h { font-size:12px; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); margin:14px 0 8px; font-weight:700; }
  .svc-core { margin:0; }
  .svc-grid { display:grid; gap:8px; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); }
  label.svc { display:flex; gap:10px; align-items:flex-start; color:var(--ink); font-size:14px; border:1px solid var(--line);
              border-radius:12px; padding:10px 12px; cursor:pointer; min-height:48px; }
  label.svc:has(input:checked) { border-color:rgba(191,246,66,.5); background:rgba(191,246,66,.05); }
  label.svc input { width:20px; height:20px; margin-top:1px; flex:none; }
  label.svc small { display:block; color:var(--muted); font-size:12px; }
  input[type=checkbox], input[type=radio] { width:auto; min-height:0; accent-color:var(--accent); }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 600px) { .two { grid-template-columns:1fr; } }
  /* A row of fields and buttons stays a row; a field in it does not take the
     whole width and push its button onto the next line. */
  .row > input, .row > select { width:auto; flex:1 1 160px; }
  .row > input[type=checkbox], .row > input[type=radio] { flex:none; }
  body.panel form.card.row { display:flex; flex-wrap:wrap; align-items:flex-end; }
  body.panel form.card.row > label { flex:1 1 220px; }
  /* The search field is the widest thing in its row, and on a phone it takes
     the whole row (an inline flex:1 once squeezed it to a sliver). */
  body.panel form.card.row > label.grow { flex:3 1 260px; }
  body.panel form.card > button, body.panel form.card > .row { justify-self:start; }

  /* THE MAIN ADMIN PANEL (CLAUDE.md §40.1 F-40.6): a sidebar grouped by job,
     showing only what this person may open; a phone gets the same menu behind
     one button, with no script. */
  body.panel { display:grid; grid-template-columns:252px minmax(0,1fr); min-height:100vh; }
  .side { position:sticky; top:0; height:100vh; overflow-y:auto; overflow-x:hidden; background:#0a1115;
          border-right:1px solid var(--line); padding:18px 12px; display:flex; flex-direction:column; }
  .side .brand { display:block; width:max-content; padding:4px 10px 8px; }
  /* The logo without its tagline (design critique 2026-09-29): "LIFT · TRAIN ·
     TRANSFORM" is 3 px tall at sidebar size, so the picture is cropped just
     under the wordmark. At 87 x 60 the 720 x 531 file shows rows 0-496; the
     wordmark ends at 488 and the tagline starts at 510. */
  .side .brand img { display:block; width:87px; height:60px; object-fit:cover; object-position:50% 0; }
  /* The phone menu's switch. On a computer it is display:none, so it is not
     an invisible stop in the keyboard order. */
  .navt { display:none; }
  .navt-label { display:none; }
  .side nav { display:flex; flex-direction:column; gap:2px; }
  .side .grp { font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
               color:rgba(255,255,255,.38); margin:18px 12px 6px; }
  .side nav a { display:flex; align-items:center; gap:10px; min-height:44px; padding:9px 12px; border-radius:10px;
                color:rgba(255,255,255,.74); text-decoration:none; font-weight:600; font-size:14px; }
  .side nav a svg { width:18px; height:18px; flex:none; }
  .side nav a:hover { background:rgba(255,255,255,.05); color:#fff; }
  .side nav a.on { background:rgba(191,246,66,.12); color:var(--accent); }
  .side .me { margin-top:auto; border-top:1px solid var(--line); padding:14px 12px 4px; display:flex;
              flex-direction:column; gap:10px; font-size:13px; }
  .side .me .who { color:var(--muted); word-break:break-all; }
  .side .me a { display:flex; align-items:center; gap:8px; color:#fff; text-decoration:none; font-weight:600; }
  .side .me a svg { width:16px; height:16px; }
  body.panel main { max-width:1200px; margin:0; padding:32px 40px 80px; min-width:0; }
  body.panel h1 { font-size:26px; letter-spacing:-.01em; margin:0 0 6px; }
  body.panel h2 { font-size:15px; margin:0 0 10px; }
  body.panel main > h2 { font-size:12px; text-transform:uppercase; letter-spacing:.14em; color:var(--muted); margin:32px 0 10px; }
  body.panel form.card { max-width:none; margin:16px 0; }
  body.panel table { background:var(--card); border:1px solid var(--line); border-radius:16px;
                     border-collapse:separate; border-spacing:0; overflow:hidden; }
  body.panel .card table { background:transparent; border:0; border-radius:0; margin-top:4px; }
  body.panel th { background:rgba(255,255,255,.03); }
  body.panel tbody tr:hover td { background:rgba(255,255,255,.025); }
  body.panel tbody tr:last-child td { border-bottom:0; }
  /* A wide list scrolls inside its own box on a tablet, never the page. */
  .tscroll { overflow-x:auto; margin-top:16px; }
  .tscroll > table { margin-top:0; }
  .card .tscroll { margin-top:4px; }
  .tscroll th { white-space:nowrap; }
  body.panel .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  /* One lime fill per page, for the one thing to do next; every other action
     is outlined (design critique 2026-09-29: lime was on every button). */
  body.panel .btn.ghost:hover, body.panel button.ghost:hover { border-color:rgba(255,255,255,.32); }
  /* A card whose colour says what it is — never a thick stripe down one side. */
  body.panel .card.tone-bad { border-color:rgba(255,107,94,.45); }
  body.panel .card.tone-warn { border-color:rgba(245,196,81,.45); }
  body.panel .card.tone-good { border-color:rgba(142,224,122,.4); }
  /* The application states as one row of tabs: the current one tinted like the
     menu's current page, not a lime button beside four grey ones. */
  .tabs { display:flex; flex-wrap:wrap; gap:6px; margin:18px 0 4px; }
  .tabs a { display:inline-flex; align-items:center; gap:8px; min-height:44px; padding:0 16px; border-radius:99px;
            border:1px solid var(--line); color:var(--ink); text-decoration:none; font-weight:700; font-size:14px; }
  .tabs a:hover { border-color:rgba(255,255,255,.32); }
  .tabs a[aria-current] { background:rgba(191,246,66,.12); border-color:rgba(191,246,66,.45); color:var(--accent); }
  .tabs .n { color:var(--muted); font-weight:600; font-variant-numeric:tabular-nums; }
  .tabs a[aria-current] .n { color:inherit; }
  /* The figures on Today and on a gym: a grid that never leaves one tile alone
     on a row (design critique 2026-09-29: Today wrapped 5+1). It sizes by the
     room it is given, not by the window, because the sidebar comes and goes. */
  .kpi-wrap { container-type:inline-size; margin:12px 0 20px; }
  .kpis { display:grid; grid-template-columns:minmax(0,1fr); gap:12px; margin:0; }
  .kpis.n1 { max-width:320px; }
  @container (min-width: 340px) { .kpis.n2, .kpis.n4 { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @container (min-width: 600px) { .kpis.n3 { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @container (min-width: 760px) { .kpis.n4 { grid-template-columns:repeat(4,minmax(0,1fr)); } }
  .kpi { display:block; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 18px;
         color:inherit; text-decoration:none; }
  a.kpi:hover { border-color:rgba(191,246,66,.45); }
  .kpi .lbl { font-size:12px; font-weight:600; color:var(--muted); }
  .kpi .val { font-size:24px; font-weight:800; letter-spacing:-.02em; margin-top:6px; font-variant-numeric:tabular-nums;
              overflow-wrap:anywhere; }
  .kpi .sub { font-size:12px; color:var(--muted); margin-top:2px; }
  /* What needs a person comes first on Today and weighs more than the totals
     under it (design critique 2026-09-29): a real heading, larger rows, and a
     border in the colour of the most urgent item. */
  .decide { margin:20px 0 28px; }
  .decide > h2 { font-size:19px; margin:0 0 10px; }
  .decide > .card { padding:0; overflow:hidden; margin:0; }
  .todo { display:flex; align-items:center; gap:14px; min-height:60px; padding:12px 20px; border-top:1px solid var(--line);
          color:inherit; text-decoration:none; font-size:16px; font-weight:600; }
  .todo:first-child { border-top:0; }
  a.todo:hover { background:rgba(255,255,255,.03); }
  .todo .what { flex:1 1 auto; min-width:0; }
  .todo small { display:block; margin-top:2px; font-size:13px; font-weight:500; color:var(--muted); }
  .todo .dot { width:12px; height:12px; border-radius:50%; flex:none; background:#f5c451; }
  .todo .dot.bad { background:var(--bad); }
  .todo .go { margin-left:auto; flex:none; display:inline-flex; align-items:center; min-height:36px; padding:0 14px;
              border:1px solid var(--line); border-radius:99px; color:var(--accent); font-size:14px; font-weight:700; white-space:nowrap; }
  a.todo:hover .go { border-color:rgba(191,246,66,.45); }
  .checklist { list-style:none; padding:0; margin:8px 0 0; display:grid; gap:6px; }
  .checklist li::before { content:'○'; margin-right:8px; color:var(--muted); }
  .checklist li.ok::before { content:'●'; color:#8ee07a; }
  dl.facts { display:grid; grid-template-columns:minmax(120px,max-content) 1fr; gap:8px 18px; margin:0; }
  dl.facts dt { color:var(--muted); font-size:13px; }
  dl.facts dd { margin:0; overflow-wrap:break-word; min-width:0; }
  /* A phone stacks the label above the value, so a long email keeps its whole
     line instead of breaking mid-word ("sam@example.c om"). */
  @media (max-width: 520px) {
    dl.facts { grid-template-columns:1fr; gap:2px 0; }
    dl.facts dd { margin-bottom:10px; }
  }
  .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }
  .grid2 > .card { margin:0; }

  /* An owner's own pages: the owner's menu, never the staff one (F-40.2). */
  header nav.row a.on { color:var(--accent); }

  @media (max-width: 900px) {
    body.panel { display:block; }
    .side { position:sticky; top:0; z-index:5; height:auto; flex-direction:row; flex-wrap:wrap; align-items:center;
            padding:10px 16px; }
    .side .brand { padding:0; }
    .side .brand img { width:49px; height:34px; }
    .navt { display:block; position:absolute; opacity:0; width:1px; height:1px; pointer-events:none; }
    .navt-label { display:inline-flex; margin-left:auto; border:1px solid var(--line); border-radius:99px;
                  padding:7px 14px; font-weight:700; cursor:pointer; }
    .side nav, .side .me { display:none; width:100%; }
    .navt:checked ~ nav, .navt:checked ~ .me { display:flex; }
    .navt:focus-visible + .navt-label { outline:2px solid var(--accent); }
    body.panel main { padding:20px 16px 64px; }
    header { flex-wrap:wrap; }
  }

  /* A PHONE READS A LIST AS CARDS (design critique 2026-09-29): a table that
     scrolled sideways hid its last columns — and the switch-off button with
     them. Each value carries its column's name from data-label; the header
     row is hidden from sight only, and the roles written into the markup keep
     it a table for a screen reader whatever the display. A computer keeps the
     real table. */
  @media (max-width: 640px) {
    body.panel table.list, body.panel table.list tbody, body.panel table.list tr { display:block; }
    body.panel table.list { background:none; border:0; border-radius:0; overflow:visible; }
    body.panel table.list thead { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
    body.panel table.list tr { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:4px 16px; margin:0 0 12px; }
    body.panel table.list td { display:block; position:relative; min-height:44px; padding:11px 0 11px 40%;
                               text-align:left; white-space:normal; overflow-wrap:anywhere; }
    body.panel table.list td::before { content:attr(data-label); position:absolute; left:0; top:11px; width:36%;
                                       color:var(--muted); font-size:12px; font-weight:600; line-height:1.6; }
    /* The first cell names the card; an action cell takes the whole width. */
    body.panel table.list td:first-child, body.panel table.list td.act { padding-left:0; min-height:0; }
    body.panel table.list td:first-child::before, body.panel table.list td.act::before { content:none; }
    body.panel table.list td:first-child { font-size:16px; }
    body.panel table.list tbody tr:last-child td { border-bottom:1px solid var(--line); }
    body.panel table.list tbody tr td:last-child { border-bottom:0; }
    body.panel table.list tbody tr:hover td { background:none; }
    /* Inside a card, rows are divided by lines, never cards within a card. */
    body.panel .card table.list tr { background:none; border:0; border-bottom:1px solid var(--line); border-radius:0;
                                     padding:4px 0; margin:0; }
    body.panel .card table.list tbody tr:last-child { border-bottom:0; }
    /* The switch-off confirmation opens across the card, inside the screen. */
    details.confirm, details.confirm[open] { display:block; }
    details.confirm form { max-width:none; }
    .todo { flex-wrap:wrap; padding:12px 16px; }
    .todo .go { margin-left:26px; }
  }
`;

// Line icons for the sidebar, 24-unit grid, drawn in the text colour.
const ICON_PATHS = {
  today: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  applications: 'M9 3h6v3H9zM8 4.5H5.5v16h13v-16H16M8.5 11h7M8.5 15h5',
  gyms: 'M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 11h.01M15 11h.01',
  owners: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  plans: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  finance: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01',
  security: 'M12 3l8 3v6c0 5-3.5 8.5-8 9.5C7.5 20.5 4 17 4 12V6zM9 12l2 2 4-4',
  audit: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  team: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M22 11h-6',
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  signout: 'M15 12H3M7 8l-4 4 4 4M13 4h6v16h-6',
};

function icon(name) {
  const d = ICON_PATHS[name];
  return d
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`
    : '';
}

/**
 * The staff menu, grouped by job. Each entry names the permission that opens
 * it, and a person sees only what they may open — a link that answers
 * "forbidden" is a dead button (CLAUDE.md §40.1 F-40.2). The routes check the
 * same permissions again; hiding a link is tidiness, not security.
 */
const STAFF_NAV = [
  ['Overview', [['home', '/platform/home', 'Today', null]]],
  ['Onboarding', [['applications', '/platform/applications', 'Applications', 'application.view']]],
  ['Gyms', [
    ['registry', '/platform/registry', 'Gyms', 'gym.view'],
    ['owners', '/platform/owners', 'Owners', 'platform.manage'],
  ]],
  ['Money', [
    ['plans', '/platform/plans', 'Plans and prices', 'subscription.manage'],
    ['finance', '/platform/finance', 'Finances', 'subscription.manage'],
  ]],
  ['Trust', [
    ['security', '/platform/security', 'Security', 'audit.view'],
    ['audit', '/platform/audit', 'Audit log', 'audit.view'],
  ]],
  ['Company', [
    ['team', '/platform/team', 'Team', 'platform.manage'],
    ['settings', '/platform/settings', 'Settings', 'platform.manage'],
  ]],
];

const ICON_FOR = { home: 'today', registry: 'gyms' };

/**
 * The panel's one script, and every page works without it.
 *
 * 1. Search as you type (design critique 2026-09-29). A form marked
 *    `data-live="list-id [other-id…]"` still searches when submitted; with the
 *    script, the named parts of the page are refreshed from the same address
 *    300 ms after typing stops. The search box is never replaced, so it keeps
 *    focus and caret, and `<id>-status` tells a screen reader how many were
 *    found. Anything unexpected — signed out, refused, an error page — is
 *    opened properly instead.
 * 2. A switch-off confirmation scrolls into sight when it opens; on a phone it
 *    could open below the screen's edge.
 * 3. A shown-once link selects itself when tapped, ready to copy.
 *
 * No inline handlers (tests/platform-views.test.js).
 */
const PANEL_SCRIPT = `(function () {
  'use strict';
  if (window.fetch && window.DOMParser && window.URLSearchParams && window.FormData) {
    document.querySelectorAll('form[data-live]').forEach(function (form) {
      var ids = form.getAttribute('data-live').split(' ');
      var status = document.getElementById(ids[0] + '-status');
      var timer = 0, seq = 0, ctrl = null;
      function run() {
        var url = form.getAttribute('action') + '?' + new URLSearchParams(new FormData(form)).toString();
        var mine = ++seq;
        var list = document.getElementById(ids[0]);
        if (!list) return;
        if (ctrl) ctrl.abort();
        ctrl = window.AbortController ? new AbortController() : null;
        list.setAttribute('aria-busy', 'true');
        fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' }, signal: ctrl ? ctrl.signal : undefined })
          .then(function (res) { return res.text().then(function (text) { return { ok: res.ok, text: text }; }); })
          .then(function (got) {
            if (mine !== seq) return;
            var doc = new DOMParser().parseFromString(got.text, 'text/html');
            var fresh = doc.getElementById(ids[0]);
            if (!got.ok || !fresh) { location.assign(url); return; }
            ids.forEach(function (id) {
              var here = document.getElementById(id), there = doc.getElementById(id);
              if (here && there) here.innerHTML = there.innerHTML;
            });
            list.removeAttribute('aria-busy');
            if (status) status.textContent = fresh.getAttribute('data-summary') || '';
            if (window.history && history.replaceState) history.replaceState(null, '', url);
          })
          .catch(function (err) {
            if (err && err.name === 'AbortError') return;
            if (mine === seq) list.removeAttribute('aria-busy');
          });
      }
      function soon() { clearTimeout(timer); timer = setTimeout(run, 300); }
      form.addEventListener('input', function (e) { if (e.target && e.target.type === 'search') soon(); });
      form.addEventListener('change', function (e) {
        if (e.target && e.target.tagName === 'SELECT') { clearTimeout(timer); run(); }
      });
    });
  }
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || !d.open || !d.matches || !d.matches('details.confirm')) return;
    var f = d.querySelector('form');
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
  }, true);
  document.querySelectorAll('input[data-select]').forEach(function (i) {
    i.addEventListener('focus', function () { i.select(); });
    i.addEventListener('click', function () { i.select(); });
  });
})();`;

function staffNav(user, active) {
  // No permission list (a page rendered on its own, as the tests do): the
  // whole menu, as before.
  const may = (perm) => !perm || !Array.isArray(user.perms) || user.perms.includes(perm);
  return STAFF_NAV.map(([group, items]) => {
    const shown = items.filter(([, , , perm]) => may(perm));
    if (!shown.length) return '';
    return `<div class="grp">${h(group)}</div>
${shown
  .map(
    ([key, href, label]) =>
      `<a href="${href}"${key === active ? ' class="on" aria-current="page"' : ''}>${icon(ICON_FOR[key] || key)}${h(label)}</a>`
  )
  .join('\n')}`;
  }).join('\n');
}

/**
 * The page shell.
 *
 * `body` is inserted as-is: it is markup the caller has already built and
 * escaped. `title` is escaped, because it can carry a gym name.
 */
export function layout({
  title = 'Yoyo Gyms',
  body = '',
  user = null,
  indexable = false,
  bare = false,
  bodyClass = 'auth',
  active = '',
  // What the owner's one menu link is called. "My gym" before a gym exists
  // promised something that was not there yet (design critique 2026-09-29),
  // so it says "My application" until the owner's page knows there is a gym.
  ownerNav = 'My application',
}) {
  // noindex is right for the staff panel and WRONG for the two public pages.
  // A signup page nobody can find is a signup page nobody uses, so `indexable`
  // is opt-in per page rather than a blanket rule.
  const robots = indexable ? 'index,follow' : 'noindex,nofollow';
  const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${robots}">
<title>${h(title)} · Yoyo Gyms</title>
<style>${STYLE}</style>
</head>
`;

  // A sign-in page stands alone: no panel header, the brand instead.
  if (bare) {
    return `${head}<body class="${bodyClass}">
<main id="main" tabindex="-1">
${body}
</main>
</body>
</html>`;
  }

  // Yoyo staff: the main admin panel.
  if (user && user.kind !== 'gym_owner') {
    return `${head}<body class="panel">
<a class="skip" href="#main">Skip to content</a>
<aside class="side">
  <a class="brand" href="/platform/home"><img src="${LOGO_ON_DARK}" width="720" height="531" alt="Yoyo Gyms"></a>
  <input type="checkbox" id="navt" class="navt" aria-label="Show the menu">
  <label for="navt" class="navt-label">Menu</label>
  <nav aria-label="Main admin panel">
${staffNav(user, active)}
  </nav>
  <div class="me">
    <span class="who">${h(user.email)}</span>
    <a href="/platform/account"${active === 'account' ? ' aria-current="page"' : ''}>${icon('account')}Your account</a>
    <a href="/platform/logout">${icon('signout')}Sign out</a>
  </div>
</aside>
<main id="main" tabindex="-1">
${body}
</main>
<script>${PANEL_SCRIPT}</script>
</body>
</html>`;
  }

  // A gym owner, or nobody signed in: the brand, and for an owner their own
  // two links — never the staff menu (CLAUDE.md §40.1 F-40.2).
  const owner = Boolean(user);
  return `${head}<body>
<a class="skip" href="#main">Skip to content</a>
<header>
  <a class="brand" href="${owner ? '/platform/my-gym' : '/platform/welcome'}"><img src="${LOGO_ON_DARK}" width="720" height="531" alt="Yoyo Gyms"></a>
  ${
    owner
      ? `<nav class="row">
    <a href="/platform/my-gym"${active === 'my-gym' ? ' class="on" aria-current="page"' : ''}>${h(ownerNav)}</a>
    <a href="/platform/logout">Sign out</a>
  </nav>`
      : ''
  }
  <span class="muted">${owner ? h(user.email) : ''}</span>
</header>
<main id="main" tabindex="-1">
${body}
</main>
</body>
</html>`;
}

/**
 * The Yoyo STAFF sign-in (CLAUDE.md §36.1 Q8). Password and the second factor
 * together; login.js decides who may enter.
 *
 * It used to wear a second heading for gym owners (`?as=owner`). Owners now
 * have ONE door, /owner/login, which opens their gym or their application by
 * what their account can reach (design critique 2026-09-29) — so this page is
 * the staff door only, and sends an owner there.
 */
export function loginPage({ error = '' } = {}) {
  return layout({
    title: 'Platform administrator login',
    bare: true,
    body: `
<img class="auth-logo" src="${LOGO_ON_DARK}" width="720" height="531" alt="Yoyo Gyms">
<form class="card" method="post" action="/platform/login">
  <h1>Yoyo Gyms Platform</h1>
  <p class="muted auth-sub">Platform administrator login</p>
  ${error ? `<p class="err" role="alert">${h(error)}</p>` : ''}
  <label>Email
    <input type="email" name="email" autocomplete="username" required>
  </label>
  <label>Password
    <input type="password" name="password" autocomplete="current-password" required>
  </label>
  <label>Authentication code
    <input type="text" name="totp" inputmode="numeric" autocomplete="one-time-code"
           placeholder="6 digits">
  </label>
  <button type="submit">Sign in</button>
  <p class="auth-links"><a href="/platform/forgot">Forgot password?</a></p>
  <p class="muted auth-links">Lost your device? Use a recovery code in place of the authentication code.</p>
</form>
<p class="muted auth-foot">Gym owner? <a href="/owner/login">Use the gym owner sign-in</a></p>
<p class="muted auth-foot">Gym member? You sign in at your own gym. <a href="/platform/find">Find your gym</a></p>
<p class="muted auth-foot"><a href="/platform/privacy">Privacy policy</a> · <a href="/platform/delete-account">Delete your account</a></p>`,
  });
  // The code field is not `required`: a recovery code can stand in for it
  // (so no `pattern` either — it is not all digits), and a staff account
  // without two-factor is refused by the server, which is where that rule
  // belongs. The same route still serves the owner door's hand-over, where
  // the code is optional (D-119).
}

/** The two sign-in doors, for pages either kind of person reaches. */
const SIGN_IN_DOORS = `<a href="/owner/login">Gym owner sign-in</a> · <a href="/platform/login">Yoyo staff sign-in</a>`;

/** "I forgot my password." The same answer whether or not the account exists. */
export function forgotPage({ message = '', error = '' } = {}) {
  return layout({
    title: 'Reset your password',
    body: `
<form class="card" method="post" action="/platform/forgot">
  <h1>Reset your password</h1>
  ${message ? `<p>${h(message)}</p>` : `<p class="muted">Enter the email you sign in with. We will send a link to choose a new password.</p>`}
  ${error ? `<p class="err" role="alert">${h(error)}</p>` : ''}
  <label>Email
    <input type="email" name="email" autocomplete="username" required>
  </label>
  <button type="submit">Send the link</button>
  <p class="muted">Back to ${SIGN_IN_DOORS}</p>
</form>`,
  });
}

/** Choose a new password, from the emailed link. */
export function resetPage({ token = '', error = '' } = {}) {
  return layout({
    title: 'Choose a new password',
    body: `
<form class="card" method="post" action="/platform/reset">
  <h1>Choose a new password</h1>
  ${error ? `<p class="err">${h(error)}</p>` : ''}
  <input type="hidden" name="token" value="${h(token)}">
  <label>New password
    <input type="password" name="password" autocomplete="new-password" minlength="10" required>
  </label>
  <p class="muted">At least 10 characters. If you own a gym, this also becomes your sign-in for its admin panel.</p>
  <button type="submit">Save password</button>
</form>`,
  });
}

/** Done. Says plainly what changed, and where to go next. */
export function resetDonePage({ gymAccountsUpdated = 0 } = {}) {
  return layout({
    title: 'Password changed',
    body: `
<div class="card">
  <h1>Password changed</h1>
  <p>You can sign in with your new password now.</p>
  ${
    // An owner's gym took the new password too, so their one door opens it.
    gymAccountsUpdated
      ? `<p class="muted">Your gym's admin panel uses the new password too.</p>
  <p><a class="btn" href="/owner/login">Sign in to your gym</a></p>`
      : `<p class="muted">${SIGN_IN_DOORS}</p>`
  }
</div>`,
  });
}

// Coloured by what the state MEANS, so a healthy gym and a suspended one no
// longer look the same at a glance (CLAUDE.md §40.1 F-40.6).
const STATUS_TONE = {
  active: 'good', approved: 'good', accepted: 'good', paid: 'good', healthy: 'good', ready: 'good',
  included: 'good', on: 'good', done: 'good', off: 'muted', draft: 'muted',
  submitted: 'warn', under_review: 'warn', info_requested: 'warn', pending: 'warn', past_due: 'warn', issued: 'warn',
  invited: 'warn',
  trialing: 'info',
  rejected: 'bad', suspended: 'bad', cancelled: 'bad', failed: 'bad', overdue: 'bad', 'asked to close': 'bad',
  'switched off': 'bad',
};

const statusTag = (status) =>
  `<span class="tag${STATUS_TONE[status] ? ` tag--${STATUS_TONE[status]}` : ''}">${h(String(status ?? '').replace(/_/g, ' '))}</span>`;

// ---------------------------------------------------------------------------
// Figures and lists in the main admin panel (design critique 2026-09-29)
// ---------------------------------------------------------------------------

/** Digits in threes with a no-break space: "12 345". */
const grouped = (digits) => String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * A figure as a person reads it: "12 345" — grouped with a space, as the money
 * tiles on Today already were (en-ZA), because a comma or a point is read as
 * a decimal somewhere in the world. A figure we do not have is a dash, never 0.
 * Plain text: it needs no escaping.
 */
function num(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const [whole, part] = String(Math.abs(v)).split('.');
  return `${v < 0 ? '-' : ''}${grouped(whole)}${part ? `.${part}` : ''}`;
}

/** format.js count(), with the figure grouped: "No gyms", "1 gym", "1 234 gyms". */
function tally(n, singular, plural = `${singular}s`) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v === 0) return `No ${plural}`;
  return `${num(v)} ${v === 1 ? singular : plural}`;
}

/**
 * Cents as money, grouped: "ZAR 12 345.00". Never rounded to whole units, and
 * an absent amount is a dash (format.js money). Escape it where it is drawn:
 * the currency code is data.
 */
function amount(cents, currency = 'ZAR') {
  if (cents === null || cents === undefined || cents === '') return '—';
  const v = Number(cents);
  if (!Number.isFinite(v)) return '—';
  const [whole, part] = (Math.abs(v) / 100).toFixed(2).split('.');
  return `${currency} ${v < 0 ? '-' : ''}${grouped(whole)}.${part}`;
}

/**
 * A panel list: a real table on a computer, a stack of cards on a phone.
 *
 * `cols` are [label, options]: `num` right-aligns a column of figures, `act`
 * marks the actions column (its heading is read aloud, not shown). `rows` are
 * arrays of cell markup the caller has ALREADY ESCAPED, one per column; a cell
 * may be { html, cls } to add a class. Every value carries its column's name
 * in data-label for the phone layout, and the explicit roles keep the table a
 * table for a screen reader when a phone lays its rows out as blocks.
 */
function listTable(cols, rows) {
  const head = cols
    .map(
      ([label, o = {}]) =>
        `<th scope="col" role="columnheader"${o.num ? ' class="num"' : ''}>${
          o.act ? `<span class="sr-only">${h(label)}</span>` : h(label)
        }</th>`
    )
    .join('');
  const body = rows
    .map(
      (cells) =>
        `    <tr role="row">${cells
          .map((cell, i) => {
            const [label, o = {}] = cols[i] || [''];
            const c = cell && typeof cell === 'object' ? cell : { html: cell };
            const cls = [o.num ? 'num' : '', o.act ? 'act' : '', c.cls || ''].filter(Boolean).join(' ');
            return `<td role="cell"${o.act ? '' : ` data-label="${h(label)}"`}${cls ? ` class="${cls}"` : ''}>${c.html ?? ''}</td>`;
          })
          .join('')}</tr>`
    )
    .join('\n');
  return `<div class="tscroll"><table class="list" role="table">
  <thead role="rowgroup"><tr role="row">${head}</tr></thead>
  <tbody role="rowgroup">
${body}
  </tbody>
</table></div>`;
}

/**
 * The figures row on Today and on a gym's page. Its class says how many tiles
 * it holds, so the grid can balance them (2 x 2, never 3 + 1).
 */
function kpiRow(tiles) {
  const shown = tiles.filter(Boolean);
  if (!shown.length) return '';
  return `<div class="kpi-wrap"><div class="kpis n${Math.min(shown.length, 4)}">
  ${shown.join('\n  ')}
</div></div>`;
}

/**
 * A list search that filters as the person types (design critique
 * 2026-09-29), and still works as a plain form without the script.
 * `fields` is the search box and any filters, already built and escaped.
 */
function liveSearch({ action, regions, fields, hidden = '' }) {
  const [list] = regions;
  return `<form class="card row" method="get" action="${action}" role="search" data-live="${regions.join(' ')}">
  ${hidden}${fields}
  <button type="submit" class="ghost">Search</button>
</form>
<p id="${list}-status" class="sr-only" role="status" aria-live="polite"></p>`;
}

/**
 * The review queue, in tabs by what each application is waiting for, with a
 * search (CLAUDE.md §40.1 F-40.6).
 */
export const APPLICATION_TABS = [
  ['review', 'To review', ['submitted', 'under_review']],
  // A draft has not been sent: the owner is still uploading (CLAUDE.md §42).
  ['owner', 'Waiting on the owner', ['info_requested', 'draft']],
  ['approved', 'Approved', ['approved']],
  ['rejected', 'Rejected', ['rejected']],
  ['all', 'All', []],
];

export function applicationsPage({ applications = [], user = null, tab = 'review', counts = null, query = '' } = {}) {
  const tabCount = (states) =>
    counts ? (states.length ? states : Object.keys(counts)).reduce((n, s) => n + (counts[s] || 0), 0) : null;

  // The current state tinted like the menu's current page — not one lime
  // button beside four grey ones (design critique 2026-09-29). Refreshed with
  // the list when a search is typed, so every tab keeps the search.
  const tabs = `<nav class="tabs" id="applications-tabs" aria-label="Application states">
${APPLICATION_TABS.map(([key, label, states]) => {
  const n = tabCount(states);
  const href = `/platform/applications?tab=${key}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
  return `  <a href="${h(href)}"${key === tab ? ' aria-current="page"' : ''}>${h(label)}${
    n === null ? '' : ` <span class="n">${h(num(n))}</span>`
  }</a>`;
}).join('\n')}
</nav>`;

  const list = applications.length
    ? listTable(
        [['Gym'], ['City'], ['Plan'], ['Status'], ['Submitted']],
        applications.map((a) => [
          `<a href="/platform/applications/${h(a.id)}"><b>${h(a.proposed_gym_name || 'Unnamed')}</b></a>`,
          `${h(a.city)}${a.country ? ` <span class="muted">${h(countryName(a.country))}</span>` : ''}`,
          a.requested_plan_key ? h(planName(a.requested_plan_key)) : '—',
          statusTag(a.status),
          { html: h(when(a.submitted_at)), cls: 'muted' },
        ])
      )
    : `<div class="empty">${
        query
          ? 'No applications match that search.'
          : tab === 'review'
            ? 'No applications waiting for review.'
            : 'No applications here.'
      }</div>`;

  const summary = query
    ? `${tally(applications.length, 'application')} match “${query}”.`
    : `${tally(applications.length, 'application')}.`;

  return layout({
    active: 'applications',
    title: 'Applications',
    user,
    body: `<h1>Applications</h1>
<p class="lede">Every gym is reviewed by a person before it appears in app search. A gym is approved
once its ID, business registration and proof of address have each been accepted.</p>
${tabs}
${liveSearch({
  action: '/platform/applications',
  regions: ['applications-list', 'applications-tabs'],
  hidden: `<input type="hidden" name="tab" value="${h(tab)}">\n  `,
  fields: `<label class="grow">Search by gym name or city<input type="search" name="q" value="${h(query)}" autocomplete="off"></label>`,
})}
<div id="applications-list" data-summary="${h(summary)}">
${list}
</div>`,
  });
}

/** One required document's line on the checklist. */
function requiredLine(type, documents) {
  const ofType = documents.filter((d) => d.doc_type === type);
  const accepted = ofType.some((d) => d.status === 'accepted');
  const waiting = ofType.some((d) => d.status === 'pending');
  const state = accepted
    ? 'accepted'
    : waiting
      ? 'uploaded — waiting for you to check it'
      : ofType.length
        ? 'rejected — waiting for a new file'
        : 'not uploaded yet';
  return `<li class="${accepted ? 'ok' : ''}"><b>${h(DOCUMENT_LABELS[type] || type)}</b> <span class="muted">· ${h(state)}</span></li>`;
}

/** One application: who applied, their documents, the history, and the decision. */
export function applicationDetailPage({
  application,
  applicant = null,
  documents = [],
  events = [],
  user = null,
  csrfToken = '',
}) {
  const missing = missingRequiredDocuments(documents);

  // Accept and Reject are outlined: the one lime button on this page is the
  // decision below (design critique 2026-09-29).
  const docs = documents.length
    ? `${listTable(
        [['Document'], ['File'], ['Status'], ['Decide', { act: true }]],
        documents.map((d) => [
          `${h(DOCUMENT_LABELS[d.doc_type] || d.doc_type)}${
            REQUIRED_DOCUMENTS.includes(d.doc_type) ? ' <span class="muted">· required</span>' : ''
          }`,
          `<a href="/platform/documents/${h(d.id)}">${h(d.filename || 'open')}</a>`,
          `${statusTag(d.status)}${d.reject_reason ? `<br><span class="muted">${h(d.reject_reason)}</span>` : ''}`,
          d.status === 'pending'
            ? `<form method="post" action="/platform/documents/${h(d.id)}/decide" class="row">
        <input type="hidden" name="csrf" value="${h(csrfToken)}">
        <button type="submit" name="action" value="accept" formnovalidate class="ghost">Accept</button>
        <input name="reason" required aria-label="Reason for rejecting this document" placeholder="Reason, if rejecting">
        <button type="submit" name="action" value="reject" class="ghost">Reject</button>
      </form>`
            : '<span class="muted">decided</span>',
        ])
      )}
<p class="muted">Open a document to see it beside what the applicant told us. Opening one is recorded
in the audit log: who opened it, and when.</p>`
    : `<div class="empty">No documents uploaded yet.</div>`;

  const history = events.length
    ? `<ul class="events">
${events
  .map(
    (e) => `  <li><b>${h(String(e.event || '').replace(/_/g, ' '))}</b> <span class="muted">${h(exact(e.created_at))}</span>${
      e.reason ? `<br>${h(e.reason)}` : ''
    }</li>`
  )
  .join('\n')}
</ul>`
    : `<p class="muted">No history yet.</p>`;

  const decided = ['approved', 'rejected'].includes(application.status);
  const a = application;

  const who = `<div class="card">
  <h2>Applicant</h2>
  <dl class="facts">
    <dt>Owner</dt><dd>${h(applicant?.full_name || '—')}</dd>
    <dt>Email</dt><dd>${applicant?.email ? `<a href="mailto:${h(applicant.email)}">${h(applicant.email)}</a>` : '—'}</dd>
    <dt>Phone</dt><dd>${a.owner_phone ? `<a href="tel:${h(a.owner_phone)}">${h(a.owner_phone)}</a>` : '<span class="muted">not given</span>'}</dd>
    <dt>Plan</dt><dd>${a.requested_plan_key ? h(planName(a.requested_plan_key)) : '—'}</dd>
    <dt>Expected members</dt><dd>${h(num(a.estimated_members))}</dd>
    <dt>Applied</dt><dd>${h(exact(a.submitted_at)) || '—'}</dd>
  </dl>
</div>`;

  const gym = `<div class="card">
  <h2>Gym</h2>
  <dl class="facts">
    <dt>Name</dt><dd><b>${h(a.proposed_gym_name || '—')}</b></dd>
    <dt>Street address</dt><dd>${h(a.gym_address) || '<span class="muted">not given</span>'}</dd>
    <dt>City</dt><dd>${h(a.city) || '—'}${a.country ? `, ${h(countryName(a.country))}` : ''}</dd>
    <dt>Web address</dt><dd class="muted">${a.slug ? `/g/${h(a.slug)}/` : '—'}</dd>
    <dt>What they need</dt><dd>${h(a.owner_needs) || '<span class="muted">nothing added</span>'}</dd>
  </dl>
</div>`;

  const checklist = `<div class="card">
  <h2>Required before approval</h2>
  <ul class="checklist">
    ${REQUIRED_DOCUMENTS.map((t) => requiredLine(t, documents)).join('\n    ')}
  </ul>
  ${
    missing.length
      ? '<p class="muted">Approve becomes available once all three are accepted.</p>'
      : '<p class="muted">All three are accepted.</p>'
  }
</div>`;

  // The LATEST build attempt, whatever order the events arrive in.
  const lastBuild = [...events]
    .filter((e) => e.event === 'provisioned' || e.event === 'provision_failed')
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0];
  const buildFailed = a.status === 'approved' && lastBuild?.event === 'provision_failed';
  const retry = buildFailed
    ? `<form class="card tone-bad" method="post" action="/platform/applications/${h(a.id)}/decide">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>The gym was not fully created</h2>
  <p>Approved, but building the gym stopped${lastBuild.detail?.failed_at ? ` at <b>${h(lastBuild.detail.failed_at)}</b>` : ''}${
      lastBuild.detail?.error ? `: <span class="muted">${h(lastBuild.detail.error)}</span>` : '.'
    }</p>
  <p class="muted">The owner has not been emailed yet. Trying again finishes the gym from where it stopped —
  nothing already built is made twice — and then emails the owner their activation link.</p>
  <button type="submit" name="action" value="retry_provision">Try again</button>
</form>`
    : '';

  const decision = a.status === 'draft'
    ? `<div class="card"><h2>Not sent yet</h2><p class="muted">The owner is still uploading their documents and
checking what they wrote. Nothing can be decided until they press Submit; it then appears under
<a href="/platform/applications">To review</a>.</p></div>`
    : decided
    ? `<div class="card"><p class="muted">This application has been decided. Decisions are final; the owner
may submit a new application.${
        a.status === 'approved' && a.slug
          ? ` <a href="/platform/registry?q=${h(encodeURIComponent(a.slug))}">Find the gym in the registry →</a>`
          : ''
      }</p></div>`
    : `<form class="card" method="post" action="/platform/applications/${h(a.id)}/decide">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Decision</h2>
  <label>Message to the owner
    <textarea name="reason" rows="3" required placeholder="Required to reject or to ask for more. The owner is emailed this."></textarea>
  </label>
  <div class="row">
    <button type="submit" name="action" value="approve" formnovalidate${missing.length ? ' disabled' : ''}>Approve and set up the gym</button>
    <button type="submit" name="action" value="request_info" class="ghost">Request information</button>
    <button type="submit" name="action" value="reject" class="danger">Reject</button>
  </div>
  <p class="muted">${
    missing.length
      ? `Approve is unavailable until the required documents are accepted: ${h(
          missing.map((t) => DOCUMENT_LABELS[t] || t).join(', ')
        )}.`
      : 'Approving creates this gym and emails the owner their activation link.'
  } Rejecting, or asking for more, emails the owner your message.</p>
</form>`;

  return layout({
    active: 'applications',
    title: a.proposed_gym_name || 'Application',
    user,
    body: `<p><a href="/platform/applications">← All applications</a></p>
<h1>${h(a.proposed_gym_name || 'Application')}</h1>
<p class="row">${statusTag(a.status)} <span class="muted">${[a.city, countryName(a.country)].filter(Boolean).map(h).join(', ')}</span></p>
${a.decision_reason ? `<div class="card"><b>Reason given:</b> ${h(a.decision_reason)}</div>` : ''}
${
  a.status === 'info_requested' && a.review_notes
    ? `<div class="card"><b>Asked of the owner:</b> ${h(a.review_notes)}</div>`
    : ''
}

<div class="grid2">
${who}
${gym}
</div>

${retry}

${checklist}

<h2>Documents</h2>
${docs}

${decision}

<h2>History</h2>
${history}`,
  });
}

// ---------------------------------------------------------------------------
// Public: gym-owner application
// ---------------------------------------------------------------------------

function planPrice(plan) {
  if (!plan.price) return '<span class="muted">Price on request</span>';
  const amount = Math.round(plan.price / 100).toLocaleString('en-ZA');
  const money = plan.currency && plan.currency !== 'ZAR' ? `${h(plan.currency)} ${amount}` : `R${amount}`;
  return `${money}<span class="muted"> / month</span>`;
}

/**
 * Everything one plan includes, as a gym owner reads it: what their members
 * get, what they get, and what Yoyo Gyms commits to (§41.1 Q6). From the
 * second plan on, only what it ADDS is listed — "everything in Basic, plus"
 * reads; the same forty lines three times does not.
 */
function planDetails(plan, previous = null) {
  const adds = (list, prev) => (prev ? list.filter((x) => !prev.includes(x)) : list);
  const lead = previous ? `<li class="plan-lead">Everything in ${h(previous.label)}, plus:</li>` : '';
  const list = (items) => `<ul class="ticks">${items.map((x) => `<li>${h(x)}</li>`).join('')}</ul>`;
  return `<p class="plan-sub">Your members get</p>
  <ul class="ticks">${lead}${adds(plan.memberBenefits, previous?.memberBenefits).map((b) => `<li>${h(b)}</li>`).join('')}</ul>
  <p class="plan-sub">You get</p>
  <ul class="ticks">${lead}${adds(plan.included, previous?.included).map((f) => `<li>${h(f)}</li>`).join('')}</ul>
  <p class="plan-sub">Our support</p>
  ${list(plan.support || [])}`;
}

/**
 * One plan to choose on step 1: name, price, member limit and the first
 * things it adds, with the rest behind "See everything included". Step 1 was
 * a 7035px sales page on a phone (design critique 2026-09-29); the pitch now
 * lives on the front page, and this is a form.
 *
 * The whole card picks the plan (the label is stretched over it), except the
 * disclosure, which sits above that and opens on its own.
 */
function planChoice(plan, { selected = false, previous = null, recommended = false } = {}) {
  const id = `plan-${plan.key}`;
  const adds = previous ? plan.included.filter((x) => !previous.included.includes(x)) : plan.included;
  return `<div class="plan${recommended ? ' plan-rec' : ''}">
  <input type="radio" name="plan" id="${h(id)}" value="${h(plan.key)}" aria-describedby="${h(id)}-d"${selected ? ' checked' : ''} required>
  <label for="${h(id)}" class="plan-head"><span class="plan-top"><span class="plan-name">${h(plan.label)}</span>${
    recommended ? ' <span class="plan-badge">Recommended</span>' : ''
  }</span> <span class="plan-price store-hide">${planPrice(plan)}</span></label>
  <div id="${h(id)}-d">
    <p class="plan-limit">${h(plan.memberLimit)}${trialLine(plan)}</p>
    <ul class="ticks">${previous ? `<li class="plan-lead">Everything in ${h(previous.label)}, plus:</li>` : ''}${adds
      .slice(0, 3)
      .map((f) => `<li>${h(f)}</li>`)
      .join('')}</ul>
  </div>
  <details class="plan-more"><summary>See everything included</summary>${planDetails(plan, previous)}</details>
</div>`;
}

/**
 * The country as a person names it — "South Africa", never "ZA" (design
 * critique 2026-09-29). The value sent is still the ISO code the server
 * stores. A saved code that is not on the list is kept as it is, so
 * correcting a draft never quietly changes it.
 */
const COUNTRY_OPTIONS = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'en'));
function countrySelect(value) {
  const code = String(value || '').trim().toUpperCase();
  const known = COUNTRY_OPTIONS.some((c) => c.code === code);
  return `<select name="country" required autocomplete="country">
          <option value=""${code ? '' : ' selected'}>Choose your country</option>
          ${code && !known ? `<option value="${h(code)}" selected>${h(code)}</option>` : ''}
          ${COUNTRY_OPTIONS.map((c) => `<option value="${h(c.code)}"${c.code === code ? ' selected' : ''}>${h(c.name)}</option>`).join('')}
        </select>`;
}

const TICK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E")`;

// Step 1 of the application, and the owner pitch on the front page.
const SIGNUP_STYLE = `
  .apply-sec { border:0; margin:36px 0 0; padding:0; min-width:0; }
  .apply-sec > legend, .apply-sec > h2 { font-size:20px; font-weight:700; line-height:1.25; margin:0 0 12px; padding:0; }
  .apply-card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:24px; display:grid; gap:16px; }
  .apply-card > * { margin:0; }
  /* A tick drawn in the accent, not a text glyph. */
  .ticks { list-style:none; margin:0; padding:0; display:grid; gap:6px; }
  .ticks li { position:relative; padding-left:24px; }
  .ticks li::before { content:''; position:absolute; left:0; top:.3em; width:15px; height:15px; background:var(--accent);
                      -webkit-mask:${TICK} center/contain no-repeat; mask:${TICK} center/contain no-repeat; }
  .ticks li.plan-lead { padding-left:0; font-weight:700; }
  .ticks li.plan-lead::before { display:none; }
  .plans { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); align-items:start; margin:0 0 12px; }
  .plan { position:relative; display:grid; gap:10px; align-content:start; background:var(--card); border:1px solid var(--line);
          border-radius:20px; padding:20px; }
  .plan-rec { border-color:rgba(191,246,66,.45); }
  .plan:has(input:checked) { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
  .plan:has(input:focus-visible) { outline:2px solid var(--accent); outline-offset:3px; }
  .plan > input[type=radio] { position:absolute; top:22px; right:20px; width:22px; height:22px; margin:0; }
  .plan-head { display:grid; gap:4px; padding-right:34px; color:var(--ink); cursor:pointer; }
  .plan-head::after { content:''; position:absolute; inset:0; border-radius:inherit; }
  .plan-top { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .plan-name { font-size:20px; font-weight:800; line-height:1.25; }
  .plan-badge { font-size:12px; font-weight:800; color:var(--accent); border:1px solid rgba(191,246,66,.5); border-radius:99px; padding:2px 10px; }
  .plan-price { font-size:28px; font-weight:800; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
  .plan-price .muted { font-size:13px; font-weight:500; letter-spacing:0; }
  .plan-limit { margin:0; font-size:13px; font-weight:700; }
  .plan .ticks { font-size:13px; }
  .plan-more { position:relative; z-index:1; border-top:1px solid var(--line); }
  .plan-more summary { cursor:pointer; min-height:44px; display:flex; align-items:center; font-size:13px; font-weight:700; }
  .plan-more[open] summary { color:var(--accent); }
  .plan-sub { font-size:12px; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); margin:14px 0 6px; font-weight:700; }
  .terms-list { list-style:none; margin:0; padding:0; display:grid; gap:12px 24px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }
  .terms-list li b { display:block; }
  .terms-list li span { color:var(--muted); }
  form.wide { max-width:none; margin:0; display:grid; }
  .submit-row { margin-top:28px; display:grid; gap:12px; }
  .submit-row p { margin:0; }
  .submit-row button { min-height:56px; width:100%; font-weight:800; }
`;

/** The opening sentence of an agreement section, for the key-terms list. */
function firstSentence(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
}

/**
 * Step 1 of the gym-owner application (CLAUDE.md §41.1 Q2, Q5, §42): the
 * plan, who they are, and the key terms with a required "I agree". A FORM,
 * with the stepper as its only numbering; what Yoyo Gyms offers is on the
 * front page (/platform/welcome#owners), linked from here.
 */
export function signupPage({
  plans = [],
  values = {},
  error = '',
  selectedPlan = '',
  terms = [],
  termsApproved = false,
  // A signed-in owner correcting their own draft (CLAUDE.md §42): the account
  // exists and the agreement was accepted, so neither is asked again.
  editing = false,
  email = '',
  csrfToken = '',
} = {}) {
  const chosen = selectedPlan || (plans.find((p) => p.key === 'medium') ? 'medium' : plans[0]?.key || '');
  const title = editing ? 'Your details' : 'Apply to join Yoyo Gyms';

  return layout({
    title,
    indexable: true, // the front door for owners — it must be findable
    body: `<style>${SIGNUP_STYLE}${APPLY_STEP_STYLE}
  main { max-width:880px; }
</style>
${applySteps(1)}
<h1>${title}</h1>
<p class="lede">${
      editing
        ? 'Change anything below. You check it all again before you submit.'
        : 'Every plan starts with a free trial, and a person checks every application before a gym goes live.'
    } <a href="/platform/welcome#owners">What you get with Yoyo Gyms</a></p>
${error ? `<p class="err" role="alert">${h(error)}</p>` : ''}

<form class="wide" method="post" action="/platform/apply">
  ${editing ? `<input type="hidden" name="editing" value="1"><input type="hidden" name="csrf" value="${h(csrfToken)}">` : ''}
  <fieldset class="apply-sec">
    <legend>Choose your plan</legend>
    <div class="plans">
      ${plans
        .map((p, i) =>
          planChoice(p, { selected: chosen === p.key, previous: i > 0 ? plans[i - 1] : null, recommended: p.key === 'medium' })
        )
        .join('')}
    </div>
    <p class="muted">You can move to another plan at any time. Moving down never deletes a member.</p>
  </fieldset>

  <section class="apply-sec" aria-labelledby="about-h">
    <h2 id="about-h">About you and your gym</h2>
    <div class="apply-card">
    ${
      editing
        ? `<label>Your name
        <input name="owner_name" required autocomplete="name" value="${h(values.owner_name)}">
      </label>
      <p class="muted">Signed in as <b>${h(email)}</b>. Your email and password stay as they are.</p>`
        : `<div class="two">
      <label>Your name
        <input name="owner_name" required autocomplete="name" value="${h(values.owner_name)}">
      </label>
      <label>Your email
        <input type="email" name="email" required autocomplete="email" value="${h(values.email)}">
      </label>
    </div>`
    }

    <div class="two">
      ${
        editing
          ? ''
          : `<label>Choose a password
        <input type="password" name="password" required minlength="10" autocomplete="new-password">
        <span class="muted">At least 10 characters. You use it to finish and follow your application, from any device.</span>
      </label>`
      }
      <label>Your phone number
        <input type="tel" name="phone" required autocomplete="tel" placeholder="+27 82 123 4567" value="${h(values.phone)}">
        <span class="muted">With the country code. We call if anything needs checking.</span>
      </label>
    </div>

    <div class="two">
      <label>Gym name
        <input name="gym_name" required value="${h(values.gym_name)}">
        <span class="muted">The name your members will search for.</span>
      </label>
      <label>Gym street address
        <input name="address" required autocomplete="street-address" value="${h(values.address)}">
        <span class="muted">Where members train. It should match your proof of address.</span>
      </label>
    </div>

    <div class="two">
      <label>City
        <input name="city" required value="${h(values.city)}">
      </label>
      <label>Country
        ${countrySelect(values.country)}
        <span class="muted">Not listed? Write to hello@mulesoo.com and we will add it.</span>
      </label>
    </div>

    <label>Roughly how many members? <span class="muted">Optional.</span>
      <input type="number" name="estimated_members" min="0" inputmode="numeric" value="${h(values.estimated_members)}">
    </label>

    <label>Is there anything your gym needs that this does not do? <span class="muted">Optional. It shapes what we build next.</span>
      <textarea name="needs" rows="3">${h(values.needs)}</textarea>
    </label>
    </div>
  </section>

  ${
    editing
      ? ''
      : `<section class="apply-sec" aria-labelledby="terms-h">
    <h2 id="terms-h">The Gym Owner Agreement</h2>
    <div class="apply-card">
      <ul class="terms-list">
        ${terms
          .map((t) => `<li><b>${h(String(t.heading || t.title || '').replace(/^\d+\.\s*/, ''))}</b><span>${h(firstSentence(t.body))}</span></li>`)
          .join('\n        ')}
      </ul>
      <p><a href="/platform/terms" target="_blank" rel="noopener">Read the full Gym Owner Agreement</a></p>
      ${
        // Still a draft until someone approves it (§41.1 Q5). Said calmly and
        // truly: it is accepted AGAIN at activation, in its wording then.
        termsApproved
          ? ''
          : '<p class="muted">The agreement is still being finalised. You accept it again when you activate your gym, so you always agree to its latest wording.</p>'
      }
      <label class="agree">
        <input type="checkbox" name="accept_terms" value="yes" required${values.accept_terms === 'yes' ? ' checked' : ''}>
        <span>I have read and agree to the Gym Owner Agreement.</span>
      </label>
    </div>
  </section>`
  }

  <div class="submit-row">
    ${
      editing
        ? ''
        : `<p class="muted">Next you upload three documents, each a PDF or a photo from your phone: your ID, your business
    registration and proof of the gym's address. Nothing is sent until you check it all and submit.</p>`
    }
    <button type="submit">${editing ? 'Save and continue' : 'Continue to your documents'}</button>
  </div>
</form>`,
  });
}

export function signupSuccessPage({ gymName = '', emailed = true, user = null } = {}) {
  return layout({
    title: 'Application sent',
    user,
    body: `<style>${SIGNUP_STYLE}${APPLY_STEP_STYLE}</style>
${applySteps(4)}
<h1>Application sent</h1>
<p class="lede">Thank you. Your application for <b>${h(gymName)}</b> and its documents are with us.${
      emailed ? ' We have emailed you a confirmation.' : ''
    }</p>

<div class="card">
  <h2>What happens next</h2>
  <ol>
    <li><b>A person checks it.</b> Your details and each document, by hand. It is not instant.</li>
    <li><b>We email you the decision.</b> If anything is missing, we tell you exactly what.</li>
    <li><b>Once approved,</b> we email you an activation link and a code. Using them opens your gym and
    gives you your own gym admin panel.</li>
  </ol>
</div>
<p><a class="btn" href="/platform/my-gym">Follow your application</a></p>
<p class="muted">Your gym will not appear in member search until it is approved and live.</p>`,
  });
}

// ---------------------------------------------------------------------------
// The application, step by step (CLAUDE.md §42): details → documents → check
// and submit. Nothing reaches a reviewer until the owner presses Submit.
// ---------------------------------------------------------------------------

const APPLY_STEP_STYLE = `
  .steps { display:flex; gap:10px; list-style:none; padding:0; margin:20px 0 28px; }
  .steps li { flex:1; border-top:4px solid var(--line); padding-top:10px; font-weight:700; color:var(--muted); font-size:14px; }
  .steps li.on { border-color:var(--accent); color:var(--ink); }
  .steps li.done { border-color:var(--accent); }
  .docs { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); }
  .doc-box { position:relative; background:var(--card); border:1px solid var(--line); border-radius:20px; padding:20px; display:grid; gap:10px; align-content:start; }
  .doc-box.done { border-color:rgba(191,246,66,.55); }
  .doc-box.bad { border-color:rgba(255,107,107,.6); }
  .doc-box.busy { opacity:.7; pointer-events:none; }
  .doc-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .doc-head b { font-size:17px; }
  .req { font-size:12px; font-weight:800; color:var(--accent-ink); background:var(--accent); border-radius:99px; padding:3px 10px; }
  .doc-file { margin:0; word-break:break-word; }
  .doc-file::before { content:'✓ '; color:var(--accent); font-weight:800; }
  .upload-btn { position:relative; display:flex; align-items:center; justify-content:center; gap:8px; min-height:56px; border:2px dashed var(--line);
                border-radius:16px; font-weight:800; cursor:pointer; color:var(--ink); text-align:center; padding:8px 12px; }
  .upload-btn:hover, .upload-btn:focus-within { border-color:var(--accent); }
  .upload-btn input { position:absolute; opacity:0; width:1px; height:1px; }
  .doc-note { margin:0; min-height:1.2em; }
  .optional { margin-top:18px; }
  .optional summary { cursor:pointer; font-weight:800; min-height:44px; display:flex; align-items:center; }
  .optional summary::before { content:'+'; font-size:22px; width:22px; margin-right:8px; color:var(--accent); }
  .optional[open] summary::before { content:'–'; }
  .cta { display:flex; align-items:center; justify-content:center; min-height:56px; font-size:17px; width:100%; border-radius:99px; }
  a.cta { background:var(--accent); color:var(--accent-ink); font-weight:800; text-decoration:none; }
  .review-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
  .review-head h2 { margin:0; }
  .review-head a { font-weight:800; min-height:44px; display:inline-flex; align-items:center; }
`;

/** Where the owner is: 1 details, 2 documents, 3 check and submit, 4 sent. */
function applySteps(at) {
  const step = (n, label) =>
    `<li class="${n === at ? 'on' : n < at ? 'done' : ''}"${n === at ? ' aria-current="step"' : ''}>${n}. ${label}</li>`;
  return `<ol class="steps" aria-label="Your application">${step(1, 'Your details')}${step(2, 'Documents')}${step(3, 'Check and submit')}</ol>`;
}

/** What each document is, in the owner's words. */
const DOCUMENT_HINTS = {
  id_document: 'Your passport or national ID card. Show the side with your photo, with all four corners in the picture.',
  business_registration: 'The certificate that registers the business that runs the gym.',
  proof_of_address: "A recent utility bill, lease or municipal account showing the gym's street address.",
  tax_clearance: 'A tax clearance certificate, if you have one.',
  insurance: 'Your public liability or business insurance, if you have it.',
  lease_agreement: 'The lease for the gym premises, if you rent them.',
  other_supporting: 'Anything else that helps us check your gym.',
};

const OPTIONAL_DOCUMENTS = ['tax_clearance', 'insurance', 'lease_agreement', 'other_supporting'];

function fileSize(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** The newest file of one type (documents arrive oldest first). */
function latestOf(type, documents) {
  const ofType = documents.filter((d) => d.doc_type === type);
  return ofType[ofType.length - 1] || null;
}

function docBox(type, documents, { required }) {
  const latest = latestOf(type, documents);
  const rejected = latest?.status === 'rejected';
  const done = latest && !rejected;
  return `<div class="doc-box${done ? ' done' : ''}${rejected ? ' bad' : ''}">
  <div class="doc-head"><b>${h(DOCUMENT_LABELS[type] || type)}</b>${required ? '<span class="req">Required</span>' : '<span class="muted">Optional</span>'}</div>
  <p class="muted" style="margin:0">${h(DOCUMENT_HINTS[type] || '')}</p>
  ${
    done
      ? `<p class="doc-file"><a href="/platform/apply/documents/${h(latest.id)}" target="_blank" rel="noopener">${h(latest.filename || 'Your file')}</a> <span class="muted">${h(fileSize(latest.size_bytes))}</span></p>`
      : ''
  }
  ${rejected ? `<p class="err" style="margin:0">Not accepted${latest.reject_reason ? `: ${h(latest.reject_reason)}` : ''}. Please upload a new one.</p>` : ''}
  <label class="upload-btn">
    <input type="file" accept="application/pdf,image/*" data-type="${h(type)}">
    <span>${done ? 'Replace the file' : 'Upload a PDF or photo'}</span>
  </label>
  <p class="doc-note muted" aria-live="polite"></p>
</div>`;
}

/**
 * Step 2 — one upload box per document (CLAUDE.md §42). Works on any device:
 * on a phone the box offers the camera, the photo library and files.
 *
 * A PHOTO IS CONVERTED TO JPEG ON THE DEVICE before it is sent (§42.1 F-42.3).
 * An iPhone photo can be HEIC, which Chrome on a Windows computer cannot show,
 * so the reviewer would have had nothing to look at. It is also shrunk to at
 * most 2400 px — still sharp enough to read an ID number — so it uploads on a
 * weak signal. A PDF is sent exactly as it is.
 */
export function applyDocumentsPage({ application, documents = [], csrfToken = '', user = null } = {}) {
  const have = REQUIRED_DOCUMENTS.filter((t) => {
    const latest = latestOf(t, documents);
    return latest && latest.status !== 'rejected';
  }).length;
  const ready = have === REQUIRED_DOCUMENTS.length;
  const optionalUploaded = OPTIONAL_DOCUMENTS.some((t) => latestOf(t, documents));
  // Into a <script>: JSON, with "<" escaped so no value can close the tag.
  const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

  return layout({
    title: 'Upload your documents',
    user,
    body: `<style>${SIGNUP_STYLE}${APPLY_STEP_STYLE}
  main { max-width:880px; }
</style>
${applySteps(2)}
<h1>Upload your documents</h1>
<p class="lede">For <b>${h(application.proposed_gym_name || 'your gym')}</b>. Send a PDF or a clear photo: take one with
your phone's camera, or choose a file. Up to 10 MB each. A person looks at every document.</p>

<div class="docs">
${REQUIRED_DOCUMENTS.map((t) => docBox(t, documents, { required: true })).join('\n')}
</div>

<details class="optional"${optionalUploaded ? ' open' : ''}>
  <summary>Optional documents, which can speed up the review</summary>
  <div class="docs">
${OPTIONAL_DOCUMENTS.map((t) => docBox(t, documents, { required: false })).join('\n')}
  </div>
</details>

<p class="muted" style="margin-top:24px"><b>${have} of ${REQUIRED_DOCUMENTS.length}</b> required documents uploaded.</p>
<div class="submit-row">${
      ready
        ? '<a class="cta" href="/platform/apply/review">Continue to check and submit</a>'
        : '<button class="cta" type="button" disabled>Upload the three required documents to continue</button>'
    }</div>
<p><a href="/platform/apply">← Back to your details</a></p>

<script>
(function () {
  var CSRF = ${js(csrfToken)};
  var APPLICATION = ${js(application.id)};
  var MAX = ${MAX_DOCUMENT_BYTES};

  function isHeic(file) { return /\\.(heic|heif)$/i.test(file.name || '') || /heic|heif/i.test(file.type || ''); }

  // A photo becomes a JPEG any computer can show; a PDF is left alone.
  function asJpeg(file) {
    return new Promise(function (resolve) {
      if (!/^image\\//.test(file.type || '') && !isHeic(file)) return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
        var k = Math.min(1, 2400 / longest);
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * k);
        canvas.height = Math.round(img.naturalHeight * k);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) return resolve(file);
          var name = (file.name || 'photo').replace(/\\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.88);
      };
      // This browser cannot read it (a HEIC outside Safari): send the original.
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function post(url, params) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  }

  async function send(input) {
    var box = input.closest('.doc-box');
    var note = box.querySelector('.doc-note');
    // An error reads as an error (it was grey, like progress).
    function say(text, isError) { note.textContent = text; note.className = 'doc-note ' + (isError ? 'err' : 'muted'); }
    var file = input.files && input.files[0];
    if (!file) return;
    box.classList.add('busy');
    note.textContent = 'Preparing…';
    try {
      file = await asJpeg(file);
      var type = file.type || (isHeic(file) ? 'image/heic' : '');
      if (file.size > MAX) { say('That file is larger than 10 MB. Please send a smaller scan or photo.', true); return; }

      var params = new URLSearchParams({
        csrf: CSRF, application_id: APPLICATION, doc_type: input.dataset.type,
        filename: file.name, mime_type: type, size_bytes: String(file.size)
      });

      // 1. The server decides WHERE it goes.
      var ask = await post('/platform/my-gym/documents/request', params);
      var target = await ask.json().catch(function () { return {}; });
      if (!ask.ok) { say(target.error || 'That file was not accepted.', true); return; }

      // 2. The bytes go straight to private storage, never through our server.
      say('Uploading… a large photo can take a minute on a slow connection.');
      var put = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': type, Authorization: 'Bearer ' + target.token },
        body: file
      });
      if (!put.ok) { say('The upload did not finish. Please try again.', true); return; }

      // 3. Recorded, so a reviewer can find it.
      params.set('storage_ref', target.path);
      params.set('respond', 'json');
      var done = await post('/platform/my-gym/documents/confirm', params);
      if (!done.ok) { say('We could not record that upload. Please try again.', true); return; }

      note.textContent = 'Uploaded ✓';
      location.reload();
    } catch (err) {
      say('The upload stopped. Please check your connection and try again.', true);
    } finally {
      box.classList.remove('busy');
      input.value = '';
    }
  }

  document.querySelectorAll('.doc-box input[type=file]').forEach(function (input) {
    input.addEventListener('change', function () { send(input); });
  });
})();
</script>`,
  });
}

/**
 * Step 3 — everything the owner wrote and every document, before it is sent
 * (CLAUDE.md §42: "submit after checking that he wrote correctly"). Submit is
 * unavailable until the three documents are in, and the server refuses it too.
 */
export function applyReviewPage({
  application,
  documents = [],
  email = '',
  ownerName = '',
  plans = [],
  csrfToken = '',
  error = '',
  user = null,
} = {}) {
  const a = application;
  const plan = plans.find((p) => p.key === a.requested_plan_key);
  const missing = REQUIRED_DOCUMENTS.filter((t) => {
    const latest = latestOf(t, documents);
    return !latest || latest.status === 'rejected';
  });
  const ready = missing.length === 0;
  const fact = (label, value) => `<dt>${h(label)}</dt><dd>${value ? h(value) : '<span class="muted">not given</span>'}</dd>`;

  const docLines = [...REQUIRED_DOCUMENTS, ...OPTIONAL_DOCUMENTS]
    .map((t) => {
      const latest = latestOf(t, documents);
      const required = REQUIRED_DOCUMENTS.includes(t);
      if (!latest && !required) return '';
      const ok = latest && latest.status !== 'rejected';
      return `<li class="${ok ? 'ok' : ''}"><b>${h(DOCUMENT_LABELS[t] || t)}</b> ${
        ok
          ? `<span class="muted">· <a href="/platform/apply/documents/${h(latest.id)}" target="_blank" rel="noopener">${h(latest.filename || 'open')}</a></span>`
          : '<span class="err">· missing</span>'
      }</li>`;
    })
    .filter(Boolean)
    .join('\n    ');

  return layout({
    title: 'Check and submit',
    user,
    body: `<style>${SIGNUP_STYLE}${APPLY_STEP_STYLE}</style>
${applySteps(3)}
<h1>Check and submit</h1>
<p class="muted">Read it through once. A person reviews exactly what is below, and uses it to decide.</p>
${error ? `<p class="err" role="alert">${h(error)}</p>` : ''}

<div class="apply-card">
  <div class="review-head"><h2>You and your gym</h2><a href="/platform/apply">Edit</a></div>
  <dl class="facts">
    ${fact('Your name', ownerName)}
    ${fact('Email', email)}
    ${fact('Phone', a.owner_phone)}
    ${fact('Gym name', a.proposed_gym_name)}
    ${fact('Street address', a.gym_address)}
    ${fact('City', a.city)}
    ${fact('Country', countryName(a.country))}
    ${fact('Plan', plan?.label || a.requested_plan_key)}
    ${fact('Roughly how many members', a.estimated_members != null ? String(a.estimated_members) : '')}
    ${fact('Anything else you need', a.owner_needs)}
  </dl>
</div>

<div class="apply-card" style="margin-top:14px">
  <div class="review-head"><h2>Documents</h2><a href="/platform/apply/documents">Change</a></div>
  <ul class="checklist">
    ${docLines}
  </ul>
</div>

<form class="wide" method="post" action="/platform/apply/submit" style="margin-top:14px">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <label class="agree">
    <input type="checkbox" name="confirm" value="yes" required>
    <span>I have checked that everything above is correct, and the documents are genuine.</span>
  </label>
  <div class="submit-row"><button type="submit"${ready ? '' : ' disabled'}>Submit application</button></div>
  ${ready ? '' : `<p class="muted">Upload the missing documents first: ${h(missing.map((t) => DOCUMENT_LABELS[t] || t).join(', '))}.</p>`}
</form>`,
  });
}

// ---------------------------------------------------------------------------
// The gym registry — every gym the platform has provisioned
// ---------------------------------------------------------------------------

/**
 * The registry list.
 *
 * Deliberately shows gym METADATA only: name, city, plan, status, subscription
 * state. Never a member, never a schema name, never a connection. Support staff
 * need to see that a gym is broken without being able to read anybody's
 * personal data (D-044), and the way to guarantee that is not to render it.
 */
/**
 * Where you are in a long list, and how to move.
 *
 * Always rendered — even on a single page — because "Showing 1–7 of 7" is the
 * sentence that tells a reader the list is COMPLETE. Silence does not say
 * that; silence is what a truncated list also looks like.
 *
 * `params` are the filters in force. They are carried into every link, because
 * losing a search when you turn a page is the single most irritating thing a
 * paginated list can do.
 */
function pager(page, basePath, params = {}) {
  if (!page) return '';

  const prev = page.hasPrev
    ? `<a href="${h(pageLink(basePath, params, page.page - 1))}">← Previous</a>`
    : '<span class="muted">← Previous</span>';

  const next = page.hasNext
    ? `<a href="${h(pageLink(basePath, params, page.page + 1))}">Next →</a>`
    : '<span class="muted">Next →</span>';

  // One page and nothing to turn to: the count alone, with no dead controls.
  // A link that goes nowhere is the "dead text" this panel is meant not to
  // have.
  // The label again, with its figures grouped ("Showing 1–25 of 1 234").
  const label =
    page.total === 0
      ? 'None'
      : `Showing ${num(page.first)}–${num(page.last)}${Number.isInteger(page.total) ? ` of ${num(page.total)}` : ''}`;
  const said = Number.isInteger(page.first) && Number.isInteger(page.last) ? label : page.label;

  if (!page.hasPrev && !page.hasNext) {
    return `<p class="muted">${h(said)}</p>`;
  }

  return `<p class="muted" style="display:flex;gap:1rem;align-items:center">
  ${prev}<span>${h(said)}</span>${next}
</p>`;
}

/** A gym's counts, as a person reads them. */
const statCell = (value) => (value === null || value === undefined ? '<span class="muted">—</span>' : h(num(value)));

/**
 * Every gym, with what it is doing (CLAUDE.md §40.1 F-40.7): members,
 * check-ins this month and the last check-in, read as COUNTS ONLY (D-130).
 */
export function registryPage({ gyms = [], user = null, canSuspend = false, filter = {}, page = null, stats = null } = {}) {
  const of = (g) => (stats && typeof stats.get === 'function' ? stats.get(g.id) : null) || null;

  const body = gyms.length
    ? listTable(
        [
          ['Gym'], ['Plan'], ['Status'], ['Billing'],
          ['Active members', { num: true }], ['Check-ins this month', { num: true }], ['Last check-in'],
        ],
        gyms.map((g) => {
          const s = of(g);
          const unreachable = s && s.reachable === false;
          return [
            `<a href="/platform/registry/${h(g.id)}"><b>${h(g.search_name || g.slug)}</b></a><br><span class="muted">${h(g.city)}${
              g.country ? `, ${h(countryName(g.country))}` : ''
            }</span>`,
            g.plan_key ? h(planName(g.plan_key)) : '—',
            statusTag(g.status),
            statusTag(g.subscription_status || 'none'),
            unreachable ? '<span class="tag tag--bad">unreachable</span>' : statCell(s?.activeMembers),
            unreachable ? '' : statCell(s?.checkinsThisMonth),
            { html: s?.lastActivityAt ? h(when(s.lastActivityAt)) : unreachable ? '' : 'none yet', cls: 'muted' },
          ];
        })
      )
    : `<div class="empty">${filter.query || filter.status ? 'No gyms match that search.' : 'No gyms have been set up yet.'}</div>`;

  // With a search or a filter the total is what MATCHED, not the platform.
  const filtered = Boolean(filter.query || filter.status || filter.setup);
  const summary =
    page && page.total !== null
      ? `${tally(page.total, 'gym')} ${filtered ? (page.total === 1 ? 'matches' : 'match') : 'on the platform'}.`
      : `${tally(gyms.length, 'gym')} shown.`;

  return layout({
    active: 'registry',
    title: 'Gyms',
    user,
    body: `<h1>Gyms</h1>
<p class="lede">${canSuspend ? '' : 'You have read-only access. '}Figures are counts only — the platform never
reads a member's name, phone or health answers.</p>
${filter.setup ? '<p class="card">Showing gyms <b>waiting for setup help</b>. <a href="/platform/registry">Show all gyms</a></p>' : ''}

${liveSearch({
  action: '/platform/registry',
  regions: ['registry-list'],
  // A search inside "waiting for setup help" stays inside it.
  hidden: filter.setup ? '<input type="hidden" name="setup" value="1">\n  ' : '',
  fields: `<label class="grow">Search by gym name, city or web address<input type="search" name="q" value="${h(filter.query)}" autocomplete="off"></label>
  <label>Status
    <select name="status">
      <option value="">Any</option>
      ${['pending', 'active', 'suspended', 'cancelled']
        .map((v) => `<option value="${v}"${filter.status === v ? ' selected' : ''}>${v === 'pending' ? 'Not activated yet' : v[0].toUpperCase() + v.slice(1)}</option>`)
        .join('')}
    </select>
  </label>`,
})}
<p><a class="btn ghost" href="/platform/reconcile">Check gyms are in sync</a></p>
<div id="registry-list" data-summary="${h(summary)}">
<p class="muted">${h(summary)}</p>
${body}
${pager(page, '/platform/registry', { q: filter.query, status: filter.status, setup: filter.setup ? '1' : '' })}
</div>`,
  });
}

/**
 * One gym's services (CLAUDE.md §41.1 Q2): what its plan gives, what the
 * platform added or took away for this gym alone, and the result — the same
 * rule the gym's API applies (shared/features.js effectiveFeatures).
 */
function gymServicesCard({ gym, plan, canBill, csrfToken }) {
  const planFeatures = Array.isArray(plan?.features) ? plan.features : [];
  const added = Array.isArray(gym.features_added) ? gym.features_added : [];
  const removed = Array.isArray(gym.features_removed) ? gym.features_removed : [];
  const result = new Set(effectiveFeatures(planFeatures, added, removed));
  const switchable = ALL_SERVICES.filter((f) => SERVICE_INFO[f].group !== 'core');

  const table = listTable(
    [['Service'], ['Plan'], ['For this gym'], ['Result']],
    switchable.map((f) => {
      const choice = added.includes(f) ? 'add' : removed.includes(f) ? 'remove' : 'plan';
      const fromPlan = planFeatures.includes(f);
      return [
        `<b>${h(SERVICE_INFO[f].label)}</b>${SERVICE_INFO[f].forMembers ? `<br><span class="muted">${h(SERVICE_INFO[f].forMembers)}</span>` : ''}`,
        fromPlan ? statusTag('included') : '<span class="muted">not in plan</span>',
        canBill
          ? `<select name="svc_${h(f)}" aria-label="${h(SERVICE_INFO[f].label)} for this gym">
          <option value="plan"${choice === 'plan' ? ' selected' : ''}>As the plan says</option>
          <option value="add"${choice === 'add' ? ' selected' : ''}>Add for this gym</option>
          <option value="remove"${choice === 'remove' ? ' selected' : ''}>Remove for this gym</option>
        </select>`
          : h({ plan: 'As the plan says', add: 'Added for this gym', remove: 'Removed for this gym' }[choice]),
        result.has(f) ? statusTag('on') : statusTag('off'),
      ];
    })
  );

  return canBill
    ? `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/services">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Services for this gym</h2>
  <p class="muted">The plan decides, unless you add or remove a service for this gym alone — a trial of face
  recognition, say. Always included: ${h(CORE_FEATURES.map((f) => SERVICE_INFO[f].label).join(', '))}. The owner can
  still switch member services off for their own members.</p>
  ${table}
  <button type="submit" class="ghost">Save services</button>
</form>`
    : `<div class="card"><h2>Services for this gym</h2>${table}</div>`;
}

/** The gym's named Yoyo contact (§41.1 Q6). */
function accountManagerCard({ gym, staff, canManage, csrfToken, manager }) {
  if (!canManage) return '';
  const current = gym.account_manager_id || '';
  return `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/account-manager">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Account manager</h2>
  <p class="muted">${
    gym.plan_key === 'prime'
      ? 'Prime gyms are promised a named Yoyo contact who checks in monthly. The owner sees this name and email on their page.'
      : 'Account managers are promised on Prime. You can still name one for this gym.'
  }</p>
  <label>Who looks after this gym
    <select name="staff_id">
      <option value="">Nobody yet</option>
      ${staff
        .map((m) => `<option value="${h(m.id)}"${m.id === current ? ' selected' : ''}>${h(m.full_name || m.email)}</option>`)
        .join('')}
    </select>
  </label>
  ${manager ? `<p class="muted">Now: <b>${h(manager.full_name || manager.email)}</b></p>` : ''}
  <button type="submit" class="ghost">Save account manager</button>
</form>`;
}

/** Setup help the owner asked for, and whether it was given (§41.1 Q6). */
function setupHelpCard({ gym, canOnboard, csrfToken, lead = false }) {
  if (!gym.setup_help_requested_at && !gym.setup_help_done_at) return '';
  if (gym.setup_help_done_at) {
    return `<div class="card"><h2>Setup help</h2><p>${statusTag('done')} Given ${h(when(gym.setup_help_done_at))}.</p></div>`;
  }
  return `<div class="card tone-warn">
  <h2>The owner asked for setup help</h2>
  <p class="muted">Asked ${h(when(gym.setup_help_requested_at))}. Help them set their plans and prices, import their members
  and print their QR posters, then record it here.</p>
  ${
    canOnboard
      ? `<form method="post" action="/platform/registry/${h(gym.id)}/setup-done">
    <input type="hidden" name="csrf" value="${h(csrfToken)}">
    <button type="submit"${lead ? '' : ' class="ghost"'}>Mark setup help as given</button>
  </form>`
      : ''
  }
</div>`;
}

/** One gym: what it is, who runs it, what it does, what it pays — and the controls. */
export function gymDetailPage({
  gym,
  subscription = null,
  invoices = [],
  owner = null,
  plan = null,
  application = null,
  user = null,
  csrfToken = '',
  canSuspend = false,
  canBill = false,
  canOnboard = false,
  canManage = false,
  staff = [],
  plans = [],
  stats = null,
  notice = '',
}) {
  const suspended = gym.status === 'suspended';
  const limit = plan?.max_active_members ?? null;
  // The plan as a person names it (design critique 2026-09-29).
  const planLabel = gym.plan_key ? plan?.label || planName(gym.plan_key, plans) : '';
  const showResend = Boolean(canOnboard && gym.status === 'pending' && gym.owner_user_id);

  // ONE lime button on the page: whatever this gym most needs next. Every
  // other save is outlined (design critique 2026-09-29).
  const lead =
    suspended && canSuspend
      ? 'reactivate'
      : showResend
        ? 'resend'
        : gym.setup_help_requested_at && !gym.setup_help_done_at && canOnboard
          ? 'setup'
          : null;

  // The control is rendered only for someone who may use it. Hiding a button
  // is not the security boundary — the router checks the permission again —
  // but offering a control that will be refused is its own kind of lie.
  const controls = canSuspend
    ? `<form class="card${suspended ? '' : ' tone-bad'}" method="post" action="/platform/registry/${h(gym.id)}/${
        suspended ? 'reactivate' : 'suspend'
      }">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>${suspended ? 'Reactivate this gym' : 'Suspend this gym'}</h2>
  <p class="muted">${
    suspended
      ? 'Members and staff will be able to sign in again within a minute.'
      : 'Members and staff will be locked out within a minute — on the app and on every web address. <b>No data is deleted.</b>'
  }</p>
  <label>Reason<input name="reason" placeholder="Why?" ${suspended ? '' : 'required'}></label>
  <button type="submit"${suspended ? '' : ' class="danger"'}>${suspended ? 'Reactivate' : 'Suspend'}</button>
</form>`
    : '';

  // Links last 10 minutes and one goes out a day, whoever asks (CLAUDE.md
  // §43.1 Q1) — this said 48 hours.
  const resend = showResend
    ? `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/resend-activation">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>The owner has not activated yet</h2>
  <p class="muted">The gym opens when the owner uses the link and code from their activation email. A link lasts
  10 minutes, and one can be sent a day. If it was lost or ran out, send a new one; if a link already went out
  today, you are told when the next can be sent.</p>
  <button type="submit"${lead === 'resend' ? '' : ' class="ghost"'}>Send a new activation link</button>
</form>`
    : '';

  const bills = invoices.length
    ? listTable(
        [['Invoice'], ['Amount', { num: true }], ['Status'], ['Issued']],
        invoices.map((i) => [
          h(i.number),
          h(amount(i.amount_cents, i.currency || 'ZAR')),
          statusTag(i.status),
          { html: h(when(i.issued_at)), cls: 'muted' },
        ])
      )
    : `<div class="empty">No invoices yet.</div>`;

  const activity = stats
    ? stats.reachable
      ? `${kpiRow([
          `<div class="kpi"><div class="lbl">Active members</div><div class="val">${h(num(stats.activeMembers))}</div>
    <div class="sub">${limit ? `of ${h(num(limit))} on ${h(planLabel)}` : 'no plan limit'}</div></div>`,
          `<div class="kpi"><div class="lbl">Check-ins this month</div><div class="val">${h(num(stats.checkinsThisMonth))}</div></div>`,
          `<div class="kpi"><div class="lbl">Last check-in</div><div class="val" style="font-size:18px">${
            stats.lastActivityAt ? h(when(stats.lastActivityAt)) : 'none yet'
          }</div></div>`,
          `<div class="kpi"><div class="lbl">Subscription</div><div class="val" style="font-size:18px">${
            subscription ? statusTag(subscription.status) : statusTag('none')
          }</div></div>`,
        ])}
<p class="muted"><b>Counts only.</b> The platform never reads a member's name, phone,
ID or health answers — only how many there are. Every one of these reads is
written to the audit log with your name on it.</p>`
      : `<div class="card tone-bad"><p>⚠️ This gym's data could not be reached, so there are no counts.
         That is worth looking into — it usually means the gym is not serving traffic either.</p></div>`
    : '';

  return layout({
    active: 'registry',
    title: gym.search_name || gym.slug,
    user,
    body: `<p><a href="/platform/registry">← All gyms</a></p>
<h1>${h(gym.search_name || gym.slug)}</h1>
<p class="row">${statusTag(gym.status)} <span class="tag">${h(planLabel || 'no plan')}</span>
<span class="muted">${h(gym.city)}${gym.country ? `, ${h(countryName(gym.country))}` : ''}</span></p>
${notice ? `<div class="card tone-good">${h(notice)}</div>` : ''}

${activity}

<div class="grid2">
<div class="card">
  <h2>Owner</h2>
  ${
    owner
      ? `<dl class="facts">
    <dt>Name</dt><dd>${h(owner.full_name || '—')}</dd>
    <dt>Email</dt><dd><a href="mailto:${h(owner.email)}">${h(owner.email)}</a></dd>
    <dt>Phone</dt><dd>${
      application?.owner_phone ? `<a href="tel:${h(application.owner_phone)}">${h(application.owner_phone)}</a>` : '<span class="muted">not given</span>'
    }</dd>
    <dt>Account</dt><dd>${statusTag(owner.is_active === false ? 'switched off' : 'active')}</dd>
    <dt>Last sign-in</dt><dd class="muted">${owner.last_login_at ? h(when(owner.last_login_at)) : 'not yet'}</dd>
  </dl>
  <p><a href="/platform/owners?q=${h(encodeURIComponent(owner.email))}">Manage this owner →</a></p>`
      : '<p class="muted">No owner is recorded for this gym.</p>'
  }
</div>
<div class="card">
  <h2>Gym</h2>
  <dl class="facts">
    <dt>Web address</dt><dd>/g/${h(gym.slug)}/</dd>
    <dt>Admin sign-in</dt><dd><a href="${h(gymAdminPath(gym.slug))}" target="_blank" rel="noopener">${h(gymAdminPath(gym.slug))}</a></dd>
    <dt>Plan</dt><dd>${h(planLabel || '—')}${
      plan && Number.isInteger(plan.price_cents) ? ` <span class="muted">· ${h(amount(plan.price_cents, plan.currency || 'ZAR'))} a month</span>` : ''
    }</dd>
    <dt>On the platform since</dt><dd class="muted">${h(when(gym.created_at)) || '—'}</dd>
    ${application?.id ? `<dt>Application</dt><dd><a href="/platform/applications/${h(application.id)}">Open →</a></dd>` : ''}
  </dl>
</div>
</div>

<div class="card">
  <h2>Subscription</h2>
  ${
    subscription
      ? `<p>${statusTag(subscription.status)} on <b>${h(planLabel || '—')}</b></p>
  <p class="muted">Trial ends ${h(when(subscription.trial_ends_at))} · Period ends ${h(when(subscription.current_period_end))}</p>`
      : `<p class="muted">No subscription record.</p>`
  }
</div>

${resend}

${setupHelpCard({ gym, canOnboard, csrfToken, lead: lead === 'setup' })}

${gymServicesCard({ gym, plan, canBill, csrfToken })}

${accountManagerCard({ gym, staff, canManage, csrfToken, manager: staff.find((m) => m.id === gym.account_manager_id) || null })}

${
  canBill && plans.length
    ? `<form class="card" method="post" action="/platform/registry/${h(gym.id)}/plan">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Move to another plan</h2>
  <label>Plan
    <select name="plan_key">
      ${plans
        .map(
          (p) => `<option value="${h(p.key)}"${p.key === gym.plan_key ? ' selected' : ''}>${h(p.label)}</option>`
        )
        .join('')}
    </select>
  </label>
  <p class="muted"><b>A downgrade never deletes members.</b> Existing members stay; only new
  registrations stop once the gym is over the new plan's limit. The change applies from the next
  billing date — nobody is re-billed for this month.</p>
  <button type="submit" class="ghost">Change plan</button>
</form>`
    : ''
}

<h2>Invoices</h2>
${bills}

${controls}`,
  });
}

/** Cents to something a person reads. Never rounds silently to a whole rand. */
function money(cents, currency = 'ZAR') {
  if (!Number.isFinite(Number(cents))) return '—';
  return `${h(currency)} ${(Number(cents) / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Public: how a member finds their gym
// ---------------------------------------------------------------------------

/**
 * The member-facing gym finder (D-036).
 *
 * This is the one platform page a member ever sees. It is a thin shell over
 * GET /platform/gyms, which returns only public metadata — so even a bug here
 * cannot leak one gym's data to another gym's member.
 *
 * Location is OPTIONAL and asked for, never taken. A member who declines still
 * gets a working search by name, because "allow location" is a question many
 * people answer no to, and the answer must not break the product.
 */
/**
 * Where a picked gym leads, by what the person came to do (CLAUDE.md §36 on
 * the web). A fixed list: the value only ever chooses one of these paths.
 */
const FINDER_NEXT = {
  join: { title: 'Join a gym', sub: 'Find the gym you want to join, then register with them.', path: '/register' },
  signin: { title: 'Member sign in', sub: 'Find your gym, then sign in with your membership number and phone.', path: '/member' },
  // The STAFF door: a gym's own sign-in. Owners have their own door,
  // /owner/login, which finds their gym for them (design critique 2026-09-29).
  admin: {
    title: 'Gym staff sign in',
    sub: 'Choose your gym, then sign in with your email or username and password. Gym owners can use the owner sign-in instead.',
    path: '/admin/login',
  },
};

export function finderPage({ next = '' } = {}) {
  const go = FINDER_NEXT[next] || { title: 'Find your gym', sub: 'Search by name, or use your location to see the closest gyms first.', path: '' };
  return layout({
    title: go.title,
    indexable: !FINDER_NEXT[next],
    body: `<p><a href="/platform/welcome">← Back</a></p>
<h1>${h(go.title)}</h1>
<p class="lede">${h(go.sub)}${next === 'admin' ? ' <a href="/owner/login">Gym owner sign-in</a>' : ''}</p>

<form class="card" id="finder" onsubmit="return false">
  <label>Gym name<input id="q" name="q" placeholder="e.g. BOS GYM" autocomplete="off"></label>
  <button type="button" id="near">Use my location</button>
  <p class="muted" id="note"></p>
</form>

<div id="results"><div class="empty">Start typing to search.</div></div>

<script>
(function () {
  var NEXT_PATH = ${JSON.stringify(go.path)};
  var q = document.getElementById('q');
  var out = document.getElementById('results');
  var note = document.getElementById('note');
  var coords = null;
  var timer = null;

  // Escaped here as well as on the server: this inserts a gym's name into the
  // page, and a gym name is text somebody typed.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(gyms) {
    if (!gyms.length) {
      out.innerHTML = '<div class="empty">No gyms found. Ask your gym if they are on Yoyo Gyms yet.</div>';
      return;
    }
    out.innerHTML = gyms.map(function (g) {
      var where = [g.city, g.country].filter(Boolean).map(esc).join(', ');
      var far = g.distance_km == null ? '' : ' · ' + esc(g.distance_km) + ' km away';
      return '<a class="card block" href="/g/' + encodeURIComponent(g.slug) + NEXT_PATH + '">' +
        '<b>' + esc(g.name) + '</b><br><span class="muted">' + where + far + '</span></a>';
    }).join('');
  }

  function search() {
    var params = new URLSearchParams();
    if (q.value.trim()) params.set('q', q.value.trim());
    if (coords) { params.set('lat', coords.lat); params.set('lng', coords.lng); }
    if (!params.toString()) return;

    fetch('/platform/gyms?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (d) { render(d.gyms || []); })
      .catch(function () { out.innerHTML = '<div class="empty">Could not search just now.</div>'; });
  }

  // Debounced: one request per pause in typing, not one per keystroke.
  q.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(search, 250);
  });

  document.getElementById('near').addEventListener('click', function () {
    if (!navigator.geolocation) { note.textContent = 'Your browser cannot share a location.'; return; }
    note.textContent = 'Asking for your location…';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        coords = { lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) };
        note.textContent = 'Showing the closest gyms first.';
        search();
      },
      function () {
        // Declining is a normal answer, not an error to complain about.
        note.textContent = 'No problem — search by name instead.';
      }
    );
  });
})();
</script>`,
  });
}

/**
 * The drift report, on demand.
 *
 * Findings are written as plain sentences rather than a table of codes,
 * because the person reading this is deciding whether to touch a database by
 * hand, and "gym_ghost" on its own tells them nothing about what is at stake.
 */
export function driftPage({ report, user = null, csrfToken = '' }) {
  const list = (items, render) =>
    items.length ? `<ul>${items.map(render).join('')}</ul>` : '<div class="empty">None.</div>';

  return layout({
    active: 'registry',
    // "Drift" and "schema" are the builder's words; the page says what they
    // mean, keeping each schema's name for whoever goes to fix it (design
    // critique 2026-09-29).
    title: 'Gym sync check',
    user,
    body: `<p><a href="/platform/registry">← All gyms</a></p>
<h1>Are the gyms in sync?</h1>
<p class="muted">Checks that every gym on the list has its own store of data (its database schema), and
that no store is left behind without a gym. This check <b>never changes anything</b>.</p>

${report ? `<p>${report.ok ? '✅ Every gym is in sync.' : '⚠️ Something is out of step — see below.'}
  Checked the data of ${h(tally(report.checkedSchemas, 'gym'))}.</p>

<h2>Data that no gym owns</h2>
${list(report.orphans || [], (o) => `<li><b>${h(o.schema_name)}</b> — ${h(o.risk)}<br>
  <span class="muted">${h(o.likely_cause)}. ${h(o.next_step)}</span></li>`)}

<h2>Gyms whose data is missing</h2>
${list(report.dangling || [], (d) => `<li><b>${h(d.gym_id)}</b> → ${h(d.schema_name)}<br>
  <span class="muted">${h(d.impact)}</span></li>`)}` : ''}

<form class="card" method="post" action="/platform/reconcile">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <button type="submit">Check again</button>
</form>`,
  });
}

// ---------------------------------------------------------------------------
// Owner activation
// ---------------------------------------------------------------------------

/**
 * The activation form.
 *
 * The token arrives in the URL and is carried in a hidden field. The code is
 * typed, because the whole purpose of the second half is that it is not in the
 * link — putting it in the URL too would make it decoration.
 */
export function activatePage({ token = '', gymName = '', error = '', code = '', email = '', expired = false } = {}) {
  if (expired) {
    return layout({
      title: 'Activate your account',
      body: `<h1>This link has expired</h1>
<p class="lede">Activation links and codes work for 10 minutes. You can receive one link a day.</p>
<form class="card" method="post" action="/platform/activate/renew">
  <input type="hidden" name="token" value="${h(token)}">
  <p>We will email a new link and code to the address you applied with.</p>
  <button type="submit">Send me a new link</button>
</form>`,
    });
  }
  return layout({
    title: 'Activate your account',
    body: `<h1>Activate your account</h1>
<p class="lede">${
      gymName
        ? `Your gym <b>${h(gymName)}</b> has been approved.`
        : 'Your gym has been approved.'
    } Enter the six-digit code from your email and choose a password. The link and code work for
    <b>10 minutes</b>.</p>
${error ? `<p class="err" role="alert">${h(error)}</p>` : ''}

<form class="card" method="post" action="/platform/activate">
  <input type="hidden" name="token" value="${h(token)}">
  ${
    // THE BROWSER'S SAVED PASSWORD. The owner chose a password when applying,
    // and the browser saved it for this site. Without a username beside the
    // new password it could not tell which saved login this replaces, so it
    // kept the OLD one — and filled it into the gym sign-in, which refused it
    // (2026-09-29). Named here, the browser offers to update it instead.
    email ? `<input type="text" name="username" value="${h(email)}" autocomplete="username" readonly hidden>` : ''
  }
  <label>Six-digit code
    <input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required
           autocomplete="one-time-code" value="${h(code)}">
  </label>
  <label>Choose a password
    <input type="password" name="password" required minlength="10" autocomplete="new-password">
  </label>
  <p class="muted">At least 10 characters. <b>This becomes your one password</b>, for your Yoyo Gyms account and your
  gym admin panel, and it <b>replaces the one you chose when you applied</b>. Type it yourself: if your browser
  offers a saved password here, that is the old one.</p>
  <label class="agree">
    <input type="checkbox" name="accept_terms" value="yes" required>
    <span>I have read and accept the <a href="/platform/terms" target="_blank" rel="noopener">Gym Owner Agreement</a>.</span>
  </label>
  <button type="submit">Activate</button>
</form>`,
  });
}

/** Activation done. Says plainly what is true, including what is not yet true. */
export function activateSuccessPage({ gymActivated = false, gymSlug = '', gymUsername = '', ownerRef = '' } = {}) {
  // THE TWO ACCOUNTS, SAID PLAINLY.
  //
  // An owner now has a platform login (their email — billing, documents, the
  // subscription) and a gym login (a username — members, check-ins, classes).
  // Two logins nobody explained is two support emails, so this page names
  // both, here, at the one moment the owner is looking.
  const gymLogin =
    gymActivated && gymSlug && gymUsername
      ? `<div class="card">
  <h2>Running your gym</h2>
  <p>Your gym's own panel is where you add members, take check-ins and record payments.</p>
  <p>Sign in there as <b>${h(gymUsername)}</b> (or with your email), using the password you <b>just chose</b> —
  not the one from your application, which it replaced.</p>
  <p><a href="${h(gymAdminPath(gymSlug))}">Open your gym admin panel →</a></p>
  <p class="muted">You can change that password, and add staff, from Settings inside the panel.</p>
</div>`
      : '';

  return layout({
    title: 'Account activated',
    body: `<div class="card">
  <h1>Your account is active</h1>
  ${ownerRef ? `<p>Your <b>Owner ID</b> is <b style="font-size:1.2em;letter-spacing:.05em">${h(ownerRef)}</b>. Keep it, and quote it whenever you contact us.</p>` : ''}
  <p>You can now sign in with your email and the password you just chose. Your signed
  <b>Gym Owner Agreement</b> is on your owner page as a PDF, to download any time.</p>
  ${
    gymActivated
      ? `<p><b>Your gym is open.</b> Your members can find it and sign in from now on.</p>
         <p class="muted">Your free trial has started. We will email you before it ends.</p>`
      : `<p class="muted">Your gym is not open to members yet. We will email you when it is.</p>`
  }
  <p><a class="btn" href="/owner/login">Sign in</a></p>
</div>
${gymLogin}`,
  });
}

// ---------------------------------------------------------------------------
// The gym owner's own page
// ---------------------------------------------------------------------------

/**
 * What a gym owner sees after signing in to the PLATFORM.
 *
 * This is deliberately NOT where they run their gym. Members, check-ins,
 * payments and classes all live in their own gym admin panel, which is the
 * existing single-gym system and is untouched by any of this (§32). This page
 * is only the things that are between the owner and Yoyo Gyms: the
 * application, the documents, the subscription, and the way in.
 */
/**
 * What an owner is told about their application, in words (CLAUDE.md §40.1
 * F-40.5). The reviewer's request and the reason for a refusal used to live
 * only on the staff screen; the owner saw a status word and nothing else.
 */
function ownerApplicationText(application) {
  switch (application.status) {
    case 'draft':
      return `<p><b>Your application has not been sent yet.</b> Upload your three documents, check what
  you wrote, and submit it — then a person reviews it.</p>
  <p><a class="btn" href="/platform/apply/documents">Continue your application →</a></p>`;
    case 'info_requested':
      return `<p><b>We need something more from you:</b> ${h(application.review_notes) || 'please check your email.'}</p>
  <p class="muted">Upload it below and the review carries on straight away.</p>`;
    case 'rejected':
      return `<p><b>Your application was not approved.</b>${
        application.decision_reason ? ` Reason: ${h(application.decision_reason)}` : ''
      }</p>
  <p class="muted">You are welcome to apply again once that is resolved.</p>
  <p><a class="btn" href="/platform/apply">Apply again</a></p>`;
    default:
      return `<p class="muted">A person is reviewing your application. Upload the three documents below —
  your gym is approved once each has been checked. We email you as soon as there is a decision.</p>`;
  }
}

/** One required document, as the owner sees it. */
function ownerRequiredLine(type, documents) {
  const ofType = documents.filter((d) => d.doc_type === type);
  const accepted = ofType.some((d) => d.status === 'accepted');
  const state = accepted
    ? 'checked'
    : ofType.some((d) => d.status === 'pending')
      ? 'received — being checked'
      : ofType.length
        ? 'not accepted — please upload a new one'
        : 'please upload';
  return `<li class="${accepted ? 'ok' : ''}"><b>${h(DOCUMENT_LABELS[type] || type)}</b> <span class="muted">· ${h(state)}</span></li>`;
}

/**
 * The owner's Yoyo Gyms plan: the plan, its monthly fee, where they stand, and
 * the one Pay button (CLAUDE.md §48). The gym's own admin panel shows the same,
 * from the same rules (shared/yoyo-plan.js).
 *
 * Inside the store app: the plan and where they stand only — no price and no
 * Pay button (§48.1 Q2, §46.1 Q4).
 */
function yoyoPlanBlock({ subscription, plan, standing, inApp, csrfToken, payUrgent }) {
  const fee = planFee(plan?.price_cents, plan?.currency);
  const words = planWords({ ...standing, paidFrom: subscription.current_period_start }, { inApp, priced: Boolean(fee) });
  const statusLine = words.status;
  const note = words.note;
  const label = words.button;

  return `<h2 style="margin-top:18px">Your Yoyo Gyms plan</h2>
  <dl class="facts">
    <dt>Plan</dt><dd>${h(plan?.label || 'Not set')}</dd>
    ${inApp ? '' : `<dt>Monthly fee</dt><dd>${fee ? h(fee) : 'Not set yet — we will tell you before anything is charged'}</dd>`}
    <dt>Status</dt><dd>${h(statusLine)}</dd>
  </dl>
  ${note ? `<p class="muted">${h(note)}</p>` : ''}
  ${
    !inApp && standing.canPay && fee
      ? `<form method="post" action="/platform/my-gym/pay">
      <input type="hidden" name="csrf" value="${h(csrfToken)}">
      <button type="submit"${payUrgent ? '' : ' class="ghost"'}>${label}</button>
      <p class="muted">You will be taken to Paystack. We never see or store your card, only a token that
      lets us take the same amount next month.</p>
    </form>`
      : ''
  }
  ${
    !inApp && subscription.card_last4
      ? `<p class="muted">Saved card: ${h(cardText(subscription.card_brand, subscription.card_last4))}.</p>`
      : ''
  }`;
}

export function ownerDashboardPage({
  user = null,
  application = null,
  gym = null,
  subscription = null,
  documents = [],
  csrfToken = '',
  closureRequestedAt = null,
  ownerRef = '',
  inApp = false,
  support = null,
  planSupport = null,
  plan = null,
  now = new Date(),
} = {}) {
  // THE OWNER'S NEXT STEP is the one lime button on the page; everything else
  // is secondary. "Pay now" was lime while opening the gym — the main task —
  // was a text link (design critique 2026-09-29).
  const standing = planStanding(subscription, now);
  const payUrgent = ['due', 'suspended', 'trial_ended'].includes(standing.state);
  const openGym = gym?.status === 'active' && !payUrgent;
  const docsNeeded =
    Boolean(application && ['submitted', 'under_review', 'info_requested'].includes(application.status)) &&
    (application.status === 'info_requested' ||
      REQUIRED_DOCUMENTS.some((t) => !documents.some((d) => d.doc_type === t && ['accepted', 'pending'].includes(d.status))));

  // What Yoyo Gyms promises this owner, and how to reach it (§41.1 Q6, Q7).
  const prime = gym?.plan_key === 'prime';
  const supportCard =
    gym && planSupport
      ? `<div class="card">
  <h2>Your support</h2>
  <ul class="checklist">${planSupport.map((p) => `<li class="ok">${h(p)}</li>`).join('')}</ul>
  <dl class="facts" style="margin-top:14px">
    <dt>Email</dt><dd><a href="mailto:${h(support?.email || 'hello@mulesoo.com')}">${h(support?.email || 'hello@mulesoo.com')}</a></dd>
    ${
      prime && support?.whatsapp
        ? `<dt>WhatsApp</dt><dd><a href="https://wa.me/${h(support.whatsapp.replace(/^\+/, ''))}" target="_blank" rel="noopener">${h(support.whatsapp)}</a></dd>`
        : ''
    }
    ${
      support?.manager
        ? `<dt>Your account manager</dt><dd>${h(support.manager.full_name || '')} · <a href="mailto:${h(support.manager.email)}">${h(support.manager.email)}</a></dd>`
        : prime
          ? '<dt>Your account manager</dt><dd class="muted">Being assigned — they will introduce themselves.</dd>'
          : ''
    }
  </dl>
  ${
    support?.setupDoneAt
      ? `<p class="muted">Setup help given ${h(when(support.setupDoneAt))}.</p>`
      : support?.setupRequestedAt
        ? `<p>You asked for setup help ${h(when(support.setupRequestedAt))}. We will be in touch.</p>`
        : `<form method="post" action="/platform/my-gym/setup-help" style="margin-top:14px">
    <input type="hidden" name="csrf" value="${h(csrfToken)}">
    <button type="submit" class="ghost">Ask for setup help</button>
    <p class="muted">We help you set your plans and prices, move your members across and print your QR posters.</p>
  </form>`
  }
</div>`
      : '';
  // The owner's ID and their signed agreement, once there is a gym to agree
  // about. The PDF is built fresh each time from the account and the audit
  // log, so it always matches what was accepted.
  const agreementCard = gym
    ? `<div class="card">
  <h2>Your agreement</h2>
  <p>Owner ID: <b style="letter-spacing:.05em">${h(ownerRef)}</b></p>
  <p><a href="/platform/my-gym/agreement.pdf">Download your Gym Owner Agreement (PDF) →</a></p>
  <p class="muted"><a href="/platform/terms">Read the agreement online</a></p>
</div>`
    : '';
  const docRows = documents.length
    ? `<table>
  <thead><tr><th>Document</th><th>File</th><th>Status</th></tr></thead>
  <tbody>
${documents
  .map(
    (d) => `    <tr><td>${h(readableDocType(d.doc_type))}</td><td>${h(d.filename)}</td>
      <td>${statusTag(d.status)}${d.reject_reason ? ` <span class="muted">${h(d.reject_reason)}</span>` : ''}</td></tr>`
  )
  .join('\n')}
  </tbody>
</table>`
    : `<div class="empty">Nothing uploaded yet.</div>`;

  // The upload form only appears while there is an application to attach to.
  const upload = application && application.status !== 'draft'
    ? `<form class="card" id="doc-form">
  <h2>Send a document</h2>
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <input type="hidden" name="application_id" value="${h(application.id)}">
  <label>What is it?
    <select name="doc_type">
      <option value="id_document">Your ID (required)</option>
      <option value="business_registration">Business registration (required)</option>
      <option value="proof_of_address">Proof of the gym's address (required)</option>
      <option value="tax_clearance">Tax clearance</option>
      <option value="insurance">Insurance</option>
      <option value="lease_agreement">Lease agreement</option>
      <option value="other_supporting">Something else</option>
    </select>
  </label>
  <label>File<input type="file" name="file" accept=".pdf,image/jpeg,image/png,image/webp,image/heic" required></label>
  <p class="muted">PDF or a photo, up to 10 MB. We look at every document by hand.</p>
  <button type="submit"${docsNeeded ? '' : ' class="ghost"'}>Upload</button>
  <p class="muted" id="upload-note" aria-live="polite"></p>
</form>

<script>
(function () {
  var form = document.getElementById('doc-form');
  var note = document.getElementById('upload-note');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var file = form.file.files[0];
    if (!file) return;

    note.textContent = 'Preparing…';
    var common = new URLSearchParams({
      csrf: form.csrf.value,
      application_id: form.application_id.value,
      doc_type: form.doc_type.value,
      filename: file.name,
      mime_type: file.type,
      size_bytes: String(file.size)
    });

    try {
      // 1. Ask the server WHERE to put it. The server decides the path.
      var ask = await fetch('/platform/my-gym/documents/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: common.toString()
      });
      var target = await ask.json();
      if (!ask.ok) { note.textContent = target.error || 'That file was not accepted.'; return; }

      // 2. Send the bytes straight to storage — never through our function.
      note.textContent = 'Uploading…';
      var put = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, Authorization: 'Bearer ' + target.token },
        body: file
      });
      if (!put.ok) { note.textContent = 'The upload did not finish. Please try again.'; return; }

      // 3. Tell the server it is there, so a reviewer can find it.
      var done = document.createElement('form');
      done.method = 'post';
      done.action = '/platform/my-gym/documents/confirm';
      var fields = Object.assign({}, Object.fromEntries(common), { storage_ref: target.path });
      Object.keys(fields).forEach(function (k) {
        var input = document.createElement('input');
        input.type = 'hidden'; input.name = k; input.value = fields[k];
        done.appendChild(input);
      });
      document.body.appendChild(done);
      done.submit();
    } catch (err) {
      note.textContent = 'Something went wrong. Please try again.';
    }
  });
})();
</script>`
    : '';

  const status = gym
    ? `<div class="card">
  <h2>${h(gym.search_name || application?.proposed_gym_name || 'Your gym')}</h2>
  <p>${statusTag(gym.status)}${subscription ? ` · ${statusTag(subscription.status)}` : ''}</p>
  ${
    gym.status === 'active'
      ? `<p><a class="btn${openGym ? '' : ' ghost'}" href="${h(gymAdminPath(gym.slug))}">Open your gym admin panel</a></p>
         <p class="muted">That is where you manage members, check-ins, payments and classes. Sign in with your
         email, or as <b>${h(OWNER_USERNAME)}</b>, and the password you chose when you activated.</p>`
      : `<p class="muted">Your gym is not open yet. We will email you the moment it is.</p>`
  }
  ${subscription ? yoyoPlanBlock({ subscription, plan, standing, inApp, csrfToken, payUrgent }) : ''}
</div>`
    : application
      ? `<div class="card">
  <h2>${h(application.proposed_gym_name)}</h2>
  <p>${statusTag(application.status)}</p>
  ${ownerApplicationText(application)}
  ${
    application.status === 'rejected'
      ? ''
      : `<h2 style="margin-top:18px">Before your gym can be approved</h2>
  <ul class="checklist">
    ${REQUIRED_DOCUMENTS.map((t) => ownerRequiredLine(t, documents)).join('\n    ')}
  </ul>`
  }
</div>`
      : `<div class="empty">No application found for this account.</div>`;

  // Closing the account. Required by both stores, and ordinary decency: a
  // person who wants to leave should not have to find an email address.
  // Recorded, not instant — closing an account closes a gym with members in
  // it, and the page says exactly what happens next.
  // Finished within 30 days (CLAUDE.md §46.1 Q3; both stores require it).
  const closure = closureRequestedAt
    ? `<div class="card">
  <h2>Closing your account</h2>
  <p>You asked to close your account on ${h(when(closureRequestedAt))}. It will be closed by
  <b>${h(until(closeBy(closureRequestedAt).toISOString()))}</b>, sooner if Yoyo Gyms does it first, and
  you will get an email when it is done.</p>
</div>`
    : `<details class="card">
  <summary>Close my account</summary>
  <p>Your account is closed within 30 days, and you get an email when it is done. Your gym is closed to
  its members and staff, your sign-in is switched off, and your personal details are erased from your
  account. Your gym's data, including the documents you sent, is kept for 90 days in case you change
  your mind, then deleted. <b>Download anything you want to keep first.</b></p>
  <form method="post" action="/platform/my-gym/close">
    <input type="hidden" name="csrf" value="${h(csrfToken)}">
    <button type="submit" class="ghost">Ask to close my account</button>
  </form>
</details>`;

  return layout({
    active: 'my-gym',
    title: gym ? 'Your gym' : 'Your application',
    ownerNav: gym ? 'My gym' : 'My application',
    user: user && { ...user, kind: 'gym_owner' },
    body: `<h1>${gym ? 'Your gym' : 'Your application'}</h1>
${status}
${supportCard}
${agreementCard}

<h2>Documents</h2>
${docRows}
${upload}

${closure}`,
  });
}

/**
 * How to delete your account and data — the web route both stores require,
 * reachable without the app installed.
 *
 * It explains rather than acts: deleting a member's data is done by their gym
 * (the gym holds it, POPIA makes the gym responsible), and proving who you are
 * is done by signing in the way you already do. A form here that deleted
 * anything on a membership number and phone would let anyone who knew those
 * two things erase somebody else.
 */
export function deleteAccountPage() {
  return layout({
    title: 'Delete your account',
    indexable: true,
    body: `
<div class="card">
  <h1>Delete your account and data</h1>

  <h2>If you are a gym member</h2>
  <ol>
    <li>In the Yoyo Gyms app, sign in to your gym, open <b>Profile</b> and choose <b>Delete my account</b>.
    On the web, <a href="/platform/find">find your gym</a>, sign in with your membership number and phone
    number, and choose <b>Delete my account</b> at the bottom of the <b>Status</b> screen.</li>
    <li>Your account is deleted within 30 days, sooner if your gym does it first, and you get an email when
    it is done. Your details, check-ins, bookings, health answers and any face data are erased. Payment
    records the law requires your gym to keep are kept, without your name.</li>
  </ol>
  <p class="muted">Cannot sign in? Ask your gym directly. They hold your records and can delete them.</p>

  <h2>If you own a gym</h2>
  <ol>
    <li><a href="/owner/login?next=account">Sign in to your Yoyo Gyms account</a>.</li>
    <li>Choose <b>Close my account</b>, on the web or in the Yoyo Gyms app. Your account is closed within
    30 days and you get an email when it is done: your gym is closed to its members and staff, your
    sign-in is switched off, and your personal details are erased. Your gym's data is kept for 90 days in
    case you change your mind, then deleted.</li>
  </ol>
  <p class="muted">Forgot your password? <a href="/platform/forgot">Reset it</a> first.</p>
  <p class="muted"><a href="/platform/privacy">Privacy policy</a></p>
</div>`,
  });
}

/** Turn a stored doc_type into something a person would say. */
function readableDocType(key) {
  return DOCUMENT_LABELS[key] || key;
}

// ---------------------------------------------------------------------------
// Plans and prices
// ---------------------------------------------------------------------------

/** Cents to rands, for a form field. Never rounds to whole rands. */
const rands = (cents) => (Number.isFinite(Number(cents)) ? (Number(cents) / 100).toFixed(2) : '');

/**
 * Plans and their prices.
 *
 * The form is in RANDS because that is what a person thinks in; everything
 * below this screen is in cents. An unpriced plan is called out in words,
 * because a blank box looks like a plan that is free and is actually a plan
 * that nobody is being charged for.
 */
export function plansPage({ plans = [], user = null, csrfToken = '', error = '' } = {}) {
  const unpriced = plans.filter((p) => !Number.isInteger(p.price_cents) || p.price_cents <= 0);

  return layout({
    active: 'plans',
    title: 'Plans and prices',
    user,
    body: `<h1>Plans and prices</h1>
${error ? `<p class="err">${h(error)}</p>` : ''}
${
  unpriced.length
    ? `<div class="card tone-warn"><b>⚠️ ${unpriced.length} plan${unpriced.length === 1 ? ' has' : 's have'} no price.</b>
  <p class="muted">Billing skips a plan with no price — those gyms are <b>not being billed at all</b>.
  Nothing is charged until a price is set here.</p></div>`
    : ''
}

${plans
  .map(
    (p) => `<form class="card" method="post" action="/platform/plans/${h(p.key)}">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>${h(p.label || planName(p.key))}</h2>
  <p>${
    Number.isInteger(p.price_cents) && p.price_cents > 0
      ? `Currently <b>${h(amount(p.price_cents, p.currency || 'ZAR'))}</b> per month`
      : '<b>No price set</b> — this plan bills nobody.'
  }</p>
  <div class="two">
    <label>Price per month (${h(p.currency || 'ZAR')})
      <input name="price" inputmode="decimal" value="${h(rands(p.price_cents))}" placeholder="e.g. 499.00">
    </label>
    <label>Maximum active members
      <input name="max_active_members" inputmode="numeric" value="${h(p.max_active_members)}">
    </label>
  </div>
  <label class="row"><input type="checkbox" name="is_enabled" value="1" ${
    p.is_enabled === false ? '' : 'checked'
  }> Offered to new gyms</label>
  ${serviceSwitches(p.features)}
  ${promiseSwitches(p)}
  <button type="submit" class="ghost">Save ${h(p.label || planName(p.key))}</button>
</form>`
  )
  .join('\n')}

<p class="muted">Changing a price does not re-bill anyone. It applies from each gym's next
billing date. Every change here is written to the audit log.</p>`,
  });
}

// ---------------------------------------------------------------------------
// The audit log
// ---------------------------------------------------------------------------

/** " · 30 days free" — the plan's own trial (CLAUDE.md §47.1 Q4); nothing for none. */
function trialLine(plan) {
  const days = Number(plan?.trialDays);
  return Number.isInteger(days) && days > 0 ? ` · ${h(days)} days free` : '';
}

/**
 * What a PERSON at Yoyo delivers on this plan, and its free trial, as switches
 * (CLAUDE.md §47.1 Q4). Every line an owner reads about support comes from here.
 */
function promiseSwitches(plan) {
  const on = new Set(promisesOf(plan));
  return `<p class="svc-h">From Yoyo Gyms, by people</p>
  <div class="svc-grid">
    ${PLAN_PROMISES.map(
      ([k, label]) => `<label class="svc"><input type="checkbox" name="promise_${h(k)}" value="1"${on.has(k) ? ' checked' : ''}>
      <span><b>${h(label)}</b></span></label>`
    ).join('\n    ')}
  </div>
  <label style="max-width:260px">Free trial for new gyms (days)
    <input name="trial_days" inputmode="numeric" value="${h(trialDaysOf(plan))}">
  </label>`;
}

/**
 * A plan's services as switches (CLAUDE.md §41.1 Q2). Core services are shown
 * as always included, not as switches: a gym without them is not running, and
 * the server keeps them on whatever is sent.
 */
function serviceSwitches(features) {
  const on = new Set(Array.isArray(features) ? features : []);
  const group = (key, title) => {
    const items = ALL_SERVICES.filter((f) => SERVICE_INFO[f].group === key);
    if (!items.length) return '';
    if (key === 'core') {
      return `<p class="svc-h">${h(title)}</p><p class="muted svc-core">${items.map((f) => h(SERVICE_INFO[f].label)).join(' · ')}</p>`;
    }
    return `<p class="svc-h">${h(title)}</p>
  <div class="svc-grid">
    ${items
      .map(
        (f) => `<label class="svc"><input type="checkbox" name="svc_${h(f)}" value="1"${on.has(f) ? ' checked' : ''}>
      <span><b>${h(SERVICE_INFO[f].label)}</b>${SERVICE_INFO[f].forMembers ? `<small>${h(SERVICE_INFO[f].forMembers)}</small>` : ''}</span></label>`
      )
      .join('\n    ')}
  </div>`;
  };
  return `<div class="svc-block">
  <p class="svc-title">Services in this plan</p>
  ${SERVICE_GROUPS.map(([key, title]) => group(key, title)).join('\n  ')}
</div>`;
}

/**
 * The platform audit log.
 *
 * Everything on the platform writes here — every approval, suspension, price
 * change and document view — and until now nothing could read it. It is also
 * the POPIA record of who looked at whose identity document.
 *
 * Filtered rather than paged: after a year this table is the largest thing on
 * the platform, and "show me everything" stops being a useful question.
 */
export function auditPage({ entries = [], user = null, filter = {}, page = null } = {}) {
  // What happened in words first, with the recorded name under it — the name
  // is what "Action contains" searches (design critique 2026-09-29).
  const rows = entries.length
    ? listTable(
        [['When'], ['Action'], ['Who'], ['What'], ['Detail']],
        entries.map((e) => [
          { html: h(exact(e.created_at)), cls: 'muted' },
          `<b>${h(actionText(e.action))}</b><br><span class="muted">${h(e.action)}</span>`,
          `${h(ACTOR_TEXT[e.actor_kind] || String(e.actor_kind || '').replace(/_/g, ' '))}${
            e.actor_user_id ? `<br><span class="muted">${h(e.actor_user_id)}</span>` : ''
          }`,
          `${h(e.entity || '')}${e.entity_id || e.detail?.entity_key ? `<br><span class="muted">${h(e.entity_id || e.detail.entity_key)}</span>` : ''}`,
          { html: h(detailText(e.detail)), cls: 'muted' },
        ])
      )
    : `<div class="empty">Nothing matches that filter.</div>`;

  return layout({
    active: 'audit',
    title: 'Audit log',
    user,
    body: `<h1>Audit log</h1>
<p class="muted">Append-only. Every approval, suspension, price change and document view.</p>

<form class="card row" method="get" action="/platform/audit">
  <label>Action contains<input name="action" value="${h(filter.action)}" placeholder="e.g. suspend"></label>
  <label>Entity id<input name="entity_id" value="${h(filter.entityId)}" placeholder="a gym or document id"></label>
  <button type="submit" class="ghost">Filter</button>
</form>

${rows}
${pager(page, '/platform/audit', { action: filter.action, entity_id: filter.entityId })}`,
  });
}

/**
 * Render a detail blob as text.
 *
 * Stringified and then escaped by the caller. It is written by us, but it
 * CONTAINS text people typed — a rejection reason, a gym name — so it is
 * treated as untrusted.
 */
function detailText(detail) {
  if (!detail) return '';
  try {
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

/** Gym owners, and the switch that stops one. */
export function ownersPage({ owners = [], user = null, csrfToken = '', filter = {}, page = null } = {}) {
  const rows = owners.length
    ? listTable(
        [['Owner'], ['Email'], ['Gyms', { num: true }], ['Status'], ['Actions', { act: true }]],
        owners.map((o) => [
          h(o.full_name || '—'),
          h(o.email),
          h(num(o.gym_count ?? 0)),
          o.closure_completed_at
            ? statusTag('closed')
            : `${statusTag(o.is_active === false ? 'switched off' : 'active')}${
                o.closure_requested_at && o.is_active !== false
                  ? ` ${statusTag('asked to close')} <span class="muted">closes ${h(until(closeBy(o.closure_requested_at).toISOString()))}</span>`
                  : ''
              }`,
          o.closure_completed_at
            ? '<span class="muted">Account closed</span>'
            : o.closure_requested_at && o.is_active !== false
            ? `<details class="confirm"><summary>Close now</summary>
        <form method="post" action="/platform/owners/${h(o.id)}/close">
          <input type="hidden" name="csrf" value="${h(csrfToken)}">
          <p><b>${h(o.email || 'This owner')}</b> asked to close their account. Closing it now suspends their gym
          (closed to its members and staff), switches off their sign-in and erases their personal details.
          They are emailed. The nightly job does the same on day 30.</p>
          <button type="submit" class="danger">Yes, close the account</button>
        </form></details>`
            : o.is_active === false
            ? `<form method="post" action="/platform/owners/${h(o.id)}/reactivate">
        <input type="hidden" name="csrf" value="${h(csrfToken)}">
        <button type="submit" class="ghost">Switch on</button>
      </form>`
            : `<details class="confirm"><summary>Switch off</summary>
        <form method="post" action="/platform/owners/${h(o.id)}/deactivate">
          <input type="hidden" name="csrf" value="${h(csrfToken)}">
          <p><b>${h(o.email || 'This owner')}</b> can no longer sign in to their Yoyo Gyms account or through Owner sign-in.
          Their gym stays open, and its staff and members are not affected. You can switch them on again.</p>
          <button type="submit" class="danger">Yes, switch off</button>
        </form></details>`,
        ])
      )
    : `<div class="empty">No owners match that search.</div>`;

  const total = Number.isInteger(owners.total) ? owners.total : Number.isInteger(page?.total) ? page.total : null;
  const summary =
    total === null
      ? `${tally(owners.length, 'owner')} shown.`
      : `${tally(total, 'owner')}${filter.query ? (total === 1 ? ' matches' : ' match') : ''}.`;

  return layout({
    active: 'owners',
    title: 'Gym owners',
    user,
    body: `<h1>Gym owners</h1>
<p class="muted">Switching an owner off stops them signing in. <b>It does not close their gym</b>
and it deletes nothing — suspend the gym itself if that is what you mean.</p>

${liveSearch({
  action: '/platform/owners',
  regions: ['owners-list'],
  fields: `<label class="grow">Search by name or email<input type="search" name="q" value="${h(filter.query)}" autocomplete="off"></label>`,
})}
<div id="owners-list" data-summary="${h(summary)}">
${rows}
${pager(page, '/platform/owners', { q: filter.query })}
</div>`,
  });
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** What the platform is owed and what it has been paid. */
export function financePage({ summary = {}, user = null } = {}) {
  const byStatus = summary.gyms_by_status || {};
  const unpriced = summary.unpriced_plans || [];

  return layout({
    active: 'finance',
    title: 'Finances',
    user,
    body: `<h1>Finances</h1>

${
  unpriced.length
    ? `<div class="card tone-warn"><b>⚠️ Gyms on ${unpriced.map((k) => h(planName(k))).join(', ')} are not being billed.</b>
  <p class="muted">Those plans have <b>no price</b>, so billing skips them entirely.
  <a href="/platform/plans">Set a price →</a></p></div>`
    : ''
}

${kpiRow([
  `<div class="kpi"><div class="lbl">Paid</div><div class="val">${h(amount(Number(summary.paid_cents) || 0, summary.currency || 'ZAR'))}</div></div>`,
  `<div class="kpi"><div class="lbl">Outstanding</div><div class="val">${h(amount(Number(summary.outstanding_cents) || 0, summary.currency || 'ZAR'))}</div>
    <div class="sub">Invoices issued and not yet paid.</div></div>`,
])}

<h2>Gyms by subscription state</h2>
${listTable(
  [['State'], ['Gyms', { num: true }]],
  Object.entries(byStatus).map(([state, n]) => [statusTag(state), h(num(n))])
)}

<p class="muted">Figures come from <code>platform_invoices</code>. Money the platform is owed by
gyms — <b>never a member's payment to their gym</b>, which the platform does not see (D-013).</p>`,
  });
}

// ---------------------------------------------------------------------------
// When the activation email could not be sent
// ---------------------------------------------------------------------------

/**
 * Hand the activation details to the reviewer, once.
 *
 * The bug this closes: approving a gym provisioned a real database, generated
 * an activation link, and then nothing sent it and nothing showed it. The
 * owner could never activate and the gym never opened.
 *
 * Shown ONCE and never stored — only hashes of these values exist in the
 * database, and that is the property the whole activation design rests on. If
 * the reviewer navigates away without copying them, a new activation must be
 * issued, which is correct rather than inconvenient.
 */
export function activationHandoverPage({ activation = {}, gymName = '', applicationId = '', backHref = '', user = null }) {
  return layout({
    active: 'applications',
    title: 'Send this to the owner',
    user,
    body: `<h1>Approved — now send this to the owner</h1>

<div class="card">
  <p><b>⚠️ The activation email could not be sent${
    activation.emailReason ? ` (${h(activation.emailReason)})` : ''
  }.</b></p>
  <p class="muted">The gym <b>${h(gymName)}</b> is set up and waiting. The owner cannot open
  it until they use the link and the code below, so please send these to them yourself.</p>
</div>

<div class="card">
  <h2>Send to ${h(activation.to || 'the owner')}</h2>
  <p><b>Link</b></p>
  <p><input readonly value="${h(activation.link)}" style="width:100%" aria-label="Activation link" data-select></p>
  <p><b>Code</b></p>
  <p style="font-size:28px;letter-spacing:6px"><b>${h(activation.code)}</b></p>
  <p class="muted">Both are needed. The link alone is not enough, and it expires
  <b>${h(activation.expiresInMinutes || 10)} minutes</b> after it was made — send it now. Once it has
  expired, the owner can ask for the next one from the link itself (one a day).</p>
</div>

<div class="card">
  <p><b>This is shown once.</b> Only hashes are stored, so this page is the only
  place these values exist. If you navigate away without copying them, issue a new
  activation instead — nothing is lost, the owner simply gets a fresh link.</p>
  <p><a class="btn" href="${h(backHref || `/platform/applications/${applicationId}`)}">${
    backHref ? 'Back to the gym' : 'Back to the application'
  } →</a></p>
</div>`,
  });
}

// ---------------------------------------------------------------------------
// Reviewing one document — the screen where a forgery is caught or missed
// ---------------------------------------------------------------------------

/**
 * A document, shown properly.
 *
 * It used to redirect to a signed storage URL: the reviewer left the panel,
 * downloaded a file, opened it in another application, and had nothing beside
 * it to compare against. Whether a registration certificate is forged is a
 * judgement made by comparing the document to what the applicant CLAIMED, and
 * that comparison is impossible on two separate screens.
 *
 * So: the document is rendered inline, and everything needed to judge it sits
 * next to it — the applicant's own claims, the facts about the bytes, and
 * anywhere else this exact file has been seen before.
 *
 * The file itself is loaded from /platform/documents/<id>/file, which issues a
 * short-lived signed URL. The URL never appears in this page's source.
 */
export function documentReviewPage({
  doc,
  application = null,
  facts = null,
  duplicates = [],
  user = null,
  csrfToken = '',
  canDecide = false,
}) {
  const isImage = String(doc.mime_type || '').startsWith('image/');
  const src = `/platform/documents/${h(doc.id)}/file`;

  // The document itself. An <object> for PDFs because it falls back cleanly
  // when the browser has no viewer, which is exactly when a reviewer needs to
  // be told rather than shown a blank rectangle.
  // ALWAYS-VISIBLE controls (CLAUDE.md §40.1 F-40.8). Most phone browsers
  // show an embedded PDF as a blank box, and the fallback inside <object>
  // only appears where it is not needed.
  const tools = `<p class="row">
  <a class="btn ghost" href="${src}" target="_blank" rel="noopener">Open in a new tab</a>
  <a class="btn ghost" href="${src}?download=1">Download</a>
</p>`;
  const viewer = isImage
    ? `${tools}<img src="${src}" alt="${h(doc.filename)}" style="max-width:100%;border:1px solid var(--line);border-radius:12px"
  onerror="this.outerHTML='<div class=&quot;empty&quot;><p>This browser cannot show this photo. Use <b>Download</b> above to open it.</p></div>'">`
    : `${tools}<object data="${src}" type="application/pdf" style="width:100%;height:78vh;border:1px solid var(--line);border-radius:12px;background:#fff">
  <div class="empty" style="color:#1d2329;border-color:rgba(7,12,16,.18);background:#fff">
    <p>This browser cannot show the PDF here. Use <b>Open in a new tab</b> or <b>Download</b> above.</p>
  </div>
</object>`;

  // Flags are facts, phrased as facts. None of them is a verdict.
  const flagList = (facts?.flags || []).length
    ? `<div class="card tone-bad">
  <h2>⚠️ Worth a closer look</h2>
  <ul>${facts.flags
    .map((f) => `<li><b>${h(f.severity)}</b> — ${h(f.detail)}</li>`)
    .join('')}</ul>
  <p class="muted">These are observations, not conclusions. A genuine document can
  trip them, and a convincing forgery can pass all of them.</p>
</div>`
    : '';

  // The strongest signal available, and the one a human would never spot
  // unaided: this exact file on somebody else's application.
  const dupeList = duplicates.length
    ? `<div class="card tone-bad">
  <h2>⚠️ This exact file appears on ${duplicates.length} other application${
        duplicates.length === 1 ? '' : 's'
      }</h2>
  <ul>${duplicates
    .map(
      (d) => `<li><a href="/platform/applications/${h(d.application_id)}">${h(
        d.proposed_gym_name || d.application_id
      )}</a> <span class="muted">${h(when(d.uploaded_at))}</span></li>`
    )
    .join('')}</ul>
  <p class="muted">Byte-for-byte identical. The same person applying twice is
  ordinary; two different gyms sending one file is not.</p>
</div>`
    : '';

  const claims = application
    ? `<div class="card">
  <h2>What the applicant says</h2>
  <table>
    <tbody>
      <tr><td class="muted">Gym</td><td><b>${h(application.proposed_gym_name)}</b></td></tr>
      <tr><td class="muted">City</td><td>${[application.city, countryName(application.country)].filter(Boolean).map(h).join(', ')}</td></tr>
      <tr><td class="muted">Document type</td><td>${h(DOCUMENT_LABELS[doc.doc_type] || doc.doc_type)}</td></tr>
      <tr><td class="muted">Applied</td><td>${h(when(application.submitted_at))}</td></tr>
    </tbody>
  </table>
  <p class="muted">Compare these against the document. A name or an address that
  does not match is the thing to look for.</p>
</div>`
    : '';

  const controls =
    canDecide && doc.status === 'pending'
      ? `<form class="card" method="post" action="/platform/documents/${h(doc.id)}/decide">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Decision</h2>
  <label>Reason (required to reject)
    <input name="reason" placeholder="e.g. the name does not match the application">
  </label>
  <div class="row">
    <button type="submit" name="action" value="accept">Accept</button>
    <button type="submit" name="action" value="reject" class="ghost">Reject</button>
  </div>
</form>`
      : `<div class="card"><p class="muted">${
          doc.status === 'pending' ? 'You have read-only access.' : `Already ${h(doc.status)}.`
        }${doc.reject_reason ? ` ${h(doc.reject_reason)}` : ''}</p></div>`;

  return layout({
    active: 'applications',
    title: doc.filename || 'Document',
    user,
    body: `<p><a href="/platform/applications/${h(doc.application_id)}">← Back to the application</a></p>
<h1>${h(doc.filename || 'Document')}</h1>

${dupeList}
${flagList}

${viewer}

${claims}

<div class="card">
  <h2>The file itself</h2>
  <table>
    <tbody>
      <tr><td class="muted">Uploaded as</td><td>${h(doc.mime_type || '—')}</td></tr>
      <tr><td class="muted">Actually is</td><td>${
        facts?.actualType ? h(facts.actualType) : '<span class="muted">not recognised</span>'
      }</td></tr>
      <tr><td class="muted">Size</td><td>${h(readableSizeLabel(facts?.bytes ?? doc.size_bytes))}</td></tr>
      <tr><td class="muted">Uploaded</td><td>${h(exact(doc.uploaded_at))}</td></tr>
      <tr><td class="muted">SHA-256</td><td style="word-break:break-all;font-family:monospace;font-size:0.8rem">${h(
        facts?.sha256 || doc.sha256 || '—'
      )}</td></tr>
    </tbody>
  </table>
  <p class="muted">The hash is computed from the bytes actually in storage, not from
  anything the uploader told us. It is what makes the duplicate check above possible.</p>
</div>

${controls}

<p class="muted">Opening this document has been recorded in the audit log, with your
name and the time.</p>`,
  });
}

/** Bytes as a person reads them. Mirrors readableSize in platform/forensics.js. */
function readableSizeLabel(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Platform security (CLAUDE.md §16)
// ---------------------------------------------------------------------------

/**
 * What is worth a person's attention today.
 *
 * PLATFORM security, not a gym's. Nothing here concerns a gym's members, its
 * check-ins or its takings — those belong to that gym's own admin panel and
 * the platform never sees them (D-044).
 *
 * Every alert states its innocent explanation next to it, deliberately. Most
 * of these patterns usually ARE innocent, and a screen that does not say so
 * trains people first to panic and then to stop reading it.
 */
export function securityPage({ alerts = [], windowHours = 24, user = null }) {
  const body = alerts.length
    ? alerts
        .map(
          (a) => `<div class="card ${a.severity === 'high' ? 'tone-bad' : 'tone-warn'}">
  <h2>${h(a.detail)}</h2>
  <p class="muted">${h(a.innocent)}</p>
  <p class="muted"><a href="/platform/audit?action=${h(auditFilterFor(a.code))}">
    See the entries →</a></p>
</div>`
        )
        .join('\n')
    : `<div class="card">
  <h2>✅ Nothing needs attention</h2>
  <p class="muted">No unusual activity in the last ${h(windowHours)} hours.</p>
</div>`;

  return layout({
    active: 'security',
    title: 'Security',
    user,
    body: `<h1>Security</h1>
<p class="muted">The last ${h(windowHours)} hours on the platform. This watches sign-ins,
access to applicants' identity documents, and gyms that failed to be created —
<b>never a gym's own members</b>, which the platform does not see.</p>

${body}

<p class="muted"><b>Nothing here acts on its own.</b> No account is locked and no gym is
suspended by this screen. Every pattern above has an ordinary explanation, and
deciding which one applies is a person's job.</p>`,
  });
}

/** Map an alert back to the audit filter that shows its entries. */
function auditFilterFor(code) {
  return (
    {
      repeated_failed_logins: 'login.failed',
      staff_blocked_no_2fa: 'blocked_no_2fa',
      unusual_document_access: 'document.viewed',
      document_path_rejected: 'rejected_path',
      unmatched_payment: 'webhook.unmatched',
      provisioning_failed: 'provision.failed',
    }[code] || ''
  );
}

// ---------------------------------------------------------------------------
// First run
// ---------------------------------------------------------------------------

/**
 * Claim the seeded owner account.
 *
 * The secret is carried in a hidden field rather than stored anywhere between
 * the two requests: there is no session yet, and a half-finished setup should
 * leave nothing behind. Reloading simply mints a new one.
 */
export function setupPage({ token = '', email = '', secret = '', otpauth = '', error = '', action = '/platform/setup' } = {}) {
  return layout({
    title: 'Set up your account',
    body: `<h1>Set up your platform account</h1>
<p class="muted">Your account exists but has no password yet. This page sets one, and turns on
two-factor authentication at the same time — a platform account reaches every gym, so it is
not optional here.</p>
${error ? `<p class="err">${h(error)}</p>` : ''}

<div class="card">
  <h2>1. Add this to your authenticator app</h2>
  <p class="muted">Google Authenticator, 1Password, Authy — any of them.</p>
  <p>Scan this, or type the key in by hand:</p>
  <p style="font-family:monospace;font-size:1.1rem;letter-spacing:2px;word-break:break-all">${h(secret)}</p>
  <p class="muted"><a href="${h(otpauth)}">Open in your authenticator app →</a></p>
</div>

<form class="card" method="post" action="${h(action)}">
  <input type="hidden" name="token" value="${h(token)}">
  <input type="hidden" name="secret" value="${h(secret)}">
  <h2>2. Choose a password</h2>
  <!-- The visible field is disabled so it cannot be edited, and a DISABLED
       INPUT IS NEVER SUBMITTED — nor is one without a name. Both were true
       here, so the server received no email, found no account, and reported
       an invalid link when the link was fine. The hidden field is what
       actually travels. -->
  <input type="hidden" name="email" value="${h(email)}">
  <label>Email<input value="${h(email)}" disabled></label>
  <label>Password
    <input type="password" name="password" required minlength="12" autocomplete="new-password">
  </label>
  <p class="muted">At least 12 characters.</p>

  <h2>3. Prove the app works</h2>
  <label>The six-digit code showing now
    <input name="totp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required
           autocomplete="one-time-code">
  </label>
  <p class="muted">Checked before two-factor is switched on. If it were not, a wrong setup would
  lock you out of your own platform with no second account to fix it from.</p>

  <button type="submit">Finish setup</button>
</form>`,
  });
}

/** The recovery codes, shown once and never again. */
export function setupDonePage({ recoveryCodes = [], invited = false } = {}) {
  return layout({
    title: 'Account ready',
    body: `<h1>Your account is ready</h1>

<div class="card">
  <h2>Save these recovery codes now</h2>
  <p class="muted">Each one signs you in once if you lose your phone. <b>This is the only time
  they are shown</b> — only their hashes are stored, so nobody, including us, can show them
  to you again.</p>
  <p style="font-family:monospace;font-size:1.15rem;line-height:2;letter-spacing:2px">
    ${recoveryCodes.map((c) => h(c)).join('<br>')}
  </p>
  <p class="muted">Print them, or put them somewhere that is not the phone with your
  authenticator on it.</p>
</div>

<div class="card">
  <p><a class="btn" href="/platform/login">Sign in</a></p>
  ${
    invited
      ? ''
      : `<p class="muted">Remove <code>PLATFORM_SETUP_TOKEN</code> from your environment now.
  It is no longer needed — this account already has a password, so the setup page
  would refuse it anyway, but a secret nobody needs is a secret not worth keeping.</p>`
  }
</div>`,
  });
}

// ---------------------------------------------------------------------------
// After Paystack sends the owner back
// ---------------------------------------------------------------------------

/**
 * What happened to the payment.
 *
 * Says whether renewals will work, because that is the difference between a
 * subscription and a single payment, and the owner should not discover it next
 * month when their gym is suspended.
 */
export function paymentResultPage({ ok = false, reason = '', alreadyPaid = false, recurring = false, gymSlug = '' } = {}) {
  // Back to where the owner came from: their gym's admin panel (its dashboard
  // has Pay now, §48) or their Yoyo account page.
  const ways = `<p>${
    gymSlug ? `<a class="btn" href="${h(gymAdminPath(gymSlug))}">Open your gym admin panel →</a> ` : ''
  }<a href="/platform/my-gym"${gymSlug ? ' class="btn ghost"' : ''}>${gymSlug ? 'Your Yoyo account' : 'Back to your gym →'}</a></p>`;
  if (!ok) {
    return layout({
      title: 'Payment not completed',
      body: `<div class="card">
  <h1>That payment did not go through</h1>
  <p>${h(reason) || 'Nothing has been charged.'}</p>
  <p class="muted"><b>Nothing has been charged.</b> Your gym is unaffected — you can try again
  whenever you are ready.</p>
  ${ways}
</div>`,
    });
  }

  return layout({
    title: 'Payment received',
    body: `<div class="card">
  <h1>Thank you — payment received</h1>
  ${alreadyPaid ? '<p class="muted">This one was already recorded. You have not been charged twice.</p>' : ''}
  <p>Your gym is active and your members can use it.</p>
  ${
    recurring
      ? `<p class="muted">Your card is saved, so next month is taken automatically. We will email you
         before each payment, and you can stop it whenever you want.</p>`
      : `<p class="muted"><b>This payment was one-off.</b> Your card could not be saved for next
         month, so we will email you when the next one is due and you will pay the same way again.</p>`
  }
  ${ways}
</div>`,
  });
}

/**
 * Something went wrong, said usefully.
 *
 * Replaces the bare `<p>error</p>` these paths used to render — a white page
 * with four words on it, which is the least helpful thing a first-run screen
 * can do to the person setting the system up.
 *
 * `fix` is only ever set for operator-facing problems (a missing environment
 * variable, a seed that has not been run). Attacker-facing refusals still say
 * one generic thing and no more.
 */
export function problemPage({ title = 'Something went wrong', message = '', fix = null, back = null, user = null } = {}) {
  return layout({
    title,
    // Inside the panel when a staff member hit it, so the way on is the menu
    // they already know — not a dead end with four words on it.
    user,
    body: `<div class="card">
  <h1>${h(title)}</h1>
  <p>${h(message)}</p>
  ${fix ? `<div class="fix"><b>How to fix it</b><p>${h(fix)}</p></div>` : ''}
  ${back ? `<p><a class="btn" href="${h(back.href)}">${h(back.label)} →</a></p>` : ''}
</div>`,
  });
}

// ---------------------------------------------------------------------------
// Your own account
// ---------------------------------------------------------------------------

/** Where you replace recovery codes you did not keep. */
export function accountPage({ user = null, remaining = 0, csrfToken = '', error = '', codes = null }) {
  if (codes) {
    return layout({
    active: 'account',
      title: 'New recovery codes',
      user,
      body: `<h1>Your new recovery codes</h1>
<div class="card">
  <h2>⚠️ Save these now</h2>
  <p class="muted"><b>Your previous codes no longer work.</b> Each of these signs you in once if
  you lose your phone, and <b>this is the only time they are shown</b> — only their hashes are
  stored.</p>
  <p style="font-family:monospace;font-size:1.15rem;line-height:2;letter-spacing:2px">
    ${codes.map((c) => h(c)).join('<br>')}
  </p>
  <p class="muted">Put them somewhere that is not the phone your authenticator is on.</p>
</div>`,
    });
  }

  return layout({
    active: 'account',
    title: 'Your account',
    user,
    body: `<h1>Your account</h1>

<div class="card">
  <h2>Recovery codes</h2>
  <p>${
    remaining > 0
      ? `You have <b>${h(remaining)}</b> unused code${remaining === 1 ? '' : 's'}.`
      : '<b>You have no recovery codes left.</b>'
  }</p>
  <p class="muted">These are what let you back in if you lose the phone with your authenticator
  on it. Yours is the only account that reaches every gym — there is no second owner to let you
  back in, so this matters more here than it would anywhere else.</p>
</div>

${error ? `<p class="err">${h(error)}</p>` : ''}

<form class="card" method="post" action="/platform/account/recovery-codes">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Issue a new set</h2>
  <p class="muted"><b>Your current codes will stop working.</b> Only do this if you have lost
  them, or think somebody else has seen them.</p>

  <label>Your password
    <input type="password" name="password" required autocomplete="current-password">
  </label>
  <label>Code from your authenticator
    <input name="totp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required
           autocomplete="one-time-code">
  </label>
  <p class="muted">Asked for again on purpose: recovery codes bypass two-factor authentication,
  so a borrowed browser tab must not be enough to mint a new set.</p>

  <button type="submit">Issue new codes</button>
</form>`,
  });
}


// ---------------------------------------------------------------------------
// The front page
// ---------------------------------------------------------------------------

/** What an audit entry means, for the activity list on Today. */
const ACTIVITY_TEXT = {
  'application.submitted': 'New application',
  'platform.login': 'Staff sign-in',
  'platform.login.failed': 'Failed sign-in attempt',
  'platform.login.locked': 'Account locked after failed sign-ins',
  'platform.gym.suspended': 'Gym suspended',
  'platform.gym.reactivated': 'Gym reactivated',
  'platform.gym.plan_changed': 'Gym moved to another plan',
  'platform.document.uploaded': 'Document uploaded',
  'platform.document.viewed': 'Document opened',
  'platform.document.accepted': 'Document accepted',
  'platform.document.rejected': 'Document rejected',
  'platform.owner.activation_issued': 'Activation link sent',
  'platform.owner.activation_resent': 'New activation link sent',
  'platform.owner.agreement_accepted': 'Owner activated their gym',
  'platform.owner.closure_requested': 'Owner asked to close their account',
  'platform.owner.deactivated': 'Owner switched off',
  'platform.owner.reactivated': 'Owner switched back on',
  'platform.plan.updated': 'Plan price changed',
  'platform.staff.invited': 'Staff member invited',
  'platform.staff.role_changed': 'Staff role changed',
  'platform.staff.deactivated': 'Staff member switched off',
  'platform.staff.joined': 'Staff member finished setting up',
  'platform.application.decision_email_failed': 'Decision email could not be sent',
  // Said in plain words, never "provisioned" (design critique 2026-09-29).
  'gym.provisioned': 'Gym set up',
  'gym.provision.failed': 'Setting up a gym stopped before it finished',
  'platform.gym.services_changed': "Gym's services changed",
  'platform.gym.setup_help_given': 'Setup help given',
  'platform.gym.account_manager_set': 'Account manager named',
  'platform.gym.owner_account_created': "Owner's gym sign-in created",
  'platform.owner.setup_help_requested': 'Owner asked for setup help',
  'platform.owner.activated': 'Owner activated their account',
  'platform.owner.activation_email_failed': 'Activation email could not be sent',
  'platform.owner.activation_renewed': 'Owner asked for a new activation link',
  'platform.staff.reactivated': 'Staff member switched back on',
  'platform.staff.invite_resent': 'Staff invitation sent again',
  'platform.document.opened': 'Document opened',
  'platform.document.downloaded': 'Document downloaded',
  'platform.document.purged': 'Old document deleted',
  'platform.password.reset_requested': 'Password reset asked for',
  'platform.password.reset': 'Password reset',
  'platform.invoice.paid': 'Invoice paid',
  'platform.settings.support_changed': 'Support contacts changed',
};

/** Who did it, for the audit log — the kind of account, in words. */
const ACTOR_TEXT = { platform_staff: 'Yoyo staff', gym_owner: 'Gym owner', system: 'The system' };

/** An audit action as a person reads it; the recorded name when we have no words for it. */
function actionText(action) {
  return (
    ACTIVITY_TEXT[action] ||
    String(action || '')
      .replace(/^platform\./, '')
      .replace(/[._]/g, ' ')
  );
}

/** Entries worth reading on Today — reads of figures are not news. */
const QUIET = new Set(['platform.gym.stats_read', 'platform.logout']);

/**
 * Gyms approved but not fully built, and not built since (CLAUDE.md §40.1,
 * D-167): the owner is waiting and Try again is on the application's page.
 * Read from the audit entries Today already has — a later "gym.provisioned"
 * for the same web address means the retry worked.
 */
function openFailedBuilds(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const at = (e) => String(e?.created_at || '');
  const built = new Map();
  for (const e of list) {
    const slug = e?.action === 'gym.provisioned' ? e.detail?.slug : null;
    if (slug && at(e) > (built.get(slug) || '')) built.set(slug, at(e));
  }
  const open = new Map();
  for (const e of list) {
    if (e?.action !== 'gym.provision.failed' || !e.entity_id) continue;
    const slug = e.detail?.slug;
    if (slug && built.has(slug) && built.get(slug) > at(e)) continue;
    open.set(e.entity_id, e);
  }
  return [...open.values()];
}

function activityLine(e) {
  const text = actionText(e.action);
  const name = e.detail && typeof e.detail === 'object' ? e.detail.gym_name || e.detail.email || '' : '';
  return `<li><b>${h(text)}</b>${name ? ` <span class="muted">· ${h(name)}</span>` : ''} <span class="muted" style="float:right">${h(
    when(e.created_at)
  )}</span></li>`;
}

/**
 * What needs you today — and the state of the platform at a glance.
 *
 * Signing in used to land on the applications queue — one list, chosen because
 * it was built first. A panel for running a business should open on the things
 * waiting for a decision, and say plainly when there are none.
 *
 * Every number here is a link. A figure a person cannot act on is decoration,
 * and decoration on an operations screen is worse than a blank space because
 * it looks like information.
 */
export function dashboardPage({
  user = null,
  waiting = 0,
  waitingOnOwner = 0,
  gyms = 0,
  activeGyms = 0,
  gymCounts = null,
  owners = null,
  alerts = 0,
  unpricedPlans = [],
  outstandingCents = 0,
  mrrCents = null,
  currency = 'ZAR',
  trialsEndingSoon = [],
  driftFindings = null,
  closureRequests = 0,
  provisioning = null,
  recent = [],
  setupRequests = 0,
  // Documents uploaded and not yet checked. Shown when the router passes it;
  // null is "not known", never 0 (design critique 2026-09-29).
  documentsWaiting = null,
} = {}) {
  // What this person may open. A tile or a link they would be refused is a
  // dead button (CLAUDE.md §40.1 F-40.2); rendered on its own, with no
  // permission list, the page shows everything, as before.
  const can = (perm) => !Array.isArray(user?.perms) || user.perms.includes(perm);

  // Everything that needs a person, before any total (design critique
  // 2026-09-29). Red items — what costs most to ignore — go first; within a
  // colour, the order below.
  const needsYou = [];

  // Can this server create a gym? Said on the home page — by setting NAME,
  // never a value — so "is it set up?" is answered by signing in, before
  // anyone presses Approve and wonders why nothing happened.
  // A to-do only when it is a mistake (switched on, not set up) or it is in
  // someone's way (switched off, applications waiting). Deliberately off with
  // nothing waiting is not a problem; the status line below still says it.
  if (provisioning && !provisioning.ready && (provisioning.live || waiting)) {
    needsYou.push({
      urgency: 'high',
      text:
        (provisioning.live
          ? 'Creating gyms is switched on but not fully set up: '
          : 'Creating gyms is switched off: ') +
        provisioning.problems.map((p) => h(p)).join(' '),
      href: '/platform/settings',
      action: 'See settings',
      perm: 'platform.manage',
    });
  }

  // An approved owner waiting on a gym that did not finish building.
  const failed = openFailedBuilds(recent);
  if (failed.length) {
    needsYou.push({
      urgency: 'high',
      text: `${h(tally(failed.length, 'approved gym'))} not fully set up — the owner is waiting.`,
      sub: 'Trying again finishes the gym from where it stopped.',
      href:
        failed.length === 1 ? `/platform/applications/${h(failed[0].entity_id)}` : '/platform/applications?tab=approved',
      action: 'Try again',
      perm: 'application.view',
    });
  }

  if (waiting) {
    needsYou.push({
      urgency: 'normal',
      text: `${h(tally(waiting, 'application'))} waiting for a decision.`,
      sub: waitingOnOwner ? `${h(num(waitingOnOwner))} more waiting on the owner.` : '',
      href: '/platform/applications',
      action: 'Review',
      perm: 'application.view',
    });
  }

  if (documentsWaiting) {
    needsYou.push({
      urgency: 'normal',
      text: `${h(tally(documentsWaiting, 'document'))} waiting to be checked.`,
      href: '/platform/applications',
      action: 'Check them',
      perm: 'application.view',
    });
  }

  for (const t of trialsEndingSoon) {
    needsYou.push({
      urgency: 'normal',
      text: `${h(t.name)}'s trial ends ${h(until(t.trial_ends_at))}.`,
      href: `/platform/registry/${h(t.gym_id)}`,
      action: 'Open',
      perm: 'gym.view',
    });
  }

  // Someone asked to leave. The stores require it to be honoured, and an
  // owner still being billed after asking to close is a complaint waiting.
  if (closureRequests) {
    needsYou.push({
      urgency: 'high',
      text: `${h(tally(closureRequests, 'owner'))} asked to close their account.`,
      href: '/platform/owners',
      action: 'Contact them',
      perm: 'platform.manage',
    });
  }

  if (unpricedPlans.length) {
    needsYou.push({
      urgency: 'high',
      text: `${unpricedPlans.map((k) => h(planName(k))).join(', ')} ${
        unpricedPlans.length === 1 ? 'has' : 'have'
      } no price, so ${unpricedPlans.length === 1 ? 'that plan bills' : 'those plans bill'} nobody.`,
      href: '/platform/plans',
      action: 'Set a price',
      perm: 'subscription.manage',
    });
  }

  if (alerts) {
    needsYou.push({
      urgency: 'high',
      text: `${h(tally(alerts, 'security item'))} worth a look in the last day.`,
      href: '/platform/security',
      action: 'Look',
      perm: 'audit.view',
    });
  }

  if (driftFindings) {
    needsYou.push({
      urgency: 'high',
      text: `${h(tally(driftFindings, 'gym'))} out of sync between the list of gyms and their data.`,
      href: '/platform/reconcile',
      action: 'See the check',
      perm: 'gym.view',
    });
  }

  // A promise made on the registration page (§41.1 Q6): somebody is waiting.
  if (setupRequests) {
    needsYou.push({
      urgency: 'normal',
      text: `${h(tally(setupRequests, 'gym'))} asked for setup help.`,
      href: '/platform/registry?setup=1',
      action: 'Help them',
      perm: 'gym.view',
    });
  }

  // Stable: red first, then the order above.
  const ordered = [...needsYou.filter((i) => i.urgency === 'high'), ...needsYou.filter((i) => i.urgency !== 'high')];
  const row = (item) => {
    const dot = `<span class="dot${item.urgency === 'high' ? ' bad' : ''}" aria-hidden="true"></span>`;
    const what = `<span class="what">${item.text}${item.sub ? `<small>${item.sub}</small>` : ''}</span>`;
    // Told, but not offered a door they would be refused at.
    return can(item.perm)
      ? `  <a class="todo" href="${item.href}">${dot}${what}<span class="go">${h(item.action)} →</span></a>`
      : `  <div class="todo">${dot}${what}</div>`;
  };

  const todo = ordered.length
    ? `<div class="card ${ordered[0].urgency === 'high' ? 'tone-bad' : 'tone-warn'}">
${ordered.map(row).join('\n')}
</div>`
    : `<div class="card tone-good" style="padding:20px 22px">
  <h2>✅ Nothing needs you</h2>
  <p class="muted">No applications waiting, no security items, no plan billing nobody,
  and nothing out of sync. Come back tomorrow.</p>
</div>`;

  const byStatus = gymCounts || {};
  const tile = (href, label, value, sub = '', perm = null) =>
    !can(perm)
      ? ''
      : `<a class="kpi" href="${href}"><div class="lbl">${h(label)}</div><div class="val">${value}</div>${
          sub ? `<div class="sub">${sub}</div>` : ''
        }</a>`;

  // Whole units in a tile: a headline figure, not a statement. Finances keep
  // the cents.
  const kpiMoney = (cents) => {
    try {
      return new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
        (Number(cents) || 0) / 100
      );
    } catch {
      return fmtMoney(cents, currency);
    }
  };

  // The totals: how the platform is doing, quieter than the decisions above.
  // What was the "To review" tile is the first decision now, and security
  // items are a decision too — neither is a total.
  const kpis = kpiRow([
    tile(
      '/platform/registry?status=active',
      'Active gyms',
      h(num(activeGyms)),
      `of ${h(num(gyms))}${byStatus.suspended ? ` · ${h(num(byStatus.suspended))} suspended` : ''}${
        byStatus.pending ? ` · ${h(num(byStatus.pending))} not activated` : ''
      }`,
      'gym.view'
    ),
    owners === null ? '' : tile('/platform/owners', 'Gym owners', h(num(owners)), '', 'platform.manage'),
    mrrCents === null ? '' : tile('/platform/finance', 'Monthly revenue', h(kpiMoney(mrrCents)), 'from paying gyms', 'subscription.manage'),
    outstandingCents === null
      ? ''
      : tile('/platform/finance', 'Outstanding', h(kpiMoney(outstandingCents)), 'invoiced, not yet paid', 'subscription.manage'),
  ]);

  const shown = (recent || []).filter((e) => !QUIET.has(e.action)).slice(0, 8);
  // The audit log's own entries: only for someone who may read it.
  const activity = !can('audit.view')
    ? ''
    : `<div class="card">
  <h2>Recent activity</h2>
  ${shown.length ? `<ul class="events">${shown.map(activityLine).join('\n')}</ul>` : '<p class="muted">Nothing has happened yet.</p>'}
  <p><a href="/platform/audit">Everything that happened →</a></p>
</div>`;

  return layout({
    active: 'home',
    title: 'Yoyo Gyms',
    user,
    body: `<h1>Today</h1>
<p class="lede">What needs a decision, and how the platform is doing.</p>

<section class="decide" aria-labelledby="needs-you">
<h2 id="needs-you">Needs you</h2>
${todo}
</section>

${kpis ? `<h2>The platform</h2>\n${kpis}` : ''}

<div class="grid2" style="margin-top:16px">
${activity}
<div class="card">
  <h2>Status</h2>
  <dl class="facts">
    ${
      provisioning
        ? `<dt>Creating new gyms</dt><dd>${
            provisioning.ready
              ? '<b>✅ Ready</b> <span class="muted">· approving an application opens the gym</span>'
              : '<b>❌ Not ready</b> <span class="muted">· see above</span>'
          }</dd>`
        : ''
    }
    <dt>Gyms</dt><dd>${can('gym.view') ? `<a href="/platform/registry">${h(num(gyms))}</a>` : h(num(gyms))} <span class="muted">· ${h(num(activeGyms))} active</span></dd>
    ${can('platform.manage') ? '<dt>Settings</dt><dd><a href="/platform/settings">Every switch, and whether it is set →</a></dd>' : ''}
  </dl>
</div>
</div>

<p class="muted">Counts only — the platform never reads a gym member's name,
phone, ID or health answers.</p>`,
  });
}

// ---------------------------------------------------------------------------
// The Yoyo staff team (CLAUDE.md §40.1 Q4)
// ---------------------------------------------------------------------------

/**
 * Who runs the main admin panel, and the controls to change that.
 *
 * Your own row has no controls: nobody changes their own role or switches
 * themselves off (platform/team.js). The server refuses it too.
 */
export function teamPage({ staff = [], roles = [], user = null, me = '', csrfToken = '', error = '', notice = '' } = {}) {
  const roleOptions = (current) =>
    roles
      .map(([key, label]) => `<option value="${h(key)}"${key === current ? ' selected' : ''}>${h(label)}</option>`)
      .join('');

  const state = (s) =>
    s.is_active === false ? statusTag('switched off') : !s.set_up ? statusTag('invited') : statusTag('active');

  const rows = staff.length
    ? listTable(
        [['Person'], ['Role'], ['Status'], ['Last sign-in'], ['Actions', { act: true }]],
        staff.map((s) => {
          const self = s.id === me;
          const role = (s.roles || [])[0] || '';
          return [
            `<b>${h(s.full_name || '—')}</b>${self ? ' <span class="muted">(you)</span>' : ''}<br><span class="muted">${h(s.email)}</span>`,
            self
              ? h(roles.find(([k]) => k === role)?.[1] || role || '—')
              : `<form method="post" action="/platform/team/${h(s.id)}/role" class="row">
        <input type="hidden" name="csrf" value="${h(csrfToken)}">
        <select name="role" aria-label="Role for ${h(s.email)}">${roleOptions(role)}</select>
        <button type="submit" class="ghost">Save</button>
      </form>`,
            `${state(s)}${s.set_up && !s.totp_enabled ? ' <span class="tag tag--warn">no authenticator</span>' : ''}`,
            { html: s.last_login_at ? h(when(s.last_login_at)) : 'never', cls: 'muted' },
            self
              ? ''
              : `<div class="row">${
                  !s.set_up && s.is_active !== false
                    ? `<form method="post" action="/platform/team/${h(s.id)}/resend">
          <input type="hidden" name="csrf" value="${h(csrfToken)}">
          <button type="submit" class="ghost">New invite link</button>
        </form>`
                    : ''
                }${
                  s.is_active === false
                    ? `<form method="post" action="/platform/team/${h(s.id)}/reactivate">
          <input type="hidden" name="csrf" value="${h(csrfToken)}">
          <button type="submit" class="ghost">Switch on</button>
        </form>`
                    : `<details class="confirm"><summary>Switch off</summary>
          <form method="post" action="/platform/team/${h(s.id)}/deactivate">
            <input type="hidden" name="csrf" value="${h(csrfToken)}">
            <p><b>${h(s.email || 'This person')}</b> loses the main admin panel from their next click. You can switch them on again.</p>
            <button type="submit" class="danger">Yes, switch off</button>
          </form></details>`
                }</div>`,
          ];
        })
      )
    : '<div class="empty">No staff yet.</div>';

  return layout({
    active: 'team',
    title: 'Team',
    user,
    body: `<h1>Team</h1>
<p class="lede">The Yoyo staff who run this panel. Everyone signs in with a password <b>and</b> an
authenticator code. Switching someone off stops them signing in at once.</p>
${error ? `<p class="err">${h(error)}</p>` : ''}
${notice ? `<div class="card" style="border-color:rgba(142,224,122,.4)">${h(notice)}</div>` : ''}

${rows}

<form class="card" method="post" action="/platform/team/invite">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Invite someone</h2>
  <div class="grid2" style="gap:12px">
    <label>Name<input name="full_name" required autocomplete="off"></label>
    <label>Email<input type="email" name="email" required autocomplete="off"></label>
  </div>
  <label>Role
    <select name="role">${roleOptions('reviewer')}</select>
  </label>
  <button type="submit">Send invitation</button>
  <p class="muted">They get a link that works once, for ${h(INVITE_TTL_HOURS)} hours, to choose a password
  and connect an authenticator app.</p>
</form>

<div class="card">
  <h2>What each role can do</h2>
  <dl class="facts">
    ${roles.map(([, label, what]) => `<dt>${h(label)}</dt><dd>${h(what)}</dd>`).join('\n    ')}
  </dl>
</div>`,
  });
}

/** The invite link, shown once, when the email could not be sent. */
export function inviteHandoverPage({ invite = {}, user = null } = {}) {
  return layout({
    active: 'team',
    title: 'Send this invitation yourself',
    user,
    body: `<h1>Invitation created — send the link yourself</h1>
<div class="card">
  <p><b>⚠️ The invitation email could not be sent${invite.emailReason ? ` (${h(invite.emailReason)})` : ''}.</b></p>
  <p class="muted">Send this link to <b>${h(invite.to || 'them')}</b> yourself. It works once and expires in
  ${h(INVITE_TTL_HOURS)} hours. <b>It is shown only now</b> — only a hash of it is stored.</p>
  <p><input readonly value="${h(invite.link)}" style="width:100%" aria-label="Invitation link" data-select></p>
</div>
<p><a class="btn" href="/platform/team">Back to the team →</a></p>`,
  });
}

// ---------------------------------------------------------------------------
// Platform settings — every switch, read-only (CLAUDE.md §16, §40.1)
// ---------------------------------------------------------------------------

/**
 * The switches that decide what this platform does, and whether each is set.
 *
 * NAMES AND STATES ONLY. Not one value is shown: several of these are secrets,
 * and a settings page is exactly the screen that ends up in a screenshot. The
 * switches themselves live in Vercel's environment, where changing them needs a
 * redeploy — deliberately, for the ones that move money or create databases.
 */
export function settingsPage({ switches = [], baseUrl = '', user = null, support = null, saved = false, csrfToken = '' } = {}) {
  // Editable here, unlike the switches: where owners reach Yoyo support
  // (§41.1 Q7). The WhatsApp line is shown to Prime owners only once saved.
  const supportForm = support
    ? `<form class="card" method="post" action="/platform/settings/support">
  <input type="hidden" name="csrf" value="${h(csrfToken)}">
  <h2>Support contacts</h2>
  <p class="muted">Shown to every gym owner on their page. The WhatsApp line is shown to Prime owners, as their plan
  promises; until a number is saved they see the email.</p>
  ${saved ? '<p style="color:#8ee07a">Saved.</p>' : ''}
  <div class="two">
    <label>Support email<input type="email" name="email" value="${h(support.email)}" required></label>
    <label>Prime WhatsApp line<input type="tel" name="whatsapp" value="${h(support.whatsapp)}" placeholder="+27 82 123 4567"></label>
  </div>
  <button type="submit">Save support contacts</button>
</form>`
    : '';
  const rows = listTable(
    [['Switch'], ['State'], ['Variable']],
    switches.map((s) => [
      `<b>${h(s.label)}</b><br><span class="muted">${h(s.what)}</span>`,
      s.on
        ? `<span class="tag tag--good">${h(s.onText || 'on')}</span>`
        : `<span class="tag tag--${s.warn ? 'bad' : 'warn'}">${h(s.offText || 'off')}</span>`,
      { html: `${h(s.name)}${s.note ? `<br>${h(s.note)}` : ''}`, cls: 'muted' },
    ])
  );

  return layout({
    active: 'settings',
    title: 'Settings',
    user,
    body: `<h1>Settings</h1>
<p class="lede">Every switch that decides what the platform does, and whether it is set. Values are never
shown here — several are secrets. They are changed in Vercel → Settings → Environment Variables, and take
effect after a redeploy.</p>

${rows}

${supportForm}

<div class="card">
  <h2>Addresses</h2>
  <dl class="facts">
    <dt>This panel</dt><dd>${h(baseUrl)}/platform/login</dd>
    <dt>Gym owner sign-up</dt><dd>${h(baseUrl)}/platform/apply</dd>
    <dt>Privacy policy</dt><dd><a href="/platform/privacy">${h(baseUrl)}/platform/privacy</a></dd>
    <dt>Gym Owner Agreement</dt><dd><a href="/platform/terms">${h(baseUrl)}/platform/terms</a></dd>
  </dl>
</div>`,
  });
}

// ---------------------------------------------------------------------------
// Privacy policy
// ---------------------------------------------------------------------------

/**
 * The privacy policy — required by both stores, and by POPIA.
 *
 * EVERY STATEMENT HERE WAS CHECKED AGAINST THE CODE on 2026-09-24: the member
 * columns in db/schema.sql, the owner alert templates, the retention rules
 * (D-071, D-121), the providers actually called. It describes what the system
 * does, not what a policy usually says. When the system changes, this must.
 *
 * NOT IN FORCE UNTIL SOMEONE SAYS SO. A privacy policy is a legal promise;
 * it is shown as a draft until PLATFORM_PRIVACY_APPROVED=true, the same way
 * billing and provisioning are dry runs until switched on.
 *
 * @param {object} opts
 * @param {boolean} opts.approved  PLATFORM_PRIVACY_APPROVED
 * @param {string}  opts.contact   PLATFORM_PRIVACY_CONTACT — where to write
 * @param {string}  opts.operator  the business that runs Yoyo Gyms
 */
export function privacyPage({ approved = false, contact = '', operator = 'MuleSoo Digital Solutions' } = {}) {
  const contactLine = contact
    ? `<a href="mailto:${h(contact)}">${h(contact)}</a>`
    : '<i>the contact address will be added before this policy takes effect</i>';

  return layout({
    title: 'Privacy policy',
    indexable: approved,
    body: `
<div class="card">
  ${approved ? '' : `<p class="err">DRAFT — under review and not yet in force.</p>`}
  <h1>Privacy policy</h1>
  <p>Yoyo Gyms connects gyms with their members and runs each gym's own system. It is operated by
  ${h(operator)}. Questions about this policy: ${contactLine}.</p>

  <h2>Who is responsible for what</h2>
  <p><b>If you are a gym member</b>, your gym decides what it collects about you and why, and is
  responsible for it. We store and process it for your gym, and nothing else. Each gym's records are
  kept separate from every other gym's.</p>
  <p><b>If you own a gym</b>, we are responsible for the information about you and your business.</p>

  <h2>What your gym may collect about you</h2>
  <ul>
    <li><b>Identity and contact:</b> name, date of birth, gender, ID or passport number, nationality,
    phone, email, address, and an emergency contact. For a minor, a guardian's consent.</li>
    <li><b>Your membership:</b> plan, dates, payments your gym records, check-ins, class bookings,
    training notes, progress entries you add, and messages with your gym.</li>
    <li><b>Health:</b> your answers to the PAR-Q health questions, injuries you tell your gym about,
    and whether you have medical aid. Used for your safety when you exercise.</li>
    <li><b>A photo</b> for your membership card.</li>
    <li><b>Face data, only if you agree to it:</b> a set of numbers made from your photo, used to
    recognise you at check-in and sign-in. It is not a picture, and you can use the gym without it.</li>
  </ul>

  <h2>What we collect about gym owners</h2>
  <ul>
    <li>Your name, email, password (stored only in a form that cannot be reversed) and your gym's details.</li>
    <li>The documents you upload with your application.</li>
    <li>For your subscription, Paystack handles your card. We keep only a token that lets us charge the
    same card again, and the card type and last four digits so you can recognise it. We never see or
    store the card number.</li>
  </ul>

  <h2>The app</h2>
  <ul>
    <li><b>Camera:</b> only when you press Scan, to read a gym's QR code. No image is kept.</li>
    <li><b>Location:</b> only when you press "Use my location", to show the nearest gyms first. It is
    not saved to your account.</li>
    <li>The app remembers which gym you chose, on your phone only. You can make it forget.</li>
  </ul>

  <h2>Who else handles it</h2>
  <ul>
    <li><b>Supabase</b> stores the databases. <b>Vercel</b> runs the service.</li>
    <li><b>Brevo</b> sends emails — membership confirmations, reminders and account emails.</li>
    <li><b>Paystack</b> takes gym owners' subscription payments.</li>
    <li><b>CallMeBot</b>, if your gym switches it on, sends the gym owner WhatsApp or Telegram alerts.
    A new-member alert includes the member's name, membership number, phone, email and whether the
    PAR-Q health questions need a doctor's clearance.</li>
  </ul>
  <p>These providers may store information outside your country.</p>

  <h2>How long it is kept</h2>
  <ul>
    <li>A member's records are kept until the gym deletes them, or until you ask for them to be deleted.</li>
    <li>When a gym closes, its records are kept for 90 days in case it reopens, and then deleted after
    we have confirmed it with the gym.</li>
    <li>Documents from an application we decline are deleted 90 days after the decision.</li>
  </ul>

  <h2>Your rights</h2>
  <p>You can ask to see, correct or delete what is held about you. Members: ask your gym, or use
  <b>Delete my account</b> in the app or the member area. Everyone: <a href="/platform/delete-account">how to
  delete your account</a>. In South Africa you may also complain to the Information Regulator.</p>

  <h2>Changes</h2>
  <p>If this policy changes, the new version is published here with its date.</p>
</div>`,
  });
}

// ---------------------------------------------------------------------------
// The front door
// ---------------------------------------------------------------------------

/**
 * What a visitor to the website sees first.
 *
 * The site root used to redirect straight to the STAFF sign-in, with no link
 * anywhere to joining a gym or listing one. The owner application and the gym
 * finder existed and nobody could reach them from the website. The staff
 * panel is still the website's main job (D-133); this page only makes sure a
 * gym member or a gym owner who arrives here has a way forward.
 */
export function welcomePage({ plans = [], includes = EVERY_PLAN_INCLUDES } = {}) {
  // The website's front door, made to match the app's first screen (CLAUDE.md
  // §36): the user's photograph — which already carries the Yoyo Gyms logo, so
  // no header logo is added above it (§36.1 Q11) — the headline, and every
  // choice a person arrives with. The main admin panel is still the website's
  // main job (D-133); this page makes sure a member or an owner has a way in.
  //
  // ONE lime button on the page — "Join a gym", the member choice being the
  // primary one, as on the app's first screen (§36) — and every other way in
  // grouped under it (design critique 2026-09-29: nine actions, two lime).
  //
  // Below the choices, WHAT AN OWNER GETS (#owners): what every plan includes,
  // each plan's services and support, and Yoyo's commitments (§41.1 Q6). It
  // was the top of the application form, which made step 1 a 7000px sales
  // page; the form now links here. Every line is something the product or the
  // team actually does (the same data as before: plans.js).
  const planColumns = plans
    .map(
      (p, i) => `<section class="pitch-plan${p.key === 'medium' ? ' plan-rec' : ''}" aria-labelledby="pp-${h(p.key)}">
      <div class="plan-top"><h3 id="pp-${h(p.key)}" class="plan-name">${h(p.label)}</h3>${
        p.key === 'medium' ? '<span class="plan-badge">Recommended</span>' : ''
      }</div>
      <p class="plan-price store-hide">${planPrice(p)}</p>
      <p class="plan-limit">${h(p.memberLimit)}${trialLine(p)}</p>
      ${p.summary ? `<p class="muted">${h(p.summary)}</p>` : ''}
      ${planDetails(p, i > 0 ? plans[i - 1] : null)}
    </section>`
    )
    .join('\n    ');

  return layout({
    title: 'Yoyo Gyms',
    indexable: true,
    bare: true,
    bodyClass: 'landing',
    body: `<style>${SIGNUP_STYLE}
  body.landing main { max-width: 960px; padding: 0 0 48px; }
  .land-hero { position: relative; height: min(56vh, 520px); min-height: 260px; overflow: hidden; }
  .land-hero img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0; }
  .land-hero::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 50%;
                      background: linear-gradient(rgba(7,12,16,0), var(--bg) 92%); }
  .land-body { position: relative; margin-top: -64px; padding: 0 20px; text-align: center; }
  body.landing .land-h { font-size: clamp(32px, 8vw, 48px); line-height: 1.04; font-weight: 800; text-transform: uppercase;
            letter-spacing: -0.01em; margin: 0 0 12px; max-width: none; }
  .land-h span { display: block; color: var(--accent); }
  .land-lede { font-size: 16px; max-width: 32ch; margin: 0 auto 32px; }
  .land-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); text-align: left; }
  .land-card { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 24px; display: grid; gap: 12px;
               align-content: start; }
  body.landing .land-card h2 { margin: 0; font-size: 20px; }
  .land-card p { margin: 0 0 4px; }
  .btn { display: flex; align-items: center; justify-content: center; min-height: 52px; border-radius: 26px;
         font-weight: 800; text-decoration: none; background: var(--accent); color: var(--accent-ink); }
  .btn.ghost { background: transparent; color: var(--ink); border: 1.5px solid rgba(255,255,255,.86); }
  .btn:hover { filter: brightness(1.08); }
  .land-small { font-size: 13px; }
  .land-small a { color: var(--ink); }
  .land-foot { margin-top: 32px; text-align: center; font-size: 13px; display: grid; gap: 6px; justify-items: center; }
  .land-foot a { color: var(--muted); }
  .land-foot b { color: var(--muted); font-weight: 700; }

  /* The owner pitch. */
  .pitch { padding: 56px 20px 0; border-top: 1px solid var(--line); margin-top: 48px; }
  body.landing .pitch h2 { font-size: 28px; line-height: 1.15; margin: 0 0 10px; }
  .pitch h3 { margin: 0; }
  .pitch-lede { color: var(--muted); margin: 0 0 16px; }
  .pitch-points { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0 0 8px; font-weight: 700; }
  .pitch .apply-sec > h2, .pitch .apply-sec > h3 { font-size: 20px; line-height: 1.25; margin: 0 0 14px; }
  .includes { display: grid; gap: 0 32px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin: 0; }
  .includes div { border-top: 1px solid var(--line); padding: 14px 0; }
  .includes dt { font-weight: 800; }
  .includes dd { margin: 4px 0 0; color: var(--muted); }
  .pitch-plans { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); align-items: start; }
  .pitch-plan { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 22px; display: grid;
                align-content: start; }
  .pitch-plan > p { margin: 0; }
  .pitch-plan .plan-price { margin-top: 6px; }
  .pitch-plan .ticks { font-size: 14px; }
  .pitch-go { display: grid; gap: 10px; justify-items: start; margin-top: 28px; }
  .pitch-go .btn { padding: 0 28px; }

  /* A computer: the photograph in a phone-width panel beside the choices, never
     shown larger than it really is (941 px wide — §39.1 Q2), so it stays sharp. */
  @media (min-width: 900px) {
    body.landing main { max-width: 1200px; padding: 48px 32px; }
    .land { display: grid; grid-template-columns: 440px 1fr; gap: 56px; align-items: center; min-height: calc(100vh - 96px); }
    .land-grid { grid-template-columns: 1fr 1fr; }
    .land-hero { height: auto; min-height: 0; aspect-ratio: 941 / 956; border-radius: 28px;
                 box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06); }
    .land-hero::after { height: 30%; }
    .land-body { margin-top: 0; padding: 0; text-align: left; }
    .land-lede { margin: 0 0 32px; }
    .land-foot { justify-items: start; text-align: left; }
    .pitch { padding: 64px 0 0; }
  }
</style>
<div class="land">
<div class="land-hero"><img src="/brand/landing-hero.jpg" width="941" height="956"
  alt="Yoyo Gyms — lift, train, transform. A member training with a dumbbell."></div>
<div class="land-body">
  <h1 class="land-h">Your gym.<span>Your journey.</span></h1>
  <p class="muted land-lede">Connect to your gym, manage your membership, and stay committed to your goals.</p>

  <div class="land-grid">
    <section class="land-card">
      <h2>I’m a member</h2>
      <p class="muted">Choose your gym first, then join or sign in.</p>
      <a class="btn" href="/platform/find?next=join">Join a gym</a>
      <a class="btn ghost" href="/platform/find?next=signin">Member sign in</a>
    </section>
    <section class="land-card">
      <h2>I’m a gym owner</h2>
      <p class="muted">Sign in to your gym, or to your application if your gym is not open yet. New here? Bring your gym to Yoyo.</p>
      <a class="btn ghost" href="/owner/login">Owner sign in</a>
      <a class="btn ghost" href="/platform/apply">Apply to join Yoyo Gyms</a>
      <p class="land-small"><a href="#owners">What you get with Yoyo Gyms</a></p>
    </section>
  </div>

  <div class="muted land-foot">
    <p><b>Staff</b> · <a href="/platform/find?next=admin">Gym staff sign in</a> · <a href="/platform/login">Yoyo staff sign in</a></p>
    <p><a href="/platform/privacy">Privacy policy</a> · <a href="/platform/delete-account">Delete your account</a></p>
  </div>
</div>
</div>

<section class="pitch" id="owners" aria-labelledby="owners-h">
  <h2 id="owners-h">Bring your gym to Yoyo Gyms</h2>
  <p class="pitch-lede">Your own branded member app, check-in at the door, payments, classes and more, and we set it up
  with you. Every plan starts with a free trial.</p>
  <p class="pitch-points"><span>Verified gyms only</span><span>A free trial</span><span>Your own branded app</span><span>Your data kept separate</span></p>
  ${
    includes.length
      ? `<div class="apply-sec">
    <h3>Every plan includes</h3>
    <dl class="includes">
      ${includes.map(([title, text]) => `<div><dt>${h(title)}</dt><dd>${h(text)}</dd></div>`).join('\n      ')}
    </dl>
  </div>`
      : ''
  }
  ${
    planColumns
      ? `<div class="apply-sec">
    <h3>The plans</h3>
    <div class="pitch-plans">
    ${planColumns}
    </div>
    <p class="muted" style="margin-top:12px">You can move to another plan at any time. Moving down never deletes a member.</p>
  </div>`
      : ''
  }
  <div class="pitch-go">
    <a class="btn ghost" href="/platform/apply">Apply to join Yoyo Gyms</a>
    <p class="muted">A person checks every application. You upload three documents: your ID, your business registration
    and proof of the gym's address.</p>
  </div>
</section>`,
  });
}


/** The Gym Owner Agreement, as a page — the same text as the PDF. */
export function termsPage({ sections = [], version = '', approved = false } = {}) {
  return layout({
    title: 'Gym Owner Agreement',
    indexable: approved,
    body: `<div class="card">
  ${approved ? '' : '<p class="err">DRAFT — under review and not yet in force.</p>'}
  <h1>Gym Owner Agreement</h1>
  <p class="muted">Version ${h(version)}</p>
  ${sections.map((x) => `<h2>${h(x.heading)}</h2><p>${h(x.body)}</p>`).join('')}
</div>`,
  });
}
