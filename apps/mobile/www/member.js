/*
 * The member's own area — the app's native screens (Stage 8).
 *
 * WHAT THIS REPLACES: after a member picked their gym, the app used to open
 * the gym's WEBSITE inside itself. That works, but it is a web page in an app
 * frame: no tab bar, no card that works without signal, a reload for every
 * tap. These screens call the SAME member API the website does
 * (/api/member/*), so every rule is still enforced once, on the server.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *   · Registration. The 38-step flow with the PAR-Q health questions stays on
 *     the gym's own web screens (capacitor.config.ts explains why a second
 *     implementation of it would be a second place to handle health answers
 *     wrongly). "Join this gym" opens that flow.
 *   · Anything a member is not already allowed to do on the website.
 *
 * STORAGE, stated plainly: the session token and a cached copy of the card
 * live in this app's own storage on the phone (the app's private origin, not
 * shared with any website). A hardware-backed secure store is a later step,
 * recorded in the vault; clearing the app's data signs the member out.
 *
 * No dependencies beyond vendor-qrcode.js, which is generated from the same
 * `qrcode` package the website uses.
 */
(function () {
  'use strict';

  var shell = window.YOYO_SHELL;
  var SERVER = shell.defaultServer.replace(/\/+$/, '');
  var SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;

  var root = document.getElementById('member');
  var state = { slug: null, gymName: '', logo: '', brand: {}, token: null, status: null, features: null, tab: 'home', prefill: '' };

  // -------------------------------------------------------------------------
  // Storage — per gym, so a member of two gyms keeps two sessions
  // -------------------------------------------------------------------------

  function key(name) { return 'yoyo.member.' + name + ':' + state.slug; }

  // Which side of the app this phone was last on — app.js opens it again next
  // time (CLAUDE.md §38.1 Q1). Only 'member' or nothing; never who.
  function setLastRole(role) {
    try {
      if (role) localStorage.setItem('yoyo.lastrole', role);
      else localStorage.removeItem('yoyo.lastrole');
    } catch (e) { /* not remembered: the app opens on the Yoyo front page */ }
  }

  function load(name) {
    try { return JSON.parse(localStorage.getItem(key(name)) || 'null'); } catch (e) { return null; }
  }

  function save(name, value) {
    try {
      if (value === null) localStorage.removeItem(key(name));
      else localStorage.setItem(key(name), JSON.stringify(value));
    } catch (e) { /* storage refused: the session lasts until the app closes */ }
  }

  // -------------------------------------------------------------------------
  // The API — the same endpoints the gym's website calls
  // -------------------------------------------------------------------------

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json', 'X-Gym-Slug': state.slug };
    if (opts.auth !== false && state.token) headers.Authorization = 'Bearer ' + state.token;

    return fetch(SERVER + '/api' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.ok) return data;
        var err = new Error((data && data.error) || 'Something went wrong. Please try again.');
        err.status = r.status;
        // A session the server no longer accepts: back to sign-in, once.
        if (r.status === 401 && opts.auth !== false) signOut(true);
        throw err;
      });
    }, function () {
      var err = new Error('No connection. Check your signal and try again.');
      err.offline = true;
      throw err;
    });
  }

  // -------------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------------

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function firstName(full) { return String(full || '').trim().split(/\s+/)[0] || 'there'; }

  function dateText(ymd) {
    if (!ymd) return '';
    var d = new Date(String(ymd).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function dayText(ymd) {
    var d = new Date(String(ymd).slice(0, 10) + 'T00:00:00');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  }

  /** Today's date on this phone, as YYYY-MM-DD. */
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function has(feature) { return !state.features || state.features.indexOf(feature) !== -1; }

  function toast(text, tone) {
    var t = document.createElement('div');
    t.className = 'm-toast' + (tone === 'bad' ? ' is-bad' : '');
    t.setAttribute('role', 'status');
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, 2600);
    setTimeout(function () { t.remove(); }, 3000);
  }

  function haptic() {
    try { window.Capacitor && window.Capacitor.Plugins.Haptics && window.Capacitor.Plugins.Haptics.impact({ style: 'MEDIUM' }); } catch (e) { /* none */ }
  }

  // -------------------------------------------------------------------------
  // Branding — the gym's own name and colour
  // -------------------------------------------------------------------------

  /**
   * The text colour that reads ON a gym's colour: white, unless white is under
   * 3:1 on it (as on the Yoyo lime) — then the dark ink. The same WCAG rule as
   * shared/brand.js inkOn(), written out because the shell has no modules.
   */
  function inkOn(hex) {
    var n = parseInt(hex.slice(1), 16);
    var lum = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      var c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
    return 1.05 / (L + 0.05) >= 3 ? '#ffffff' : '#0b1400';
  }

  function applyBrand(branding) {
    var colour = branding && /^#[0-9a-fA-F]{6}$/.test(branding.accent_color || '') ? branding.accent_color : null;
    if (colour) {
      root.style.setProperty('--m-accent', colour);
      root.style.setProperty('--m-accent-ink', inkOn(colour));
    } else {
      // No colour chosen: the Yoyo lime from the stylesheet (CLAUDE.md §37).
      root.style.removeProperty('--m-accent');
      root.style.removeProperty('--m-accent-ink');
    }
    if (branding && branding.name) state.gymName = branding.name;
    // The gym's own logo, if it uploaded one — the same rule the server applies.
    var logo = branding && branding.logo_url;
    state.logo = typeof logo === 'string' && /^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(logo) ? logo : '';

    // What the owner chose to show on the gym's home (§38.1 Q4). Text is
    // escaped where it is drawn; the cover is only ever the gym's own https URL.
    var b = branding || {};
    var text = function (v) { return typeof v === 'string' ? v.trim().slice(0, 500) : ''; };
    state.brand = {
      cover: typeof b.cover_url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(b.cover_url) ? b.cover_url : '',
      notice: text(b.notice),
      hours: text(b.operating_hours),
      phone: text(b.phone),
      email: text(b.email),
      address: text(b.address),
    };
  }

  /**
   * The GYM's own icon (CLAUDE.md §37.1 Q7): its logo, or its first letter in
   * its colour. Members see their gym here, not the Yoyo Gyms logo.
   */
  function gymIcon(size) {
    if (state.logo) {
      return '<img class="m-gymicon m-gymicon--img" src="' + esc(state.logo) + '" alt="" style="height:' + size + 'px">';
    }
    var letter = (String(state.gymName || '').trim().charAt(0) || '·').toUpperCase();
    return '<span class="m-gymicon" aria-hidden="true" style="width:' + size + 'px;height:' + size + 'px;font-size:' +
      Math.round(size * 0.55) + 'px;border-radius:' + Math.round(size * 0.28) + 'px">' + esc(letter) + '</span>';
  }

  /** Redraw every gym icon on screen, once the gym's brand has arrived. */
  function paintIcons() {
    root.querySelectorAll('[data-gym-icon]').forEach(function (el) { el.innerHTML = gymIcon(Number(el.dataset.gymIcon)); });
  }

  function loadBrand() {
    var cached = load('brand');
    if (cached) applyBrand(cached);
    return api('/content', { auth: false }).then(function (d) {
      save('brand', d.branding || null);
      applyBrand(d.branding);
    }, function () { /* the cached brand, or the default, is fine */ });
  }

  // -------------------------------------------------------------------------
  // Opening a gym
  // -------------------------------------------------------------------------

  /**
   * Enter a gym's member area.
   * @param {string} slug
   * @param {object} [opts] { name, number (prefill from a scanned card), join (offer registration) }
   */
  function open(slug, opts) {
    opts = opts || {};
    if (!SAFE_SLUG.test(String(slug || ''))) return;
    state.slug = slug;
    state.gymName = opts.name || '';
    state.prefill = opts.number || '';
    state.token = load('token');
    state.status = load('status');
    state.features = state.status ? state.status.features || null : null;
    state.tab = 'home';

    document.body.classList.add('in-member');
    root.classList.remove('hidden');
    // The gym's name and colour arrive after the screen is drawn. Only the
    // NAME is updated in place — re-drawing the form would wipe whatever the
    // member had already started typing.
    loadBrand().then(function () {
      root.querySelectorAll('[data-gym-name]').forEach(function (el) { el.textContent = state.gymName || el.textContent; });
      paintIcons();
      // Signed in: redraw so the gym's own cover, notice and contact appear.
      // (Never the sign-in form, which may hold what the member is typing.)
      if (state.token && root.querySelector('.m-main')) render();
    });

    if (state.token) {
      setLastRole('member');
      render();
      refresh();
    } else {
      renderSignIn();
    }
  }

  /**
   * Is a member already signed in to this gym on this phone? The entry screens
   * use it to skip "Welcome to [Gym]" for somebody who is already in.
   */
  function hasSession(slug) {
    if (!SAFE_SLUG.test(String(slug || ''))) return false;
    try { return Boolean(JSON.parse(localStorage.getItem('yoyo.member.token:' + slug) || 'null')); } catch (e) { return false; }
  }

  /** Leave the gym, back to the Yoyo screen the member came from. */
  function close() {
    document.body.classList.remove('in-member');
    root.classList.add('hidden');
    root.innerHTML = '';
    if (window.YOYO_APP) window.YOYO_APP.resume();
  }

  function signOut(expired) {
    save('token', null);
    save('status', null);
    save('checkedIn', null);
    state.token = null;
    state.status = null;
    renderSignIn(expired ? 'Please sign in again.' : '');
  }

  // -------------------------------------------------------------------------
  // Sign in — the same membership number + phone as always (CLAUDE.md §9)
  // -------------------------------------------------------------------------

  // "Sign in to [Gym Name]" (CLAUDE.md §36). Joining is one screen back, on
  // "Welcome to [Gym]", so it is not repeated here.
  function renderSignIn(notice) {
    root.innerHTML =
      '<div class="m-signin">' +
      '  <button type="button" class="m-back" data-m="leave" aria-label="Back">← Back</button>' +
      '  <div class="m-hero">' +
      '    <div class="m-hero__icon" data-gym-icon="72">' + gymIcon(72) + '</div>' +
      '    <p class="m-eyebrow">Sign in to</p>' +
      '    <h1 data-gym-name>' + esc(state.gymName || 'your gym') + '</h1>' +
      '  </div>' +
      '  <form class="m-card" id="m-login" novalidate>' +
      (notice ? '<p class="m-note">' + esc(notice) + '</p>' : '') +
      '    <label for="m-mn">Membership number</label>' +
      '    <input id="m-mn" autocapitalize="characters" autocomplete="off" placeholder="GYM-2026-000123" value="' + esc(state.prefill) + '" required>' +
      '    <label for="m-ph">Phone number</label>' +
      '    <input id="m-ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="082 123 4567" required>' +
      '    <p class="m-err" id="m-login-err" role="alert"></p>' +
      '    <button type="submit" class="m-primary" id="m-login-btn">Sign in</button>' +
      '  </form>' +
      '  <div class="m-join">' +
      // Fills in the membership number from the member's own card, and
      // signs nobody in: the phone is still asked for (§14, §36.1 Q6).
      '    <button type="button" class="m-secondary" data-m="scan-card">Scan my membership card</button>' +
      '    <p class="m-err" id="m-scan-err" role="alert"></p>' +
      '    <button type="button" class="y-link" data-m="help">Need help?</button>' +
      '  </div>' +
      '</div>';

    var form = document.getElementById('m-login');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('m-login-btn');
      var err = document.getElementById('m-login-err');
      var mn = document.getElementById('m-mn').value.trim();
      var ph = document.getElementById('m-ph').value.trim();
      if (!mn || !ph) { err.textContent = 'Enter your membership number and phone number.'; return; }

      btn.disabled = true;
      btn.textContent = 'Signing in…';
      err.textContent = '';
      // remember: members stay signed in on their phone until they sign out (§38.1 Q2).
      api('/member/login', { method: 'POST', auth: false, body: { membership_number: mn, phone: ph, remember: true } })
        .then(function (d) {
          state.token = d.token;
          save('token', d.token);
          setLastRole('member');
          state.tab = 'home';
          render();
          refresh();
        }, function (e2) {
          err.textContent = e2.message;
          btn.disabled = false;
          btn.textContent = 'Sign in';
        });
    });
  }

  // -------------------------------------------------------------------------
  // The signed-in area
  // -------------------------------------------------------------------------

  var TABS = [
    { id: 'home', label: 'Home', icon: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
    { id: 'card', label: 'Card', icon: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15h4M7 11h10"/>' },
    { id: 'classes', label: 'Classes', icon: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 11h18"/>', needs: 'classes' },
    { id: 'profile', label: 'Profile', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>' },
  ];

  function visibleTabs() {
    return TABS.filter(function (t) { return !t.needs || has(t.needs); });
  }

  function render() {
    if (!visibleTabs().some(function (t) { return t.id === state.tab; })) state.tab = 'home';
    // On the home the gym's own hero carries its name and icon, so the small
    // header does not repeat them.
    root.classList.toggle('m-on-home', state.tab === 'home');

    root.innerHTML =
      '<header class="m-top">' +
      '  <span class="m-gymhead"><span data-gym-icon="32">' + gymIcon(32) + '</span>' +
      '  <span class="m-gym" data-gym-name>' + esc(state.gymName || 'My gym') + '</span></span>' +
      '</header>' +
      '<main class="m-main" id="m-main"></main>' +
      '<nav class="m-tabs" aria-label="Sections">' +
      visibleTabs().map(function (t) {
        return '<button type="button" class="m-tab' + (t.id === state.tab ? ' is-on' : '') + '" data-tab="' + t.id + '"' +
          (t.id === state.tab ? ' aria-current="page"' : '') + '>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' + t.icon + '</svg><span>' + t.label + '</span></button>';
      }).join('') +
      '</nav>';

    var main = document.getElementById('m-main');
    ({ home: renderHome, card: renderCard, classes: renderClasses, profile: renderProfile })[state.tab](main);
  }

  /** Fetch the member's status; keep a copy so the card works offline. */
  function refresh() {
    return api('/member/status').then(function (d) {
      state.status = d;
      state.features = d.features || null;
      save('status', d);
      if (root.querySelector('.m-main')) render();
    }, function (e) {
      if (e.offline && state.status) toast('Offline — showing your last saved details.');
      else if (!e.offline && e.status !== 401) toast(e.message, 'bad');
    });
  }

  // ---- Home ---------------------------------------------------------------

  function statusLine(s) {
    var member = (s && s.member) || {};
    var ms = (s && s.membership) || {};
    var map = {
      active: { tone: 'good', text: 'Active' },
      new: { tone: 'warn', text: 'Waiting for activation' },
      lapsed: { tone: 'bad', text: 'Expired' },
      suspended: { tone: 'bad', text: 'Suspended' },
      frozen: { tone: 'warn', text: 'Frozen' },
    };
    var st = map[member.status] || { tone: 'warn', text: member.status || 'Unknown' };
    var until = ms.end_date ? 'until ' + dateText(ms.end_date) : '';
    return { tone: st.tone, text: st.text, plan: ms.plan_name || 'Membership', until: until };
  }

  function renderHome(main) {
    var s = state.status;
    if (!s) { main.innerHTML = skeleton(); return; }

    var line = statusLine(s);
    var a = s.adherence || {};
    var visits = a.visits_30d || 0;
    var expected = a.expected_30d || 0;
    var pct = expected ? Math.min(100, Math.round((visits / expected) * 100)) : 0;

    main.innerHTML =
      gymHero() +
      '<section class="m-hello"><p class="m-eyebrow">Hi ' + esc(firstName(s.member && s.member.full_name)) + '</p>' +
      '<h1>' + esc(line.plan) + '</h1></section>' +
      (state.brand.notice
        ? '<section class="m-card m-notice" role="note"><b>From ' + esc(state.gymName || 'your gym') + '</b><p>' + esc(state.brand.notice) + '</p></section>'
        : '') +

      '<section class="m-card m-status is-' + line.tone + '">' +
      '  <span class="m-dot" aria-hidden="true"></span>' +
      '  <div><b>' + esc(line.text) + '</b><span>' + esc(line.until) + '</span></div>' +
      '</section>' +

      (s.has_outstanding
        ? '<section class="m-card m-owe"><b>Payment due</b><span>Please see reception to settle your balance.</span></section>'
        : '') +

      '<button type="button" class="m-checkin" id="m-checkin"' + (s.member && s.member.status !== 'active' ? ' disabled' : '') + '>' +
      '  <span class="m-checkin__ring" aria-hidden="true"></span>' +
      '  <span class="m-checkin__label">Check in</span>' +
      '</button>' +
      (s.member && s.member.status !== 'active'
        ? '<p class="m-hint">Check-in opens once your membership is active.</p>'
        : '<p class="m-hint">Tap when you arrive.</p>') +

      '<section class="m-card m-progress">' +
      '  <div class="m-progress__top"><span>Last 30 days</span><b class="m-num">' + visits + (expected ? '<small> / ' + expected + '</small>' : '') + '</b></div>' +
      '  <div class="m-bar"><i style="width:' + pct + '%"></i></div>' +
      '  <span class="m-sub">' + esc(visits === 1 ? '1 visit' : visits + ' visits') + (a.label ? ' · ' + esc(a.label) : '') + '</span>' +
      '</section>' +
      gymContact();

    var btn = document.getElementById('m-checkin');

    // CHECKED IN TODAY is remembered, not just animated. The refresh that
    // follows a check-in redraws this screen, and a success state held only
    // in the button would vanish the instant it appeared.
    if (load('checkedIn') === today()) {
      btn.disabled = true;
      btn.classList.add('is-done');
      btn.querySelector('.m-checkin__label').textContent = 'You\'re in!';
      btn.nextElementSibling.textContent = 'Checked in today. Have a great session.';
    }

    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.classList.add('is-busy');
      api('/member/checkin', { method: 'POST' }).then(function (d) {
        haptic();
        save('checkedIn', today());
        toast(d.message || 'Checked in.');
        renderHome(main);
        refresh();
      }, function (e) {
        btn.classList.remove('is-busy');
        btn.disabled = false;
        toast(e.message, 'bad');
      });
    });
  }

  function skeleton() {
    return '<div class="m-skel"><i></i><i></i><i class="is-tall"></i><i></i></div>';
  }

  // ---- Card — works with no signal ---------------------------------------

  function cardUrl(number) {
    // The same URL the website's card carries, so the gym's door scanner and
    // the app's own scanner read it exactly as they read the web card.
    return SERVER + '/g/' + encodeURIComponent(state.slug) + '/p/m/' + encodeURIComponent(number);
  }

  function renderCard(main) {
    var s = state.status;
    var m = (s && s.member) || null;
    if (!m) { main.innerHTML = skeleton(); return; }
    var line = statusLine(s);

    main.innerHTML =
      '<section class="m-pass">' +
      '  <div class="m-pass__head"><span>' + esc(state.gymName || 'Member') + '</span><span class="m-pill is-' + line.tone + '">' + esc(line.text) + '</span></div>' +
      '  <canvas id="m-qr" width="240" height="240" aria-label="Your membership QR code"></canvas>' +
      '  <b class="m-pass__name">' + esc(m.full_name) + '</b>' +
      '  <span class="m-num m-pass__no">' + esc(m.membership_number) + '</span>' +
      '  <span class="m-sub">' + esc(line.plan) + (line.until ? ' · ' + esc(line.until) : '') + '</span>' +
      '</section>' +
      '<p class="m-hint">Show this at the front desk. It works without signal.</p>';

    // A failed drawing must not take the card with it — the number and name
    // underneath are still what reception can read. toCanvas() without a
    // callback returns a PROMISE, so a try/catch alone would miss its failure.
    try {
      var drawn = window.YOYO_QRCODE.toCanvas(document.getElementById('m-qr'), cardUrl(m.membership_number), {
        width: 240, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#0e1416', light: '#ffffff' },
      });
      if (drawn && drawn.catch) drawn.catch(function () { /* the number is still readable */ });
    } catch (e) { /* the number underneath is still readable */ }
  }

  // ---- Classes -------------------------------------------------------------

  function renderClasses(main) {
    main.innerHTML = '<section class="m-hello"><h1>Classes</h1></section>' + skeleton();

    api('/member/classes').then(function (d) {
      var list = d.schedule || [];
      if (!list.length) {
        main.innerHTML = '<section class="m-hello"><h1>Classes</h1></section>' +
          '<div class="m-empty"><b>No classes this week</b><span>Your gym has not scheduled any yet. Check back soon.</span></div>';
        return;
      }

      var html = '<section class="m-hello"><h1>Classes</h1></section>';
      var day = null;
      list.forEach(function (c) {
        if (c.session_date !== day) {
          day = c.session_date;
          html += '<h2 class="m-day">' + esc(dayText(day)) + '</h2>';
        }
        var action = c.already_booked
          ? '<button type="button" class="m-chip is-on" data-cancel="' + esc(c.class_id) + '|' + esc(c.session_date) + '">Booked ✓</button>'
          : !c.allowed
            ? '<span class="m-chip is-off">Not on your plan</span>'
            : c.is_full
              ? '<button type="button" class="m-chip" data-book="' + esc(c.class_id) + '|' + esc(c.session_date) + '">Join waitlist</button>'
              : '<button type="button" class="m-chip" data-book="' + esc(c.class_id) + '|' + esc(c.session_date) + '">Book</button>';

        html +=
          '<div class="m-card m-class">' +
          '  <div class="m-class__time m-num">' + esc(String(c.start_time || '').slice(0, 5)) + '</div>' +
          '  <div class="m-class__body"><b>' + esc(c.name) + '</b>' +
          '    <span>' + esc([c.trainer, c.duration_minutes ? c.duration_minutes + ' min' : '', c.is_full ? 'Full' : c.available + ' spots left'].filter(Boolean).join(' · ')) + '</span></div>' +
          '  ' + action +
          '</div>';
      });
      main.innerHTML = html;
    }, function (e) {
      main.innerHTML = '<section class="m-hello"><h1>Classes</h1></section>' +
        '<div class="m-empty"><b>Could not load classes</b><span>' + esc(e.message) + '</span></div>';
    });
  }

  function bookOrCancel(attr, path, done) {
    var parts = attr.split('|');
    return api(path, { method: 'POST', body: { class_id: parts[0], session_date: parts[1] } }).then(function (d) {
      haptic();
      toast(d.message || done);
      renderClasses(document.getElementById('m-main'));
    }, function (e) { toast(e.message, 'bad'); });
  }

  // ---- Profile -------------------------------------------------------------

  /**
   * The top of the gym's home: its cover picture (if the owner uploaded one),
   * its icon and its name. The member is in THEIR gym's app (§38.1 Q1).
   */
  function gymHero() {
    var cover = state.brand.cover;
    return '<section class="m-gymhero' + (cover ? ' has-cover' : '') + '">' +
      (cover ? '<img class="m-gymhero__img" src="' + esc(cover) + '" alt="">' : '') +
      '<div class="m-gymhero__id"><span data-gym-icon="48">' + gymIcon(48) + '</span>' +
      '<b data-gym-name>' + esc(state.gymName || 'Your gym') + '</b></div>' +
      '</section>';
  }

  /**
   * Opening hours and one-tap contact, as the owner set them (§38.1 Q4). The
   * links leave the app for the phone's dialler, maps and mail.
   */
  function gymContact() {
    var b = state.brand;
    if (!b.hours && !b.phone && !b.email && !b.address) return '';
    var tel = b.phone.replace(/[^\d+]/g, '');
    var actions =
      (tel ? '<a class="m-action" href="tel:' + esc(tel) + '">Call</a>' : '') +
      (b.address ? '<a class="m-action" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(b.address) + '">Directions</a>' : '') +
      (/^[^\s@<>"]+@[^\s@<>"]+$/.test(b.email) ? '<a class="m-action" href="mailto:' + esc(b.email) + '">Email</a>' : '');
    return '<section class="m-card m-contact">' +
      '<h2>' + esc(state.gymName || 'Your gym') + '</h2>' +
      (b.hours ? '<p class="m-contact__row"><span class="m-sub">Opening hours</span><b>' + esc(b.hours) + '</b></p>' : '') +
      (b.address ? '<p class="m-contact__row"><span class="m-sub">Address</span><b>' + esc(b.address) + '</b></p>' : '') +
      (actions ? '<div class="m-actions">' + actions + '</div>' : '') +
      '</section>';
  }

  function renderProfile(main) {
    var m = (state.status && state.status.member) || {};
    main.innerHTML =
      '<section class="m-hello"><h1>' + esc(m.full_name || 'Profile') + '</h1><p class="m-sub m-num">' + esc(m.membership_number || '') + '</p></section>' +
      '<section class="m-card m-list">' +
      row('Phone', m.phone) + row('Emergency contact', [m.emergency_name, m.emergency_phone].filter(Boolean).join(' · ')) +
      '</section>' +
      '<section class="m-card m-list">' +
      '  <button type="button" class="m-row" data-m="web">Open the full member area<span>›</span></button>' +
      '  <button type="button" class="m-row" data-m="switch">Switch gym<span>›</span></button>' +
      '  <button type="button" class="m-row" data-m="privacy">Privacy policy<span>›</span></button>' +
      '</section>' +
      '<button type="button" class="m-secondary" data-m="signout">Sign out</button>' +
      '<button type="button" class="m-danger" data-m="delete">Request data deletion</button>';
  }

  function row(label, value) {
    return '<div class="m-row is-static"><span class="m-sub">' + esc(label) + '</span><b>' + esc(value || '—') + '</b></div>';
  }

  function requestDeletion() {
    if (!confirm('Ask ' + (state.gymName || 'your gym') + ' to delete your personal data? They will be told straight away. This cannot be undone once they act on it.')) return;
    api('/member/request-deletion', { method: 'POST' }).then(function (d) {
      toast(d.message || 'Your request has been sent to your gym.');
    }, function (e) { toast(e.message, 'bad'); });
  }

  // -------------------------------------------------------------------------
  // One click handler for the whole area
  // -------------------------------------------------------------------------

  root.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; render(); return; }

    var book = e.target.closest('[data-book]');
    if (book) { book.disabled = true; bookOrCancel(book.dataset.book, '/member/book-class', 'Booked.'); return; }

    var cancel = e.target.closest('[data-cancel]');
    if (cancel) {
      if (confirm('Cancel this booking?')) { cancel.disabled = true; bookOrCancel(cancel.dataset.cancel, '/member/cancel-booking', 'Booking cancelled.'); }
      return;
    }

    var act = e.target.closest('[data-m]');
    if (!act) return;
    var go = window.YOYO_APP.go;
    switch (act.dataset.m) {
      case 'leave': return close();
      case 'join': return go('/g/' + encodeURIComponent(state.slug) + '/register');
      case 'web': return go('/g/' + encodeURIComponent(state.slug) + '/member');
      case 'privacy': return go('/platform/privacy');
      case 'switch': setLastRole(''); return close();
      case 'signout': setLastRole(''); return signOut(false);
      case 'delete': return requestDeletion();
      case 'scan-card': return scanCard();
      case 'help':
        close();
        return window.YOYO_APP.help();
    }
  });

  /**
   * "Scan my membership card": the card's code fills in the number. Nothing
   * else — the member still types their phone number and presses Sign in.
   */
  function scanCard() {
    var err = document.getElementById('m-scan-err');
    err.textContent = '';
    window.YOYO_APP.scan('Point your camera at the QR code on your membership card').then(function (r) {
      if (r.message) { err.textContent = r.message; return; }
      var payload = r.payload;
      if (!payload) return; // backed out
      if (payload.kind === 'member') {
        // The card knows its gym. A card from another gym opens that gym's
        // sign-in, with the number filled in, rather than failing here.
        if (payload.slug !== state.slug) return open(payload.slug, { number: payload.membershipNumber });
        var input = document.getElementById('m-mn');
        input.value = payload.membershipNumber;
        document.getElementById('m-ph').focus();
        return;
      }
      err.textContent = payload.kind === 'gym'
        ? 'That is the gym’s own code. Scan the QR code on your membership card.'
        : payload.reason || 'That is not a membership card.';
    });
  }

  /**
   * Android's back button, inside the member area. Returns true if it was
   * handled here. Another tab goes back to Home; Home goes back to the gyms.
   */
  function back() {
    if (root.classList.contains('hidden')) return false;
    if (state.token && state.tab !== 'home' && root.querySelector('.m-main')) {
      state.tab = 'home';
      render();
      return true;
    }
    close();
    return true;
  }

  window.YOYO_MEMBER = Object.freeze({ open: open, close: close, back: back, hasSession: hasSession });
})();
