// Is this request — or this page — inside the Yoyo Gyms STORE app?
// (CLAUDE.md §46.1 Q4)
//
// The app's web view adds this word to its user agent (appendUserAgent in
// apps/mobile/capacitor.config.ts), so the server knows before it draws a
// page, and a page knows without asking anyone.
//
// Inside the app, an owner sees no prices, Pay buttons or payment links for
// the Yoyo Gyms subscription: Google Play requires its own billing for
// software and forbids steering to any other payment method (Payments policy);
// Apple forbids buttons or links to other purchase methods outside the US
// storefront (App Store Review Guidelines 3.1.1(a), 3.1.3). Owners pay on the
// website. Members are unaffected: they pay their gym in person, a physical
// service both stores exempt.

export const STORE_APP_MARK = 'YoyoGymsApp';

export function isStoreApp(userAgent) {
  return typeof userAgent === 'string' && userAgent.includes(STORE_APP_MARK);
}
