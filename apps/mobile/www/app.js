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

    fetch(url)
      .then(function (r) {
        // A failed search is NOT an empty one. Rendered as "no gyms found" it
        // tells a member their gym is not on Yoyo Gyms, when the truth is
        // that we are having a problem.
        if (!r.ok) throw new Error('search ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (mine !== searchSeq) return;
        render(d.gyms || []);
      })
      .catch(function () {
        if (mine !== searchSeq) return;
        out.innerHTML = '';
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

  // -------------------------------------------------------------------------
  // Scanning a gym's QR code
  // -------------------------------------------------------------------------
  //
  // The camera is the reason this is an app rather than a page. Capacitor
  // renders the preview BEHIND the WebView, so the scanner screen is
  // transparent and the body gets a class that hides everything else.
  //
  // Four states, all designed: scanning, permission refused, a code that is
  // not ours, and a code carrying something it should not. The last two read
  // differently on purpose — one is a mistake, the other is a warning.

  var scanPanel = document.getElementById('scan-panel');
  var scanError = document.getElementById('scan-error');
  var scanHint = document.getElementById('scan-hint');
  var scanRetry = document.getElementById('scan-retry');

  function scanning(on) {
    document.body.classList.toggle('scanning', on);
    scanPanel.classList.toggle('hidden', !on);
  }

  function scanFailed(message, retryable) {
    scanError.textContent = message;
    scanError.classList.remove('hidden');
    scanHint.classList.add('hidden');
    scanRetry.classList.toggle('hidden', !retryable);
  }

  function stopScanner() {
    scanning(false);
    scanError.classList.add('hidden');
    scanHint.classList.remove('hidden');
    scanRetry.classList.add('hidden');
    try {
      if (window.Capacitor?.Plugins?.BarcodeScanner) {
        window.Capacitor.Plugins.BarcodeScanner.stopScan();
      }
    } catch (e) {
      /* already stopped */
    }
  }

  async function startScanner() {
    var plugin = window.Capacitor?.Plugins?.BarcodeScanner;

    if (!plugin) {
      // A browser, or a build without the plugin. Said plainly rather than
      // opening a camera screen that can never see anything.
      note.className = 'note';
      note.textContent = 'Scanning needs the Yoyo Gyms app. Search by name here instead.';
      return;
    }

    scanning(true);

    try {
      var permission = await plugin.checkPermissions();
      if (permission.camera !== 'granted') {
        permission = await plugin.requestPermissions();
      }

      if (permission.camera !== 'granted') {
        // Refusing the camera is a normal answer, and the app must still be
        // usable afterwards — which is why searching by name is offered right
        // there rather than being somewhere they have to go and find.
        scanFailed('Yoyo Gyms cannot use the camera. You can allow it in your phone settings, or search by name.', false);
        return;
      }

      var result = await plugin.scan();
      var text = result?.barcodes?.[0]?.rawValue || result?.ScanResult || '';

      // The allowed hosts are handed in so a code printed BEFORE gym slugs
      // existed can be recognised as ours. Every code this system made until
      // today was gym-less, and they are on real walls.
      var payload = window.YOYO_QR.readQrPayload(text, shell.allowedHosts);

      if (payload.kind === 'gymless') {
        // Our code, but it does not say which gym. Not a failure to retry —
        // scanning it again produces the same answer — so the way out is the
        // gym picker, opened right here.
        stopScanner();
        intent = 'signin';
        pickTitle.textContent = 'Which gym are you a member of?';
        pickSub.textContent = 'Search by name, or use your location to see the closest gyms first.';
        forgotBtn.classList.remove('hidden');
        out.innerHTML = '';
        q.value = '';
        show('pick');
        // AFTER show(), which clears the note — saying it before would be
        // saying nothing.
        note.className = 'note';
        note.textContent = payload.reason;
        return;
      }

      if (payload.kind === 'unknown') {
        scanFailed(payload.reason, true);
        return;
      }

      stopScanner();
      go(window.YOYO_QR.pathForPayload(payload));
    } catch (err) {
      scanFailed('The camera could not start. Search by name instead.', true);
    }
  }

  document.getElementById('scan').addEventListener('click', startScanner);
  document.getElementById('scan-cancel').addEventListener('click', stopScanner);
  scanRetry.addEventListener('click', function () {
    scanError.classList.add('hidden');
    scanHint.classList.remove('hidden');
    scanRetry.classList.add('hidden');
    startScanner();
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
