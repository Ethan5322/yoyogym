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

  // The row chevron, drawn from the app's own icon set.
  var CHEV = '<svg class="y-i m-row__chev" aria-hidden="true"><use href="#i-chev"/></svg>';

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

  // In the gym's plan, and not switched off by its owner (CLAUDE.md §41).
  function has(feature) {
    return (!state.features || state.features.indexOf(feature) !== -1) && (state.off || []).indexOf(feature) === -1;
  }

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
      // Where the gym is: its money and its phone format (critique 2026-09-29).
      currency: typeof b.currency === 'string' && /^[A-Z]{3}$/.test(b.currency) ? b.currency : '',
      dial: typeof b.dial === 'string' && /^[0-9]{1,4}$/.test(b.dial) ? b.dial : '',
    };

    // The gym's POSTER behind every member screen (CLAUDE.md §39.1 Q3, Q4) —
    // a CSS value, so only a plain https URL with no quotes or brackets.
    var poster = typeof b.poster_url === 'string' && /^https:\/\/[^\s"'<>()\\]+$/.test(b.poster_url) ? b.poster_url : '';
    if (poster) root.style.setProperty('--m-poster', 'url("' + poster + '")');
    else root.style.removeProperty('--m-poster');
    root.classList.toggle('has-poster', Boolean(poster));
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
    state.offer = load('offer');
    state.catalog = load('catalog');
    // The gym's plans and add-ons (CLAUDE.md §41.1 Q1) — kept, like the brand,
    // so the home still shows them offline.
    api('/catalog', { auth: false }).then(function (d) {
      state.catalog = { plans: d.plans || [], addons: d.addons || [] };
      save('catalog', state.catalog);
    }, function () { /* the kept copy, or nothing, is fine */ });
    return api('/content', { auth: false }).then(function (d) {
      save('brand', d.branding || null);
      applyBrand(d.branding);
      state.offer = d.offer || null;
      save('offer', state.offer);
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
    state.off = state.status && Array.isArray(state.status.services_off) ? state.status.services_off : [];
    state.tab = 'home';

    document.body.classList.add('in-member');
    root.classList.remove('hidden');
    // The gym's name and colour arrive after the screen is drawn. Only the
    // NAME is updated in place — re-drawing the form would wipe whatever the
    // member had already started typing.
    loadBrand().then(function () {
      root.querySelectorAll('[data-gym-name]').forEach(function (el) { el.textContent = state.gymName || el.textContent; });
      paintIcons();
      var ph = document.getElementById('m-ph');
      if (ph && !ph.value) ph.placeholder = phoneHint();
      // Signed in: redraw so the gym's own cover, notice and contact appear.
      // (Never the sign-in form, which may hold what the member is typing.)
      if (state.token && root.querySelector('.m-main')) render();
    });

    if (state.token) {
      setLastRole('member');
      render({ moveFocus: true });
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
      '    <input id="m-ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="' + esc(phoneHint()) + '" required>' +
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

    title('Sign in');
    focusHeading();

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
          render({ moveFocus: true });
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
    // Rewards and challenges share a tab, shown if the gym offers either (§41.1 Q3).
    { id: 'rewards', label: 'Rewards', icon: '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/>', needs: ['rewards', 'challenges'] },
    { id: 'profile', label: 'Profile', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>' },
  ];

  function visibleTabs() {
    return TABS.filter(function (t) { return !t.needs || [].concat(t.needs).some(has); });
  }

  /** The page's name, for the screen reader and the app switcher. */
  function title(section) {
    document.title = section + ' · ' + (state.gymName || 'Yoyo Gyms');
  }

  /**
   * Focus the view's heading, so a screen reader says where the member is now.
   * A view with no heading (the card) focuses its labelled main region; one
   * still loading (the home before the status arrives) is focused again once
   * its content is drawn, so focus is never simply lost to the page.
   */
  function focusHeading() {
    var h = root.querySelector('#m-main h1, #m-main h2, .m-signin h1');
    state.pendingFocus = !h && !state.status && Boolean(root.querySelector('#m-main'));
    var target = h || document.getElementById('m-main');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  /**
   * Draw the signed-in area.
   * @param {object} [opts] { moveFocus } — true when the member went somewhere
   *   (a tab, just signed in). A redraw because fresh data arrived keeps focus
   *   where it was instead of throwing it back to the top of the page.
   */
  function render(opts) {
    opts = opts || {};
    var active = document.activeElement;
    var keep = active && root.contains(active) && active.dataset && active.dataset.tab ? active.dataset.tab : null;
    if (!visibleTabs().some(function (t) { return t.id === state.tab; })) state.tab = 'home';
    // On the home the gym's own hero carries its name and icon, so the small
    // header does not repeat them.
    root.classList.toggle('m-on-home', state.tab === 'home');

    root.innerHTML =
      '<header class="m-top">' +
      '  <span class="m-gymhead"><span data-gym-icon="32">' + gymIcon(32) + '</span>' +
      '  <span class="m-gym" data-gym-name>' + esc(state.gymName || 'My gym') + '</span></span>' +
      '</header>' +
      '<main class="m-main" id="m-main" aria-label="' + esc((TABS.filter(function (t) { return t.id === state.tab; })[0] || {}).label || 'Home') + '"></main>' +
      '<nav class="m-tabs" aria-label="Sections">' +
      visibleTabs().map(function (t) {
        return '<button type="button" class="m-tab' + (t.id === state.tab ? ' is-on' : '') + '" data-tab="' + t.id + '"' +
          (t.id === state.tab ? ' aria-current="page"' : '') + '>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' + t.icon + '</svg><span>' + t.label + '</span></button>';
      }).join('') +
      '</nav>';

    var main = document.getElementById('m-main');
    ({ home: renderHome, card: renderCard, classes: renderClasses, rewards: renderRewards, profile: renderProfile })[state.tab](main);

    var tab = TABS.filter(function (t) { return t.id === state.tab; })[0];
    title(tab ? tab.label : 'Home');
    if (opts.moveFocus || state.pendingFocus) focusHeading();
    else if (keep) {
      var again = root.querySelector('[data-tab="' + keep + '"]');
      if (again) again.focus({ preventScroll: true });
    }
  }

  /** Fetch the member's status; keep a copy so the card works offline. */
  function refresh() {
    return api('/member/status').then(function (d) {
      state.status = d;
      state.features = d.features || null;
      state.off = Array.isArray(d.services_off) ? d.services_off : [];
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
      frozen: { tone: 'warn', text: 'Paused' },
    };
    var st = map[member.status] || { tone: 'warn', text: member.status || 'Unknown' };
    var until = ms.end_date ? 'until ' + dateText(ms.end_date) : '';
    return { tone: st.tone, text: st.text, plan: ms.plan_name || 'Membership', until: until };
  }

  /**
   * Money in the GYM's currency — it was always Rand, so an Ethiopian gym's
   * prices read as R. Formatted the way this phone formats money. A gym that
   * has not said where it is keeps the Rand it always had.
   */
  function money(n) {
    var currency = (state.brand && state.brand.currency) || 'ZAR';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency }).format(Number(n || 0));
    } catch (e) {
      return currency + ' ' + Number(n || 0).toFixed(2);
    }
  }

  /** The phone example for this gym's country: its dialling code, not a South African number. */
  function phoneHint() {
    var dial = state.brand && state.brand.dial;
    return dial ? '+' + dial + ' and your number' : 'The number you joined with';
  }

  /**
   * What stands between the member and checking in, and what to do about it.
   * "Waiting for activation" used to end the joining journey with no next step
   * — the real one, since members pay their gym directly, is paying at
   * reception, which is what activates them (2026-09-21).
   */
  function checkinHint(s) {
    var gym = state.gymName || 'your gym';
    switch (s.member && s.member.status) {
      case 'active': return 'Tap when you arrive.';
      case 'new': return 'Your membership starts when ' + gym + ' records your first payment. Pay at reception and check-in opens straight away.';
      case 'frozen': return 'Your membership is paused. Resume it in Profile to check in again.';
      case 'lapsed': return 'Your membership has ended. Renew at reception to check in again.';
      case 'suspended': return 'Check-in is on hold for your account. Please speak to reception.';
      default: return 'Check-in opens once your membership is active.';
    }
  }

  /**
   * What the gym offers (CLAUDE.md §41.1 Q1): its plans and prices, add-ons,
   * the services members can use, and its facilities — the same as its page
   * on the web. A section with nothing in it is left out.
   */
  function gymOffer() {
    var o = state.offer || {};
    var c = state.catalog || {};
    var plans = c.plans || [];
    var addons = c.addons || [];
    var services = o.services || [];
    var facilities = o.facilities || [];
    if (!plans.length && !addons.length && !services.length && !facilities.length) return '';
    return '<section class="m-offer" aria-label="What we offer">' +
      '<h2 class="m-offer__title">What ' + esc(state.gymName || 'your gym') + ' offers</h2>' +
      (plans.length
        ? '<h3 class="m-offer__h">Membership plans</h3>' + plans.map(function (p) {
            return '<div class="m-card m-plan">' + (p.is_featured ? '<span class="m-plan__tag">Most popular</span>' : '') +
              '<b>' + esc(p.name) + '</b>' +
              '<span class="m-plan__price">' + esc(money(p.monthly_price)) + '<small> / month</small></span>' +
              (Number(p.joining_fee) > 0 ? '<span class="m-sub">Joining fee ' + esc(money(p.joining_fee)) + '</span>' : '') +
              (p.description ? '<p class="m-sub">' + esc(p.description) + '</p>' : '') + '</div>';
          }).join('')
        : '') +
      (addons.length
        ? '<h3 class="m-offer__h">Add-on services</h3><div class="m-card m-list">' + addons.map(function (a) {
            return '<div class="m-list__row"><span><b>' + esc(a.name) + '</b>' + (a.description ? '<small>' + esc(a.description) + '</small>' : '') +
              '</span><b>' + esc(money(a.price)) + '</b></div>';
          }).join('') + '</div>'
        : '') +
      (services.length
        ? '<h3 class="m-offer__h">In your app</h3><ul class="m-checks">' + services.map(function (x) {
            return '<li>' + esc(x.text) + '</li>';
          }).join('') + '</ul>'
        : '') +
      (facilities.length
        ? '<h3 class="m-offer__h">Facilities</h3><div class="m-chips">' + facilities.map(function (f) {
            return '<span>' + esc(f) + '</span>';
          }).join('') + '</div>'
        : '') +
      '</section>';
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
      '<p class="m-hint">' + esc(checkinHint(s)) + '</p>' +

      '<section class="m-card m-progress">' +
      '  <div class="m-progress__top"><span>Last 30 days</span><b class="m-num">' + visits + (expected ? '<small> / ' + expected + '</small>' : '') + '</b></div>' +
      '  <div class="m-bar"><i style="width:' + pct + '%"></i></div>' +
      '  <span class="m-sub">' + esc(visits === 1 ? '1 visit' : visits + ' visits') + (a.label ? ' · ' + esc(a.label) : '') + '</span>' +
      '</section>' +
      gymContact() +
      gymOffer();

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
      // Pause and family, filled in once loaded (§41.1 Q3).
      '<div id="m-extras"></div>' +
      '<section class="m-card m-list">' +
      '  <button type="button" class="m-row" data-m="web">Open the full member area' + CHEV + '</button>' +
      '  <button type="button" class="m-row" data-m="switch">Switch gym' + CHEV + '</button>' +
      '  <button type="button" class="m-row" data-m="privacy">Privacy policy' + CHEV + '</button>' +
      '</section>' +
      '<button type="button" class="m-secondary" data-m="signout">Sign out</button>' +
      '<button type="button" class="m-danger" data-m="delete">Request data deletion</button>';
    loadExtras();
  }

  // ---- The member services (CLAUDE.md §41.1 Q3) ------------------------------

  function shortDate(ymd) {
    return new Date(String(ymd).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  /** Rewards and challenges: whichever of the two this gym offers. */
  function renderRewards(main) {
    main.innerHTML = '<section class="m-hello"><h1>Rewards</h1></section><div id="m-rw"></div><div id="m-ch"></div>';
    if (has('rewards')) {
      api('/member/rewards').then(function (d) {
        var box = document.getElementById('m-rw');
        if (!box) return;
        box.innerHTML =
          '<section class="m-card m-stats">' +
          '<div><b class="m-num">' + d.balance + '</b><span>points</span></div>' +
          '<div><b class="m-num">' + d.streak_weeks + '</b><span>week streak</span></div>' +
          '<div><b class="m-num">' + d.visits + '</b><span>visits</span></div>' +
          '</section>' +
          '<p class="m-hint">' + esc(d.points_per_visit + ' points a visit · a week counts at ' + d.streak_target + ' visits' +
            (d.next_badge ? ' · ' + d.next_badge.visits_to_go + ' to go for “' + d.next_badge.label + '”' : '')) + '</p>' +
          '<h3 class="m-offer__h">Badges</h3><div class="m-chips">' + d.badges.map(function (b) {
            return '<span class="' + (b.earned ? 'is-on' : 'is-off') + '">' + (b.earned ? '★ ' : '') + esc(b.label) + '</span>';
          }).join('') + '</div>' +
          '<h3 class="m-offer__h">Claim a reward</h3>' +
          (d.rewards.length
            ? '<div class="m-card m-list">' + d.rewards.map(function (r) {
                return '<div class="m-list__row"><span><b>' + esc(r.name) + '</b><small>' + esc(r.points + ' points' + (r.description ? ' · ' + r.description : '')) + '</small></span>' +
                  (r.can_claim
                    ? '<button type="button" class="m-mini" data-claim="' + esc(r.id) + '" data-claim-name="' + esc(r.name) + '">Claim</button>'
                    : '<span class="m-sub">' + (r.points - d.balance) + ' more</span>') + '</div>';
              }).join('') + '</div>'
            : '<p class="m-hint">Your gym has not added rewards yet.</p>');
      }, function (e) { toast(e.message, 'bad'); });
    }
    if (has('challenges')) {
      api('/member/challenges').then(function (d) {
        var box = document.getElementById('m-ch');
        if (!box) return;
        box.innerHTML = '<h3 class="m-offer__h">Challenges</h3>' + (d.challenges.length ? d.challenges.map(function (c) {
          var pct = Math.min(100, Math.round((c.progress / c.target_visits) * 100));
          return '<section class="m-card">' +
            '<b>' + esc(c.title) + '</b><p class="m-sub">' + esc(c.target_visits + ' visits · ' + shortDate(c.starts_on) + ' – ' + shortDate(c.ends_on) + ' · ' + c.people + ' taking part') + '</p>' +
            (c.joined
              ? '<div class="m-bar"><i style="width:' + pct + '%"></i></div><p class="m-sub">' + esc(c.done ? 'Done — well played!' : c.progress + ' of ' + c.target_visits + ' visits') + '</p>' +
                (c.board.length ? '<ol class="m-board">' + c.board.map(function (b) {
                  return '<li class="' + (b.you ? 'is-you' : '') + '"><span>' + b.rank + '. ' + esc(b.name) + (b.you ? ' (you)' : '') + '</span><b>' + b.progress + '</b></li>';
                }).join('') + '</ol>' : '') +
                '<button type="button" class="y-link" data-leave-ch="' + esc(c.id) + '">Leave</button>'
              : '<div class="m-actions"><button type="button" class="m-mini" data-join-ch="' + esc(c.id) + '">Join</button>' +
                '<button type="button" class="m-mini is-ghost" data-join-ch="' + esc(c.id) + '" data-off-board="1">Join, off the board</button></div>') +
            '</section>';
        }).join('') : '<p class="m-hint">No challenges running right now.</p>');
      }, function (e) { toast(e.message, 'bad'); });
    }
  }

  /** Pause and family, under the member's profile. */
  function loadExtras() {
    var box = document.getElementById('m-extras');
    if (!box) return;
    var parts = [];
    var done = function () { if (document.getElementById('m-extras')) box.innerHTML = parts.join(''); };
    if (has('freeze')) {
      api('/member/pause').then(function (d) {
        var r = d.rules;
        parts[0] = '<section class="m-card"><h2>Pause my membership</h2>' + (d.current
          ? '<p>Paused until <b>' + esc(shortDate(d.current.ends_on)) + '</b>. Your end date has moved on by ' + d.current.days + ' days.</p>' +
            '<button type="button" class="m-secondary" data-m="resume">I\'m back — end my pause</button>'
          : d.can_pause
            ? '<p class="m-sub">Travelling or injured? Pause for ' + r.min_days + '–' + r.max_days + ' days; your end date moves on by the same. ' +
              d.left_this_year + ' left this year.' + (r.fee > 0 ? ' A fee of R' + esc(r.fee) + ' is paid at reception.' : '') + '</p>' +
              '<label for="m-pause-days">Days</label><input id="m-pause-days" type="number" inputmode="numeric" min="' + r.min_days + '" max="' + r.max_days + '" value="' + Math.min(r.max_days, Math.max(r.min_days, 14)) + '">' +
              '<button type="button" class="m-primary" data-m="pause">Pause</button>'
            : '<p class="m-sub">' + (d.left_this_year === 0 ? 'You have used your pauses for this year.' : 'Pausing opens once your membership is active.') + '</p>') +
          '</section>';
        done();
      }, function () { /* not offered, or not set up yet: nothing shown */ });
    }
    if (has('family')) {
      api('/member/family').then(function (d) {
        if (!d.group) return;
        var g = d.group;
        parts[1] = '<section class="m-card"><h2>' + (g.kind === 'group' ? 'Your group' : 'Your family') + ': ' + esc(g.name) + '</h2><div class="m-chips">' +
          g.members.map(function (m) {
            return '<span class="' + (m.is_you ? 'is-on' : '') + '">' + esc(m.name) + (m.is_you ? ' (you)' : '') + (m.is_payer ? ' · pays' : '') + '</span>';
          }).join('') + '</div><p class="m-sub">' + (g.you_pay ? 'You pay for everyone.' : 'Paid for by the payer.') +
          ' Each extra member gets ' + g.discount_pct + '% off. Everyone keeps their own card.</p></section>';
        done();
      }, function () { /* nothing to show */ });
    }
  }

  function afterAction(p, message) {
    return p.then(function (d) { haptic(); toast(d.message || message); render(); refresh(); }, function (e) { toast(e.message, 'bad'); render(); });
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
    if (tab) { state.tab = tab.dataset.tab; render({ moveFocus: true }); return; }

    var book = e.target.closest('[data-book]');
    if (book) { book.disabled = true; bookOrCancel(book.dataset.book, '/member/book-class', 'Booked.'); return; }

    var cancel = e.target.closest('[data-cancel]');
    if (cancel) {
      if (confirm('Cancel this booking?')) { cancel.disabled = true; bookOrCancel(cancel.dataset.cancel, '/member/cancel-booking', 'Booking cancelled.'); }
      return;
    }

    var claim = e.target.closest('[data-claim]');
    if (claim) {
      if (confirm('Claim ' + claim.dataset.claimName + '?')) { claim.disabled = true; afterAction(api('/member/rewards', { method: 'POST', body: { reward_id: claim.dataset.claim } }), 'Claimed.'); }
      return;
    }
    var joinCh = e.target.closest('[data-join-ch]');
    if (joinCh) {
      joinCh.disabled = true;
      afterAction(api('/member/challenges', { method: 'POST', body: { challenge_id: joinCh.dataset.joinCh, action: 'join', show_on_board: !joinCh.dataset.offBoard } }), 'Joined.');
      return;
    }
    var leaveCh = e.target.closest('[data-leave-ch]');
    if (leaveCh) {
      if (confirm('Leave this challenge?')) afterAction(api('/member/challenges', { method: 'POST', body: { challenge_id: leaveCh.dataset.leaveCh, action: 'leave' } }), 'Left the challenge.');
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
      case 'pause': {
        var days = Number((document.getElementById('m-pause-days') || {}).value);
        if (confirm('Pause for ' + days + ' days from today? You cannot check in while paused.')) {
          afterAction(api('/member/pause', { method: 'POST', body: { days: days } }), 'Paused.');
        }
        return;
      }
      case 'resume':
        if (confirm('Come back now? The days you did not use come off your end date.')) afterAction(api('/member/pause', { method: 'POST', body: { action: 'resume' } }), 'Welcome back.');
        return;
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
