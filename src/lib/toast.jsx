// App-wide toast notifications — corporate confirmation feedback for every
// mutation (replaces silent inline messages / blocking alert()).
// Usage:  const toast = useToast();  toast.success('Saved.');  toast.error(msg);
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback(
    (tone, message, ttl = 4000) => {
      const id = nextId++;
      setToasts((list) => [...list, { id, tone, message }]);
      timers.current[id] = setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  const api = useRef({
    success: (m) => push('success', m),
    error: (m) => push('error', m, 6000),
    info: (m) => push('info', m),
    push,
    dismiss,
  });

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 text-left text-sm shadow-lg backdrop-blur transition ${TONES[t.tone] || TONES.info}`}
          >
            <span aria-hidden className="mt-0.5 shrink-0 font-bold">{ICONS[t.tone] || 'ℹ'}</span>
            <span className="flex-1">{t.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONES = {
  success: 'border-success/30 bg-success/15 text-success',
  error: 'border-error/30 bg-error/15 text-error',
  info: 'border-accent/30 bg-accent-soft text-accent',
};
const ICONS = { success: '✓', error: '!', info: 'ℹ' };

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
