// Small helpers for Vercel Node serverless functions: JSON responses,
// body parsing, and method guarding. Keeps handlers terse and consistent.

/** Send a JSON response with a status code. */
export function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function ok(res, payload = {}) {
  json(res, 200, payload);
}

export function badRequest(res, message = 'Bad request') {
  json(res, 400, { error: message });
}

export function unauthorized(res, message = 'Unauthorized') {
  json(res, 401, { error: message });
}

export function forbidden(res, message = 'Forbidden') {
  json(res, 403, { error: message });
}

export function serverError(res, message = 'Something went wrong on our side. Please try again.') {
  json(res, 500, { error: message });
}

/**
 * A failure on OUR side — the database, a service. The person is told so in
 * plain words; the cause goes to the server log only. 125 handlers used to
 * send the database's own message to the browser: table and column names,
 * and sometimes the value that clashed (CLAUDE.md §46). A database repeats
 * values back ("Key (phone)=(0821234567) already exists") — personal data —
 * so those are masked in the log line too.
 */
export function failed(res, error, message) {
  const text = String(error?.message ?? error ?? '')
    .replace(/=\([^)]*\)/g, '=(…)')
    .slice(0, 300);
  console.error('[failed]', error?.code ? `${error.code}:` : '', text);
  serverError(res, message);
}

/**
 * Text typed into a search box, made safe to put INSIDE a PostgREST filter
 * string (`.or('full_name.ilike.%…%,…')`). A comma, a bracket, a wildcard or a
 * quote there is filter SYNTAX — it could add a condition — so only letters,
 * digits, spaces and the few marks names, emails and numbers use are kept
 * (CLAUDE.md §46; the platform's searches already did this: platform/deps.js).
 */
export function filterText(raw) {
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N}\s@.'+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** A membership number, trainer number or verification code: letters, digits and dashes only. */
export function codeText(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

/**
 * Ensure the request uses one of the allowed methods.
 * Returns true if the method is allowed; otherwise responds 405 and returns false.
 */
export function allowMethods(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    json(res, 405, { error: `Method ${req.method} not allowed` });
    return false;
  }
  return true;
}

/** Parse the JSON request body (Vercel may pass it pre-parsed or as a string). */
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  // Fallback: read the raw stream.
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}
