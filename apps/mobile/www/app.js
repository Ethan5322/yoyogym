/*
 * The entry screens' behaviour.
 *
 * The app's whole job before it reaches the server is to answer two questions:
 * WHICH SIDE (owner or member), and for a member, WHICH GYM. Everything after
 * that is rendered by the Yoyo Gyms server. The flow is CLAUDE.md §36, with
 * the user's answers in §36.1.
 *
 * It holds no session, stores no personal data, and makes two kinds of
 * request: a public gym search, and — only if the member asks for it — the
 * recovery lookup that names their gym.
 *
 * No dependencies: this runs before the app has reached a server.
 */
(function () {
  'use strict';

  var shell = window.YOYO_SHELL;
  var SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;

  var views = {};
  ['home', 'member-welcome', 'pick', 'forgot-panel', 'gym', 'join', 'owner-welcome', 'owner-apply', 'help']
    .forEach(function (id) { views[id] = document.getElementById(id); });

  var q = document.getElementById('q');
  var out = document.getElementById('results');
  var forgotBtn = document.getElementById('forgot');
  var pickTitle = document.getElementById('pick-title');
  var pickSub = document.getElementById('pick-sub');

  var coords = null;
  var timer = null;
  var pickMode = 'member'; // 'member' or 'owner' — what picking a gym on the search screen means
  var chosen = null;       // { slug, name } — the gym on "Welcome to" and "Join"

  // -------------------------------------------------------------------------
  // Navigation — a stack, so Back always returns to where the person came from
  // -------------------------------------------------------------------------

  var stack = ['home'];

  function current() { return stack[stack.length - 1]; }

  function render(name) {
    Object.keys(views).forEach(function (k) {
      views[k].classList.toggle('hidden', k !== name);
    });
    clearNote();
    if (name === 'member-welcome') renderMine();
    if (name === 'pick') renderAdminMine();
    window.scrollTo(0, 0);
    announce(views[name]);
  }

  // A SCREEN CHANGE IS SAID. Focus used to stay on the button that had just
  // been hidden, so a screen reader announced nothing and lost its place after
  // every tap (critique 2026-09-29). Focus moves to the new screen's heading,
  // and the page is named after it. Not on the very first screen: nothing has
  // changed yet, and focus there would only scroll a sighted person.
  var booted = false;
  function announce(view) {
    var heading = view && view.querySelector('h1');
    var label = heading ? heading.textContent.replace(/\s+/g, ' ').trim() : '';
    document.title = label ? label + ' · Yoyo Gyms' : 'Yoyo Gyms';
    if (!booted) { booted = true; return; }
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  /** Go forward to a screen. Home resets the stack: it is the root. */
  function show(name) {
    if (name === 'home') stack = ['home'];
    else if (current() !== name) stack.push(name);
    render(name);
  }

  /** Back one screen. False when already home — the caller puts the app away. */
  function back() {
    if (stack.length <= 1) return false;
    stack.pop();
    render(current());
    return true;
  }

  // The message line on whichever screen is showing.
  function noteEl() {
    return views[current()].querySelector('[data-note]');
  }

  function say(text, tone) {
    var el = noteEl();
    if (!el) return;
    el.className = tone === 'err' ? 'err' : 'note';
    el.textContent = text;
  }

  function clearNote() {
    var el = noteEl();
    if (el) { el.className = 'note'; el.textContent = ''; }
  }

  // -------------------------------------------------------------------------
  // "My gym" — remembered on this phone
  // -------------------------------------------------------------------------
  //
  // A member opens their gym several times a week and picks it once. Without
  // this, every launch began at "Which gym?" and a search.
  //
  // Only the gym's PUBLIC identity is kept — its slug and name, the same
  // things search shows a stranger. Never a session, never a membership
  // number: those belong to the gym's own screens. Storage can be refused
  // (private mode, a locked-down device); the app then simply asks again.
  //
  // An owner's gym is remembered under its own key: a phone shared by an owner
  // and a member must not open one's gym for the other.

  var MINE = 'yoyo.mygym';
  var ADMIN_MINE = 'yoyo.admingym';

  function rememberGym(slug, name, key) {
    try {
      localStorage.setItem(key || MINE, JSON.stringify({ slug: slug, name: name || slug }));
    } catch (e) {
      /* not remembered; asked again next time */
    }
  }

  function myGym(key) {
    try {
      var saved = JSON.parse(localStorage.getItem(key || MINE) || 'null');
      // The same rule the server applies to a slug. A value that is not one
      // was not written by this app.
      return saved && /^[a-z0-9][a-z0-9-]{0,47}$/.test(saved.slug) ? saved : null;
    } catch (e) {
      return null;
    }
  }

  function forgetGym(key) {
    try {
      localStorage.removeItem(key || MINE);
    } catch (e) {
      /* nothing to forget */
    }
  }

  /**
   * "Continue to [Gym]" — the gym saved on this phone, FIRST on "Welcome,
   * Member" and in its own mark (§36.1 Q5; design critique 2026-09-29: it was
   * listed last, under a generic title). Hidden when nothing is saved.
   */
  function renderMine() {
    var mine = myGym();
    document.getElementById('mine').classList.toggle('hidden', !mine);
    if (!mine) return;
    document.getElementById('mine-name').textContent = mine.name;

    var option = document.getElementById('mine-open');
    var mark = document.getElementById('mine-mark');
    function dress(branding) {
      var look = lookOf(branding);
      paintMark(mark, look, mine.name);
      // The option's edge in the gym's colour (index.html .y-option--saved).
      if (look.accent) option.style.setProperty('--g-accent', look.accent);
      else option.style.removeProperty('--g-accent');
    }
    // What this phone already knows first — offline too — then the gym's
    // current look, unless another gym has been saved in the meantime.
    dress(cachedBrand(mine.slug));
    fetchBrand(mine.slug).then(function (branding) {
      var now = myGym();
      if (now && now.slug === mine.slug) dress(branding);
    }, function () { /* the kept look, or the plain letter, stays */ });
  }

  function renderAdminMine() {
    var mine = pickMode === 'owner' ? myGym(ADMIN_MINE) : null;
    document.getElementById('admin-mine').classList.toggle('hidden', !mine);
    if (mine) document.getElementById('admin-mine-name').textContent = mine.name;
  }

  document.getElementById('mine-open').addEventListener('click', function () {
    var mine = myGym();
    if (mine) chooseGym(mine.slug, mine.name);
  });

  document.getElementById('mine-forget').addEventListener('click', function () {
    // On a shared or handed-down phone, the next person must not land in the
    // previous owner's gym.
    forgetGym();
    renderMine();
  });

  document.getElementById('admin-mine').addEventListener('click', function () {
    var mine = myGym(ADMIN_MINE);
    if (mine) goAdmin(mine.slug);
  });

  // -------------------------------------------------------------------------
  // "Your gym's app" — reopening where this phone was last (CLAUDE.md §38.1)
  // -------------------------------------------------------------------------
  //
  // Someone new sees the Yoyo Gyms front page (Q8). A member who joined a gym
  // opens straight into THAT gym's home (Q1); an owner or staff member opens
  // straight into their gym's admin panel (Q3). Only the side is remembered
  // ('member' / 'owner'), never who — the sessions themselves live with the
  // member area and with the gym's admin panel.

  var LASTROLE = 'yoyo.lastrole';

  function lastRole() {
    try { return localStorage.getItem(LASTROLE) || ''; } catch (e) { return ''; }
  }

  function setLastRole(role) {
    try {
      if (role) localStorage.setItem(LASTROLE, role);
      else localStorage.removeItem(LASTROLE);
    } catch (e) { /* not remembered: the app opens on the Yoyo front page */ }
  }

  /** The app's own front page, where "← Yoyo Gyms app" on the web sign-in returns. */
  function appHome() {
    return window.location.origin + window.location.pathname + '?home=1';
  }

  /**
   * Into a gym's own admin panel — its existing sign-in, which moves straight
   * on when the owner is still signed in. `app=1` makes that sign-in stay until
   * sign-out, and `back` is the way home to this app.
   */
  function goAdmin(slug) {
    setLastRole('owner');
    go(adminPath(slug) + '?app=1&back=' + encodeURIComponent(appHome()));
  }

  /**
   * The owners' email sign-in (§43.1 Q2). It lives on the website, where the
   * gym admin panel keeps its session; a phone already signed in goes straight
   * on to the owner's gym from there.
   */
  function ownerSignIn() {
    setLastRole('owner-email');
    go('/owner/login?app=1&back=' + encodeURIComponent(appHome()));
  }

  /** On opening: back to this phone's gym, or the Yoyo front page for someone new. */
  function resumeLast() {
    if (new URLSearchParams(window.location.search).get('home') === '1') {
      // The owner chose "← Yoyo Gyms app": stay here, and next time too.
      setLastRole('');
      return;
    }
    var role = lastRole();
    if (role === 'member') {
      var mine = myGym();
      if (mine && window.YOYO_MEMBER.hasSession(mine.slug)) window.YOYO_MEMBER.open(mine.slug, { name: mine.name });
    } else if (role === 'owner') {
      var admin = myGym(ADMIN_MINE);
      if (admin) goAdmin(admin.slug);
    } else if (role === 'owner-email') {
      ownerSignIn();
    }
  }

  // -------------------------------------------------------------------------
  // A gym's own look — from the moment it is chosen (critique 2026-09-29)
  // -------------------------------------------------------------------------
  //
  // "Gym identity arrives too late": search results and "Welcome to [Gym]"
  // wore a Yoyo lime badge, and the gym's own logo and colour appeared only
  // after sign-in. Now a gym looks like itself wherever it appears — its logo,
  // or its first letter in its colour (CLAUDE.md §37.1 Q7) — and its welcome
  // and join screens wear its cover, poster and colour too (§38.1 Q4, §39.1).
  // The Yoyo look stays on the screens before a gym is chosen.
  //
  // WHERE IT COMES FROM: the gym's public branding, from the same public call
  // the member area makes (member.js loadBrand: GET /api/content, addressed to
  // the gym by X-Gym-Slug). The registry's search answer carries no branding,
  // and needs none: this asks each gym, lazily, for the first few results.
  //
  // KEPT WHERE THE MEMBER AREA KEEPS IT: localStorage 'yoyo.member.brand:' +
  // slug, the gym's `branding` object as JSON — member.js key('brand') /
  // save('brand'). So a member who signs in next already has their gym's look,
  // offline too, and the two never disagree about what a gym looks like.

  var BRAND_KEY = 'yoyo.member.brand:';
  var BRAND_LOOKUPS = 8; // results asked for their look — enough for a screenful

  // What of a gym's branding may be drawn: member.js applyBrand()'s rules,
  // exactly. A colour is six hex digits; a logo is the gym's https picture or
  // an inline PNG / JPEG / WebP; a cover is plain https; a poster goes into a
  // CSS url(), so it may not hold quotes, brackets or spaces either.
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var LOGO = /^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/;
  var COVER = /^https:\/\/[^\s"'<>]+$/;
  var POSTER = /^https:\/\/[^\s"'<>()\\]+$/;
  var GROUND = '#070C10'; // --y-ground

  function cachedBrand(slug) {
    try {
      return JSON.parse(localStorage.getItem(BRAND_KEY + slug) || 'null');
    } catch (e) {
      return null;
    }
  }

  function keepBrand(slug, branding) {
    try {
      if (branding === null) localStorage.removeItem(BRAND_KEY + slug);
      else localStorage.setItem(BRAND_KEY + slug, JSON.stringify(branding));
    } catch (e) {
      /* not kept: the gym is asked again next time */
    }
  }

  /**
   * A gym's branding, reduced to what may be drawn. `known` is false when
   * there is nothing yet — the plain letter, promising no colour.
   */
  function lookOf(branding) {
    var b = branding && typeof branding === 'object' ? branding : null;
    var look = { known: Boolean(b), accent: '', ink: '', text: '', logo: '', cover: '', poster: '' };
    if (!b) return look;
    if (HEX.test(b.accent_color || '')) {
      // Words ON the colour: the pair that reaches 4.5:1 (member.js).
      var pair = window.YOYO_BRAND.accentPair(b.accent_color);
      look.accent = pair.accent;
      look.ink = pair.ink;
      // The colour AS words on the dark ground: the gym's own, where it reads.
      look.text = window.YOYO_BRAND.contrast(b.accent_color, GROUND) >= 4.5 ? b.accent_color : '#FFFFFF';
    }
    if (typeof b.logo_url === 'string' && LOGO.test(b.logo_url)) look.logo = b.logo_url;
    if (typeof b.cover_url === 'string' && COVER.test(b.cover_url)) look.cover = b.cover_url;
    if (typeof b.poster_url === 'string' && POSTER.test(b.poster_url)) look.poster = b.poster_url;
    return look;
  }

  // Asked once per gym while the app is open: typing "bo", "bos", "bos g"
  // shows the same gyms again, and must not ask them again. A failure is
  // forgotten, so the next showing may try once more.
  var brandAsked = {};

  function fetchBrand(slug) {
    if (brandAsked[slug]) return brandAsked[slug];
    var url = shell.defaultServer.replace(/\/+$/, '') + '/api/content';
    if (!allowed(url)) return Promise.reject(new Error('not an allowed address'));

    var asked = fetch(url, {
      method: 'GET',
      // Addressed to ONE gym exactly as member.js api() addresses it.
      headers: { 'Content-Type': 'application/json', 'X-Gym-Slug': slug },
    })
      .then(function (r) {
        if (!r.ok) throw new Error('content ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var branding = (d && d.branding) || null;
        keepBrand(slug, branding);
        return branding;
      });
    brandAsked[slug] = asked;
    asked.catch(function () {
      if (brandAsked[slug] === asked) delete brandAsked[slug];
    });
    return asked;
  }

  /**
   * Draw a gym's mark into `el` (index.html .g-mark): its logo, or its first
   * letter on its colour. A logo that will not load leaves the letter.
   */
  function paintMark(el, look, name) {
    if (!el) return;
    el.textContent = '';
    el.classList.toggle('is-known', look.known);
    el.classList.toggle('has-logo', Boolean(look.logo));
    if (look.accent) {
      el.style.setProperty('--g-accent', look.accent);
      el.style.setProperty('--g-accent-ink', look.ink);
    } else {
      el.style.removeProperty('--g-accent');
      el.style.removeProperty('--g-accent-ink');
    }

    if (look.logo) {
      var img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', function () {
        if (img.parentNode !== el) return; // already replaced
        paintMark(el, {
          known: look.known, accent: look.accent, ink: look.ink, text: look.text,
          logo: '', cover: look.cover, poster: look.poster,
        }, name);
      });
      img.src = look.logo;
      el.appendChild(img);
      return;
    }
    // Text somebody typed goes in as text, never as markup.
    el.textContent = String(name || '').trim().charAt(0).toUpperCase() || '·';
  }

  // Which list of results is the latest, per list. The same idea as the
  // search's searchSeq: an answer for a list that has since been redrawn is
  // not painted — the newer list asks (and is answered) for itself.
  var paintSeq = {};

  /** Give each result its gym's mark: at once from this phone, then from the gym. */
  function paintResults(list) {
    var mine = (paintSeq[list.id] || 0) + 1;
    paintSeq[list.id] = mine;
    var buttons = Array.prototype.slice.call(list.querySelectorAll('.gym'), 0, BRAND_LOOKUPS);
    buttons.forEach(function (button) {
      var slug = button.dataset.slug;
      if (!SAFE_SLUG.test(slug || '')) return;
      var mark = button.querySelector('.g-mark');
      var name = button.dataset.name || slug;
      paintMark(mark, lookOf(cachedBrand(slug)), name);
      // Never blocks the list: the letter is already there.
      fetchBrand(slug).then(function (branding) {
        if (paintSeq[list.id] !== mine) return;
        paintMark(mark, lookOf(branding), name);
      }, function () { /* the letter stays */ });
    });
  }

  /** The cover as the hero at the top of a gym screen — or none at all. */
  function showCover(view, url) {
    var box = view.querySelector('.g-cover');
    var img = box.querySelector('img');
    if (!url) {
      box.textContent = '';
      view.classList.remove('has-cover');
      return;
    }
    view.classList.add('has-cover');
    if (img && img.getAttribute('src') === url) return;
    box.textContent = '';
    img = document.createElement('img');
    img.alt = '';
    img.addEventListener('error', function () {
      // A cover that will not load is no cover: the screen stays whole.
      if (img.parentNode !== box) return;
      box.textContent = '';
      view.classList.remove('has-cover');
    });
    img.src = url;
    box.appendChild(img);
  }

  /**
   * Put a gym's look on "Welcome to [Gym]" and "Join [Gym]" — and only there,
   * as custom properties on those two sections, so no colour, poster or cover
   * can leak into a Yoyo screen. An empty look is the Yoyo default.
   */
  function applyLook(look) {
    ['gym', 'join'].forEach(function (id) {
      var view = views[id];
      [['--g-accent', look.accent], ['--g-accent-ink', look.ink], ['--g-accent-text', look.text]].forEach(function (v) {
        if (v[1]) view.style.setProperty(v[0], v[1]);
        else view.style.removeProperty(v[0]);
      });
      // The poster behind the screen (§39.1 Q3) — only the checked URL, so it
      // cannot close the url() it sits in.
      if (look.poster) view.style.setProperty('--g-poster', 'url("' + look.poster + '")');
      else view.style.removeProperty('--g-poster');
      view.classList.toggle('has-poster', Boolean(look.poster));
      showCover(view, look.cover);
      paintMark(view.querySelector('[data-gym-mark]'), look, chosen ? chosen.name : '');
    });
  }

  // Which gym's look is wanted on the gym screens now. Choosing another gym
  // makes any answer still on its way for the previous one stale.
  var dressSeq = 0;

  /** The chosen gym's look: this phone's copy at once, then the gym's own. */
  function dressGym(slug) {
    var mine = ++dressSeq;
    // Starts from the Yoyo default: nothing of the previous gym survives.
    applyLook(lookOf(cachedBrand(slug)));
    fetchBrand(slug).then(function (branding) {
      if (mine !== dressSeq || !chosen || chosen.slug !== slug) return;
      applyLook(lookOf(branding));
    }, function () { /* the kept look, or the Yoyo default, stays */ });
  }

  // -------------------------------------------------------------------------
  // A gym has been chosen
  // -------------------------------------------------------------------------

  /** Proper-case a slug, for a gym known only by one: "bos-gym" -> "Bos Gym". */
  function nameFromSlug(slug) {
    return slug.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  /**
   * "Welcome to [Gym]" — join or sign in (§36). A member already signed in to
   * this gym on this phone goes straight in: asking again would be friction.
   */
  function chooseGym(slug, name) {
    if (!SAFE_SLUG.test(String(slug || ''))) return;
    rememberGym(slug, name);
    chosen = { slug: slug, name: name || nameFromSlug(slug) };
    if (window.YOYO_MEMBER.hasSession(slug)) return window.YOYO_MEMBER.open(slug, { name: chosen.name });

    document.querySelectorAll('[data-gym-name]').forEach(function (el) {
      if (!el.closest('#member')) el.textContent = chosen.name;
    });
    // From here the screens are the GYM's, not Yoyo's (critique 2026-09-29).
    dressGym(slug);
    show('gym');
  }

  function adminPath(slug) {
    return '/g/' + encodeURIComponent(slug) + '/admin/login';
  }

  // -------------------------------------------------------------------------
  // Leaving for a web screen
  // -------------------------------------------------------------------------

  /**
   * Is this somewhere the WebView will actually open?
   *
   * The same list Capacitor uses for allowNavigation, so this screen can never
   * offer a destination the app then refuses — which would hand the member to
   * the system browser in the middle of registering.
   */
  function allowed(url) {
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      return shell.allowedHosts.some(function (host) {
        return host.indexOf('*.') === 0
          ? parsed.hostname.endsWith(host.slice(1))
          : parsed.hostname === host;
      });
    } catch (e) {
      return false;
    }
  }

  function go(path) {
    var url = shell.defaultServer.replace(/\/+$/, '') + path;
    // Leaving for a web screen with no signal would show Android's raw
    // "net::ERR_INTERNET_DISCONNECTED" page, with no way back but the back
    // button. Said here instead, where the member can still do something.
    if (navigator.onLine === false) {
      if (window.YOYO_MEMBER && document.body.classList.contains('in-member')) {
        alert('You are offline. Connect to the internet and try again.');
        return;
      }
      say('You are offline. Connect to the internet and try again.', 'err');
      return;
    }
    if (!allowed(url)) {
      say('This app is not set up to open that address. Contact ' + shell.supportContact + '.', 'err');
      return;
    }
    window.location.href = url;
  }

  /** A gym name is text somebody typed. Escaped before it goes in the page. */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * One gym in a list. Its mark starts as a plain letter; paintResults() then
   * gives it the gym's own logo or colour — never a Yoyo badge.
   */
  function gymButton(g) {
    var where = [g.city, g.country].filter(Boolean).map(esc).join(', ');
    var far = g.distance_km == null ? '' : ' · ' + esc(g.distance_km) + ' km away';
    var initial = esc(String(g.name || g.slug || '?').trim().charAt(0).toUpperCase());
    return (
      '<button class="gym" type="button" data-slug="' + esc(g.slug) + '" data-name="' + esc(g.name) + '">' +
      '<span class="gym__initial g-mark" aria-hidden="true">' + initial + '</span>' +
      '<span><b>' + esc(g.name) + '</b><span>' + where + far + '</span></span></button>'
    );
  }

  // -------------------------------------------------------------------------
  // Every data-go button
  // -------------------------------------------------------------------------

  function openPick(mode) {
    pickMode = mode;
    var owner = mode === 'owner';
    // This search is the STAFF door now: owners sign in by email alone (§43.1 Q2).
    pickTitle.textContent = owner ? 'Gym staff sign in' : 'Find my gym';
    pickSub.textContent = owner
      ? 'Choose your gym, then sign in with the email or username and password your gym set up for you.'
      : 'Search by name, or use your location to see the closest gyms first.';
    // The recovery route is for members; the password help is for owners.
    forgotBtn.classList.toggle('hidden', owner);
    document.getElementById('owner-extras').classList.toggle('hidden', !owner);
    out.innerHTML = '';
    q.value = '';
    show('pick');
  }

  document.body.addEventListener('click', function (e) {
    var target = e.target.closest('[data-go]');
    if (!target) return;
    var where = target.dataset.go;

    if (where === 'back') return back();
    if (where === 'home') return show('home');
    if (where === 'member') return show('member-welcome');
    if (where === 'owner') return show('owner-welcome');
    if (where === 'help') return show('help');
    if (where === 'owner-apply') return show('owner-apply');
    if (where === 'find') return openPick('member');
    // An OWNER signs in with email + password alone (CLAUDE.md §43.1 Q2); the
    // website finds their gym. Staff have no Yoyo account: they choose theirs.
    if (where === 'owner-signin') return ownerSignIn();
    if (where === 'staff-signin') return openPick('owner');

    if (where === 'privacy') return go('/platform/privacy');
    if (where === 'delete-account') return go('/platform/delete-account');
    if (where === 'owner-register') return go('/platform/apply');
    // The owner's Yoyo account: where an applicant sees their application.
    if (where === 'owner-status') return go('/platform/login?as=owner');
    // Resets the owner's platform password AND their gym sign-in together.
    if (where === 'forgot-password') return go('/platform/forgot');

    if (!chosen) return;
    // Joining is the gym's own registration flow, on its web screens — the
    // PAR-Q and agreements are handled there and only there (§10).
    if (where === 'join') return show('join');
    if (where === 'register') return go('/g/' + encodeURIComponent(chosen.slug) + '/register');
    // Signing in is the app's own member area.
    if (where === 'signin') return window.YOYO_MEMBER.open(chosen.slug, { name: chosen.name });
  });

  // -------------------------------------------------------------------------
  // Searching for a gym
  // -------------------------------------------------------------------------

  function showResults(gyms) {
    if (!gyms.length) {
      out.innerHTML = pickMode === 'owner'
        ? '<div class="empty">No gyms found. If your gym has not been approved yet, check your application status.</div>'
        : '<div class="empty">No gyms found. Ask your gym whether they are on Yoyo Gyms yet.</div>';
      return;
    }
    out.innerHTML = gyms.map(gymButton).join('');
    paintResults(out);
  }

  // Which search is the latest. Answers can come back out of order — "bo"
  // slower than "bos" — and an older answer must not overwrite a newer one.
  var searchSeq = 0;

  function search() {
    var params = new URLSearchParams();
    var term = q.value.trim();
    if (term) params.set('q', term);
    if (coords) {
      params.set('lat', coords.lat);
      params.set('lng', coords.lng);
    }
    var mine = ++searchSeq;
    if (!params.toString()) {
      out.innerHTML = '';
      return;
    }

    var url = shell.defaultServer.replace(/\/+$/, '') + '/platform/api/gyms?' + params.toString();
    if (!allowed(url)) return;

    // A search that takes a moment says so — after 300 ms, so a quick answer
    // never flashes a message.
    var slow = setTimeout(function () {
      if (mine === searchSeq) out.innerHTML = '<p class="note" role="status">Searching…</p>';
    }, 300);

    fetch(url)
      .then(function (r) {
        clearTimeout(slow);
        // A failed search is NOT an empty one. Rendered as "no gyms found" it
        // tells a member their gym is not on Yoyo Gyms, when the truth is
        // that we are having a problem.
        if (!r.ok) throw new Error('search ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (mine !== searchSeq) return;
        showResults(d.gyms || []);
      })
      .catch(function () {
        clearTimeout(slow);
        if (mine !== searchSeq) return;
        out.innerHTML = '';
        say('Could not reach Yoyo Gyms. Check your connection and try again.', 'err');
      });
  }

  // One request per pause in typing, not one per keystroke.
  q.addEventListener('input', function () {
    clearNote();
    clearTimeout(timer);
    timer = setTimeout(search, 250);
  });

  // Picking a gym. The slug is the routing key; the app never learns anything
  // about the gym's storage.
  document.addEventListener('click', function (e) {
    var button = e.target.closest('.gym');
    if (!button) return;
    var slug = button.dataset.slug;
    if (!SAFE_SLUG.test(slug)) return;

    if (button.closest('#find-results')) {
      // The recovery lookup found their gym: they came to sign in.
      rememberGym(slug, button.dataset.name);
      return window.YOYO_MEMBER.open(slug, { name: button.dataset.name });
    }
    if (pickMode === 'owner') {
      // The gym's OWN admin sign-in, unchanged (§36.1 Q2). Never the Yoyo panel.
      rememberGym(slug, button.dataset.name, ADMIN_MINE);
      return goAdmin(slug);
    }
    rememberGym(slug, button.dataset.name);
    chooseGym(slug, button.dataset.name);
  });

  document.getElementById('near').addEventListener('click', function () {
    if (!navigator.geolocation) {
      say('This device cannot share a location. Search by name instead.');
      return;
    }
    say('Asking for your location…');

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        coords = { lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) };
        say('Showing the closest gyms first.');
        search();
      },
      function () {
        // Declining is a normal answer, not an error to complain about.
        say('No problem — search by name instead.');
      }
    );
  });

  // -------------------------------------------------------------------------
  // Scanning a QR code
  // -------------------------------------------------------------------------
  //
  // THE SCANNER NEVER WORKED IN A BUILT APP. This code used to look for
  // Capacitor.Plugins.BarcodeScanner and call checkPermissions / scan — the
  // API of a DIFFERENT plugin. The one installed, @capacitor/barcode-scanner,
  // registers as CapacitorBarcodeScanner with a single scanBarcode() that
  // opens its own full-screen native scanner and asks for the camera itself.
  //
  // Two callers: "Scan gym QR code" here, and "Scan my membership card" on a
  // gym's sign-in screen (member.js). Both get the same answers: a payload, a
  // message to show, or nothing at all when the person backed out.

  /** QR_CODE in the plugin's format list (html5-qrcode's enum). */
  var QR_CODE = 0;

  function scanPlugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorBarcodeScanner;
  }

  /**
   * Scan one code.
   * @returns {Promise<{payload?: object, message?: string, tone?: string}>}
   *          `{}` when the person backed out, which is not an error.
   */
  function scanQr(instructions) {
    var plugin = scanPlugin();

    if (!plugin) {
      // A browser, or a build without the plugin. Said plainly rather than
      // opening a camera screen that can never see anything.
      return Promise.resolve({ message: 'Scanning needs the Yoyo Gyms app. Search by name instead.' });
    }

    return plugin
      .scanBarcode({
        hint: QR_CODE,
        scanInstructions: instructions,
        scanButton: false,
        cameraDirection: 1, // back camera
      })
      .then(function (result) {
        var text = (result && result.ScanResult) || '';
        // The allowed hosts are handed in so a code printed BEFORE gym slugs
        // existed can be recognised as ours. Every code this system made until
        // then was gym-less, and they are on real walls.
        return { payload: window.YOYO_QR.readQrPayload(text, shell.allowedHosts) };
      }, function (err) {
        var message = String((err && (err.message || err.code)) || '').toLowerCase();
        // Backing out of the scanner is a normal answer, not an error.
        if (/cancel/.test(message)) return {};
        // Refusing the camera is normal too, and the app must stay usable.
        if (/permission|denied|camera/.test(message)) {
          return { message: 'Yoyo Gyms cannot use the camera. You can allow it in your phone settings, or search by name.', tone: 'err' };
        }
        return { message: 'The camera could not start. Search by name instead.', tone: 'err' };
      });
  }

  function scanGym() {
    return scanQr("Point your camera at the gym's QR code").then(function (r) {
      if (r.message) return say(r.message, r.tone);
      var payload = r.payload;
      if (!payload) return;

      if (payload.kind === 'gymless') {
        // Our code, but it does not say which gym. Scanning again gives the
        // same answer, so the way out is the gym picker.
        openPick('member');
        show('pick');
        // AFTER show(), which clears the note.
        say(payload.reason);
        return;
      }

      if (payload.kind === 'unknown') {
        say(payload.reason, 'err');
        return;
      }

      // A scanned code names the gym by slug only. Keep a name already known
      // for it; otherwise "bos-gym" reads as "Bos Gym" until the member next
      // picks it from search.
      var known = myGym();
      var name = known && known.slug === payload.slug ? known.name : nameFromSlug(payload.slug);
      rememberGym(payload.slug, name);

      // A member's own card opens sign-in with the number filled in — never
      // signed in (CLAUDE.md §14). A gym's poster opens "Welcome to [Gym]",
      // offering both joining and signing in.
      if (payload.kind === 'member') {
        window.YOYO_MEMBER.open(payload.slug, { name: name, number: payload.membershipNumber });
      } else {
        chooseGym(payload.slug, name);
      }
    });
  }

  document.getElementById('scan').addEventListener('click', scanGym);

  // -------------------------------------------------------------------------
  // "I don't remember which gym I joined"
  // -------------------------------------------------------------------------

  forgotBtn.addEventListener('click', function () { show('forgot-panel'); });

  document.getElementById('find').addEventListener('click', function () {
    var findOut = document.getElementById('find-results');

    findOut.innerHTML = '';
    say('Looking…');

    var url = shell.defaultServer.replace(/\/+$/, '') + '/platform/api/member/find-gym';
    if (!allowed(url)) return;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        membership_number: document.getElementById('mn').value,
        phone: document.getElementById('ph').value,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (result) {
        if (!result.ok) {
          say(result.d.error || 'We could not find a membership with those details.', 'err');
          return;
        }
        var gyms = result.d.gyms || [];
        say(gyms.length > 1
          ? 'Those details match more than one gym. Which one did you mean?'
          : 'Found it. Tap to sign in.');
        findOut.innerHTML = gyms.map(gymButton).join('');
        paintResults(findOut);
      })
      .catch(function () {
        say('Could not reach Yoyo Gyms. Check your connection and try again.', 'err');
      });
  });

  // -------------------------------------------------------------------------
  // Help — support and staff (§36.1 Q7)
  // -------------------------------------------------------------------------

  (function help() {
    var email = shell.supportEmail;
    if (email) {
      document.getElementById('support-email').textContent = email;
      // mailto: is not a web address, so Capacitor hands it to the mail app.
      document.getElementById('support-link').href = 'mailto:' + encodeURIComponent(email).replace('%40', '@');
    } else {
      document.getElementById('support').classList.add('hidden');
    }

    // The staff panel ONLY EVER OPENS OUTSIDE THE APP. adminHost is, by rule,
    // not in allowedHosts (scripts/mobile/configure-shell.mjs refuses a config
    // where it is), and Capacitor sends any host it may not navigate to to the
    // phone's own browser. With no adminHost yet — no domain has been bought
    // (§36.1 Q9) — the staff panel shares the member host, so there is no link
    // at all: a tap would open the panel INSIDE the app, which Q2 forbids.
    var staff = document.getElementById('staff');
    if (shell.adminHost) {
      var a = document.createElement('a');
      a.href = 'https://' + shell.adminHost + '/platform/login';
      a.textContent = 'Yoyo Gyms staff sign-in';
      a.rel = 'noopener';
      staff.appendChild(a);
    } else {
      staff.textContent = 'Yoyo Gyms staff: sign in on the Yoyo Gyms website, in your browser.';
    }
  })();

  // What member.js needs from here: the one way to leave the app for a web
  // screen (so the allowed-host check is never bypassed), the way back to the
  // screen the member came from, the scanner, and Help.
  window.YOYO_APP = Object.freeze({
    go: go,
    home: function () { show('home'); },
    resume: function () { render(current()); },
    help: function () { show('help'); },
    scan: scanQr,
  });

  // -------------------------------------------------------------------------
  // Behaving like an app, not a web page
  // -------------------------------------------------------------------------
  //
  // Each plugin is optional: in a browser, or a build without it, the app
  // still works — it just behaves like a web page.

  var Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  var noop = function () {};

  // Light status-bar text on the app's dark ground. (Capacitor's "DARK"
  // style means "for a dark background".)
  if (Plugins.StatusBar) {
    Plugins.StatusBar.setStyle({ style: 'DARK' }).catch(noop);
    if (Plugins.StatusBar.setBackgroundColor) Plugins.StatusBar.setBackgroundColor({ color: '#070c10' }).catch(noop);
  }

  // Android's back button walks back through the app — scanner, member area,
  // each screen in turn, home — and at home puts the app away like any other
  // app, rather than closing it and losing the member's place.
  if (Plugins.App) {
    Plugins.App.addListener('backButton', function () {
      if (window.YOYO_MEMBER && window.YOYO_MEMBER.back()) return;
      if (back()) return;
      if (Plugins.App.minimizeApp) Plugins.App.minimizeApp().catch(noop);
      else Plugins.App.exitApp();
    });
  }

  show('home');
  resumeLast();

  // Only now: the first screen is drawn, so hiding the splash shows it, not a
  // blank page.
  if (Plugins.SplashScreen) Plugins.SplashScreen.hide().catch(noop);
})();
