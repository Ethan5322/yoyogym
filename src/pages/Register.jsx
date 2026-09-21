// New member registration — rule-based AI-style chatbot (Phase 2, complete).
// On flow completion it saves the member via /api/register (serverless) and
// shows the confirmation success screen.
import { useState, useCallback, useEffect } from 'react';
import { useChatEngine } from '../chatbot/engine.js';
import ChatWindow from '../chatbot/ChatWindow.jsx';
import SuccessScreen from '../chatbot/components/SuccessScreen.jsx';
import { apiFetch } from '../lib/api.js';
import { logQrScan } from '../lib/scan.js';

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

  return <ChatWindow engine={engine} completeView={completeView} />;
}
