// A single chat bubble. AI bubbles sit left on a dark surface with a subtle
// accent border; user bubbles sit right with the accent fill (spec 7.1).
export default function MessageBubble({ role = 'ai', children }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[85%] animate-fade-up rounded-2xl px-4 py-3 leading-relaxed',
          isUser
            ? 'bg-accent text-black rounded-br-md'
            : 'border border-accent/15 bg-bubble text-body rounded-bl-md',
        ].join(' ')}
        style={{ whiteSpace: 'pre-line' }}
      >
        {children}
      </div>
    </div>
  );
}
