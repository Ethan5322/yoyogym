// The maker's credit (CLAUDE.md §50): small, quiet, and LAST on the page, in
// the page's own flow — so it can never sit over a word, a chat or a button.
import { CREDIT } from '../../shared/brand.js';

export default function Credit({ className = '' }) {
  return <p className={`site-credit ${className}`.trim()}>{CREDIT}</p>;
}
