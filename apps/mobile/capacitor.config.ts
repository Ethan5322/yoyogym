import { readFileSync } from 'node:fs';
import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The allowed-host list, read from the one file that owns it.
 *
 * Read here rather than duplicated, so `allowNavigation` and the entry
 * screen's own validation cannot drift apart. A plain `readFileSync` rather
 * than a JSON import: this file is evaluated by Capacitor's TypeScript loader,
 * whose module settings are not this repository's.
 */
const shell = JSON.parse(readFileSync(`${__dirname}/shell.config.json`, 'utf8')) as {
  allowedHosts: string[];
};

/**
 * The Yoyo Gyms app — Android and iPhone, one codebase (D-038).
 *
 * ## What this is
 *
 * Yoyo Gyms' screens are rendered by the Yoyo Gyms server. This project does
 * not reimplement them and must not: a second implementation of member
 * registration is a second place for a member's health answers to be handled
 * wrongly, and a second set of rules to keep in step with the first. What it
 * does is package the existing screens as an installable app so they can be
 * listed on Google Play and the App Store, and give them the things a browser
 * tab cannot have — a launcher icon, a camera for scanning a gym's QR, and an
 * update channel.
 *
 * The gym's own web surface is untouched. The existing PWA
 * (`public/manifest.webmanifest`, `public/sw.js`) keeps working exactly as it
 * does. This is additive.
 *
 * ## Why there IS a fixed address here, unlike a per-merchant shell
 *
 * Yoyo Gyms is ONE deployment serving every gym, each as a schema in the same
 * project (D-096). The address does not vary per gym. What varies is WHICH
 * GYM, and that is resolved by slug through search or a scanned QR (D-036).
 *
 * Asking a gym member to type a server address would be asking them a question
 * they cannot answer — they know the name of their gym, not its hosting.
 *
 * ## What `allowNavigation` is doing
 *
 * Restricting where the WebView may go. Without it, Capacitor keeps the app on
 * its own origin and opens everything else in the system browser — which would
 * put registration outside the app. With `*` it would follow any link
 * anywhere, inside the app's own chrome, so one injected link would become a
 * convincing place to ask for an ID number.
 *
 * ⚠️ THE STAFF ADMIN PANEL IS NOT MEANT TO BE REACHED FROM HERE. It currently
 * shares a host with the member screens, so this list cannot exclude it by
 * host alone; what protects it today is that every staff route requires a
 * permission no gym owner holds. Serving the panel from its own hostname is
 * the intended fix and is recorded in shell.config.json.
 *
 * ## HTTPS only, and what it costs
 *
 * A member's ID number, phone number and health answers travel over this
 * connection, and a gym's wi-fi is not a trusted network. The cost, stated so
 * it is not discovered later: this app cannot talk to a LAN server with a
 * self-signed certificate. The right answer to that is a real certificate, not
 * a trust exception — an app that ignores certificate errors has no transport
 * security at all.
 */
const config: CapacitorConfig = {
  appId: 'com.mulesoo.yoyogyms',
  appName: 'Yoyo Gyms',
  webDir: 'www',
  android: {
    // The shell holds no data of its own — everything lives on the server and
    // in the session. Letting a device backup copy the WebView's storage would
    // copy a live session off the phone.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'always',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: shell.allowedHosts,
  },
};

export default config;
