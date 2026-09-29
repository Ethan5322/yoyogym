// New member registration — rule-based AI-style chatbot (Phase 2, complete).
// On flow completion it saves the member via /api/register (serverless) and
// shows the confirmation success screen.
import { useState, useCallback, useEffect } from 'react';
import { useChatEngine } from '../chatbot/engine.js';
import ChatWindow from '../chatbot/ChatWindow.jsx';
import SuccessScreen from '../chatbot/components/SuccessScreen.jsx';
import { apiFetch } from '../lib/api.js';
import { logQrScan } from '../lib/scan.js';
import GymBackdrop from '../components/GymBackdrop.jsx';
import { useCatalog } from '../lib/useCatalog.js';

export default function Register({ manual = false }) {
  const [status, setStatus] = useState('idle'); // idle | saving | done | error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!manual) logQrScan('new_member');
  }, [manual]);

  const save = useCallback(
    async (answers) => {
      setStatus('saving');
      setErrorMsg('');
      try {
        const res = await apiFetch('/register', { method: 'POST', body: { ...answers, manual }, auth: false });
        setResult(res);
        setStatus('done');
      } catch (err) {
        setErrorMsg(err.message || 'Registration failed.');
        setStatus('error');
      }
    },
    [manual]
  );

  const engine = useChatEngine({ onComplete: save });
  // The same catalog the membership step reads (cached per gym), asked for up
  // front: a gym with no plans cannot take a member, and saying so after the
  // details and health questions wasted the member's time.
  const { catalog, loading: catalogLoading } = useCatalog();
  const noPlans = !catalogLoading && catalog && !(catalog.plans || []).length;

  let completeView = null;
  if (status === 'saving') {
    completeView = (
      <div className="card animate-fade-up text-center">
        <p className="text-body">Creating your membership… 💪</p>
      </div>
    );
  } else if (status === 'error') {
    completeView = (
      <div className="card animate-fade-up text-center">
        <p className="text-error">{errorMsg}</p>
        <button className="btn-primary mt-4 w-full" onClick={() => save(engine.answers)}>
          Try again
        </button>
      </div>
    );
  } else if (status === 'done' && result) {
    // Members pay the gym directly (cash / EFT / the gym's own arrangement), so
    // registration always ends on the confirmation screen. Staff activate the
    // member by capturing that payment in Admin -> Payments.
    completeView = <SuccessScreen result={result} />;
  }

  // The gym's poster behind registration (CLAUDE.md §39.1 Q4). Outside the
  // chat window: its frosted glass would otherwise hold the poster inside it.
  if (noPlans) {
    return (
      <>
        <GymBackdrop />
        <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
          <div className="card w-full animate-fade-up text-center">
            <h1 className="font-display text-2xl">Not taking sign-ups yet</h1>
            <p className="mt-3 text-body">
              {manual
                ? 'Add your membership plans in Catalog first — a member needs a plan to join.'
                : 'This gym has not opened online sign-ups yet. Please ask at the front desk, or check back soon.'}
            </p>
            <button className="btn-outline mt-6 w-full" onClick={() => window.history.back()}>
              Go back
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <GymBackdrop />
      <ChatWindow engine={engine} completeView={completeView} />
    </>
  );
}
