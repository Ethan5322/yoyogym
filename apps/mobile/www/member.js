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
  var state = { slug: null, gymName: '', token: null, status: null, features: null, tab: 'home', prefill: '' };

  // -------------------------------------------------------------------------
  // Storage — per gym, so a member of two gyms keeps two sessions
  // -------------------------------------------------------------------------

  function key(name) { return 'yoyo.member.' + name + ':' + state.slug; }

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

  function applyBrand(branding) {
    var colour = branding && /^#[0-9a-fA-F]{6}$/.test(branding.accent_color || '') ? branding.accent_color : null;
    if (colour) root.style.setProperty('--m-accent', colour);
    else root.style.removeProperty('--m-accent');
    if (branding && branding.name) state.gymName = branding.name;
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
    });

    if (state.token) {
      render();
      refresh();
    } else {
      renderSignIn(opts.join);
    }
  }

  function close() {
    document.body.classList.remove('in-member');
    root.classList.add('hidden');
    root.innerHTML = '';
    if (window.YOYO_APP) window.YOYO_APP.home();
  }

  function signOut(expired) {
    save('token', null);
    save('status', null);
    save('checkedIn', null);
    state.token = null;
    state.status = null;
    renderSignIn(false, expired ? 'Please sign in again.' : '');
  }

  // -------------------------------------------------------------------------
  // Sign in — the same membership number + phone as always (CLAUDE.md §9)
  // -------------------------------------------------------------------------

  function renderSignIn(offerJoin, notice) {
    root.innerHTML =
      '<div class="m-signin">' +
      '  <button type="button" class="m-back" data-m="leave" aria-label="Back to gyms">← Gyms</button>' +
      '  <div class="m-hero">' +
      '    <p class="m-eyebrow">Welcome to</p>' +
      '    <h1 data-gym-name>' + esc(state.gymName || 'your gym') + '</h1>' +
      '  </div>' +
      '  <form class="m-card" id="m-login" novalidate>' +
      '    <h2>Sign in</h2>' +
      (notice ? '<p class="m-note">' + esc(notice) + '</p>' : '') +
      '    <label for="m-mn">Membership number</label>' +
      '    <input id="m-mn" autocapitalize="characters" autocomplete="off" placeholder="GYM-2026-000123" value="' + esc(state.prefill) + '" required>' +
      '    <label for="m-ph">Phone number</label>' +
      '    <input id="m-ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="082 123 4567" required>' +
      '    <p class="m-err" id="m-login-err" role="alert"></p>' +
      '    <button type="submit" class="m-primary" id="m-login-btn">Sign in</button>' +
      '  </form>' +
      '  <div class="m-join">' +
      '    <p>' + (offerJoin ? 'New here?' : 'Not a member yet?') + '</p>' +
      '    <button type="button" class="m-secondary" data-m="join">Join ' + esc(state.gymName || 'this gym') + '</button>' +
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
      api('/member/login', { method: 'POST', auth: false, body: { membership_number: mn, phone: ph } })
        .then(function (d) {
          state.token = d.token;
          save('token', d.token);
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

    root.innerHTML =
      '<header class="m-top">' +
      '  <span class="m-gym" data-gym-name>' + esc(state.gymName || 'My gym') + '</span>' +
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
      '<section class="m-hello"><p class="m-eyebrow">Hi ' + esc(firstName(s.member && s.member.full_name)) + '</p>' +
      '<h1>' + esc(line.plan) + '</h1></section>' +

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
      '</section>';

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
      case 'switch': return close();
      case 'signout': return signOut(false);
      case 'delete': return requestDeletion();
    }
  });

  window.YOYO_MEMBER = Object.freeze({ open: open, close: close });
})();
