// What a member sees when the gym they scanned is not open.
//
// This screen exists so the answer arrives at the START of the visit rather
// than at the end of a 38-step registration form. It says one thing, and
// offers exactly one way onward — searching for a gym — because on this screen
// that is the only thing that can possibly help.
//
// The wording comes from src/lib/gymGate.js, which is where the four cases are
// decided and, more importantly, where it is decided what a MEMBER is told
// about each. A gym that has not paid is not described to its own customers as
// a gym that has not paid.

export default function GymUnavailable({ gate, onRetry }) {
  if (!gate) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 text-center">
        <h1 className="text-xl font-bold text-body">{gate.title}</h1>
        <p className="mt-3 text-sm text-muted">{gate.detail}</p>

        {gate.retryable ? (
          <button
            type="button"
            onClick={onRetry ?? (() => window.location.reload())}
            className="mt-6 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-black"
          >
            {gate.action}
          </button>
        ) : (
          // Back to the app's gym finder. In a browser this is the web version
          // of the same screen, so the link is never a dead end in either.
          <a
            href="/platform/find"
            className="mt-6 block w-full rounded-xl bg-accent px-4 py-3 font-semibold text-black"
          >
            {gate.action}
          </a>
        )}
      </div>
    </div>
  );
}
