// Subtle scan feedback tones generated with the Web Audio API (no audio files).
// Optional — can be muted; the preference persists in localStorage.
const KEY = 'gym_scan_sound';

export const soundEnabled = () => localStorage.getItem(KEY) !== 'off';
export const setSoundEnabled = (on) => localStorage.setItem(KEY, on ? 'on' : 'off');

let ctx;
function tone(freq, start, dur, type = 'sine', gain = 0.12) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(ctx.destination);
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function beep(kind = 'success') {
  if (!soundEnabled()) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (kind === 'success') {
      tone(880, 0, 0.12); // rising two-tone "granted"
      tone(1320, 0.1, 0.16);
    } else {
      tone(200, 0, 0.32, 'sawtooth', 0.1); // low "denied" buzz
    }
  } catch {
    /* audio unavailable */
  }
}
