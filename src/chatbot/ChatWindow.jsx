// Presentational chat surface: progress bar, scrolling transcript, typing
// indicator, the active question + its control, and back / start-over actions.
import { useEffect, useRef } from 'react';
import MessageBubble from './components/MessageBubble.jsx';
import TypingIndicator from './components/TypingIndicator.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import Controls from './components/Controls.jsx';
import { formatAnswer } from './format.js';

export default function ChatWindow({ engine, completeView }) {
  const {
    current,
    transcript,
    typing,
    error,
    answers,
    submit,
    goBack,
    startOver,
    canGoBack,
    section,
    totalSections,
    finished,
  } = engine;

  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript.length, typing, current?.id, finished]);

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col bg-bg">
      {/* Header + progress */}
      <div className="border-b border-white/5 bg-surface">
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-display text-lg uppercase tracking-wider text-body">
            Registration
          </span>
          <button onClick={startOver} className="text-xs text-muted hover:text-error">
            Start over
          </button>
        </div>
        {!finished && <ProgressBar section={section} total={totalSections} />}
      </div>

      {/* Transcript */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {transcript.map(({ step, value }, i) => (
          <div key={`${step.id}-${i}`} className="space-y-3">
            <MessageBubble role="ai">{step.prompt(answers)}</MessageBubble>
            {step.field && <MessageBubble role="user">{formatAnswer(step, value)}</MessageBubble>}
          </div>
        ))}

        {typing && <TypingIndicator />}

        {!typing && current && <MessageBubble role="ai">{current.prompt(answers)}</MessageBubble>}

        {finished && completeView}

        <div ref={endRef} />
      </div>

      {/* Active control */}
      {!finished && current && (
        <div className="border-t border-white/5 bg-surface px-4 py-4">
          {!typing && (
            <Controls
              key={current.id}
              step={current}
              error={error}
              defaultValue={current.field ? answers[current.field] : undefined}
              answers={answers}
              onSubmit={submit}
            />
          )}
          {canGoBack && (
            <button
              onClick={goBack}
              className="mt-3 w-full text-center text-sm text-muted hover:text-body"
            >
              ← Go back &amp; edit previous answer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
