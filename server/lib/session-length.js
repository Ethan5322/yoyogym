// How long a "stay signed in" session lasts: effectively until the person
// signs out (CLAUDE.md §38.1 Q2, Q3). What actually ends one is its
// session_version — see server/lib/sessions.js.
export const REMEMBER_FOR = '3650d';
