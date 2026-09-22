/*
 * The entry screens' behaviour.
 *
 * The app's whole job before it reaches the server is to answer two questions:
 * WHICH SIDE (owner or member), and for a member, WHICH GYM. Everything after
 * that is rendered by the Yoyo Gyms server.
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

  var views = {
    home: document.getElementById('home'),
    pick: document.getElementById('pick'),
    forgot: document.getElementById('forgot-panel'),
  };

  var q = document.getElementById('q');
  var out = document.getElementById('results');
  var note = document.getElementById('note');
  var forgotBtn = document.getElementById('forgot');
  var pickTitle = document.getElementById('pick-title');
  var pickSub = document.getElementById('pick-sub');

  var coords = null;
  var timer = null;
  var intent = 'register'; // 'register' or 'signin' — what picking a gym means

  // -------------------------------------------------------------------------
  // Navigation between the three screens
  // -------------------------------------------------------------------------

  function show(name) {
    Object.keys(views).forEach(function (k) {
      views[k].classList.toggle('hidden', k !== name);
    });
    note.textContent = '';
    note.className = 'note';
  }

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
    if (!allowed(url)) {
      note.className = 'err';
      note.textContent = 'This app is not set up to open that address. Contact ' + shell.supportContact + '.';
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

  function gymButton(g) {
    var where = [g.city, g.country].filter(Boolean).map(esc).join(', ');
    var far = g.distance_km == null ? '' : ' · ' + esc(g.distance_km) + ' km away';
    return (
      '<button class="gym" type="button" data-slug="' + esc(g.slug) + '">' +
      '<b>' + esc(g.name) + '</b><span>' + where + far + '</span></button>'
    );
  }

  document.body.addEventListener('click', function (e) {
    var target = e.target.closest('[data-go]');
    if (!target) return;
    var where = target.dataset.go;

    if (where === 'home') return show('home');

    if (where === 'owner-register') return go('/platform/apply');
    if (where === 'owner-signin') return go('/platform/login');

    if (where === 'member-register' || where === 'member-signin') {
      intent = where === 'member-register' ? 'register' : 'signin';

      // A MEMBER PICKS THEIR GYM FIRST (D-041). Many gyms live in this one
      // app, so "which gym" is the first question either way; the gym's own
      // screens handle everything after it.
      pickTitle.textContent = intent === 'register' ? 'Which gym do you want to join?' : 'Which gym are you a member of?';
      pickSub.textContent = intent === 'register'
        ? 'Search by name, or use your location to see the closest gyms first.'
        : 'Pick your gym and sign in with your membership number and phone.';

      // The recovery route is offered only where it makes sense. Somebody
      // joining a gym for the first time has nothing to remember.
      forgotBtn.classList.toggle('hidden', intent !== 'signin');

      out.innerHTML = '';
      q.value = '';
      return show('pick');
    }
  });

  // -------------------------------------------------------------------------
  // Picking a gym
  // -------------------------------------------------------------------------

  function render(gyms) {
    if (!gyms.length) {
      out.innerHTML =
        '<div class="empty">No gyms found. Ask your gym whether they are on Yoyo Gyms yet.</div>';
      return;
    }
    out.innerHTML = gyms.map(gymButton).join('');
  }

  function search() {
    var params = new URLSearchParams();
    var term = q.value.trim();
    if (term) params.set('q', term);
    if (coords) {
      params.set('lat', coords.lat);
      params.set('lng', coords.lng);
    }
    if (!params.toString()) {
      out.innerHTML = '';
      return;
    }

    var url = shell.defaultServer.replace(/\/+$/, '') + '/platform/api/gyms?' + params.toString();
    if (!allowed(url)) return;

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) { render(d.gyms || []); })
      .catch(function () {
        note.className = 'err';
        note.textContent = 'Could not reach Yoyo Gyms. Check your connection and try again.';
      });
  }

  // One request per pause in typing, not one per keystroke.
  q.addEventListener('input', function () {
    note.className = 'note';
    note.textContent = '';
    clearTimeout(timer);
    timer = setTimeout(search, 250);
  });

  // Picking a gym hands over to that gym's own screens. The slug is the
  // routing key; the app never learns anything about the gym's storage.
  document.addEventListener('click', function (e) {
    var button = e.target.closest('.gym');
    if (!button) return;
    var slug = button.dataset.slug;
    go(intent === 'register' ? '/g/' + encodeURIComponent(slug) + '/register'
                             : '/g/' + encodeURIComponent(slug) + '/member');
  });

  document.getElementById('near').addEventListener('click', function () {
    if (!navigator.geolocation) {
      note.textContent = 'This device cannot share a location. Search by name instead.';
      return;
    }
    note.className = 'note';
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

  document.getElementById('scan').addEventListener('click', function () {
    // The camera is why this is an app rather than a page. Wired when the
    // scanner plugin is added; saying so beats a button that does nothing.
    note.className = 'note';
    note.textContent = 'QR scanning is not enabled in this build yet. Search by name for now.';
  });

  // -------------------------------------------------------------------------
  // "I don't remember which gym I joined"
  // -------------------------------------------------------------------------

  forgotBtn.addEventListener('click', function () { show('forgot'); });

  document.getElementById('find').addEventListener('click', function () {
    var findNote = document.getElementById('find-note');
    var findOut = document.getElementById('find-results');

    findOut.innerHTML = '';
    findNote.className = 'note';
    findNote.textContent = 'Looking…';

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
          findNote.className = 'err';
          findNote.textContent = result.d.error || 'We could not find a membership with those details.';
          return;
        }
        var gyms = result.d.gyms || [];
        findNote.textContent = gyms.length > 1
          ? 'Those details match more than one gym. Which one did you mean?'
          : 'Found it. Tap to sign in.';
        findOut.innerHTML = gyms.map(gymButton).join('');
      })
      .catch(function () {
        findNote.className = 'err';
        findNote.textContent = 'Could not reach Yoyo Gyms. Check your connection and try again.';
      });
  });

  show('home');
})();
