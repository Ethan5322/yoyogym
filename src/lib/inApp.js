// Is this web screen running inside the Yoyo Gyms phone app? (CLAUDE.md §38.1 Q3)
//
// The app opens a gym's admin sign-in as /g/<gym>/admin/login?app=1&back=<the
// app's own home>. That is remembered here, so signing in asks to STAY signed
// in (the app's rule), and the sign-in page can offer the way back to the app.
// A browser that never came from the app never has it, and keeps the 8-hour
// session it always had.
const KEY = 'yoyo.inapp';

// Only the app's own local addresses may be a "back" link — never anywhere else.
const APP_HOME = /^(https:\/\/localhost|capacitor:\/\/localhost)(\/[^\s"'<>]*)?$/;

export function captureInApp(search = typeof window === 'undefined' ? '' : window.location.search) {
  const p = new URLSearchParams(search);
  if (p.get('app') !== '1') return;
  const back = p.get('back') || '';
  try {
    localStorage.setItem(KEY, JSON.stringify({ back: APP_HOME.test(back) ? back : '' }));
  } catch {
    /* storage refused: this visit simply behaves like a browser */
  }
}

/** { back } when running in the app, otherwise null. */
export function inApp() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' ? { back: APP_HOME.test(v.back || '') ? v.back : '' } : null;
  } catch {
    return null;
  }
}
