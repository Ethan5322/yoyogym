/*
 * The entry screen's behaviour.
 *
 * Its whole job is to answer one question — WHICH GYM — and then hand over to
 * the server's own screens (D-036). It holds no session, stores no personal
 * data, and makes exactly one kind of request: a public gym search that returns
 * only what a stranger may know.
 *
 * No dependencies, because this runs before the app has reached a server.
 */
(function () {
  'use strict';

  var shell = window.YOYO_SHELL;

  var q = document.getElementById('q');
  var out = document.getElementById('results');
  var note = document.getElementById('note');
  var timer = null;
  var coords = null;

  /**
   * Is this somewhere the WebView will actually open?
   *
   * The same list Capacitor uses for allowNavigation, so the screen can never
   * offer a destination the app then refuses — which would hand the member to
   * the system browser mid-registration.
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

  /** A gym name is text somebody typed. It is escaped before it goes in the page. */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(gyms) {
    if (!gyms.length) {
      out.innerHTML =
        '<div class="empty">No gyms found. Ask your gym whether they are on Yoyo Gyms yet.</div>';
      return;
    }

    out.innerHTML = gyms
      .map(function (g) {
        var where = [g.city, g.country].filter(Boolean).map(esc).join(', ');
        var far = g.distance_km == null ? '' : ' · ' + esc(g.distance_km) + ' km away';
        return (
          '<button class="gym" type="button" data-slug="' + esc(g.slug) + '">' +
          '<b>' + esc(g.name) + '</b><span>' + where + far + '</span></button>'
        );
      })
      .join('');
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

    var url = shell.defaultServer.replace(/\/+$/, '') + '/platform/gyms?' + params.toString();
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
  out.addEventListener('click', function (e) {
    var button = e.target.closest('.gym');
    if (button) go('/g/' + encodeURIComponent(button.dataset.slug));
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

  document.getElementById('owner').addEventListener('click', function () {
    go('/platform/apply');
  });
})();
