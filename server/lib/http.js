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

export function serverError(res, message = 'Internal server error') {
  json(res, 500, { error: message });
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
