// A single chat bubble. AI bubbles sit left on a dark surface with a subtle
// accent border; user bubbles sit right with the accent fill (spec 7.1).
export default function MessageBubble({ role = 'ai', children }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'bubble animate-fade-up',
          isUser ? 'bubble-user' : 'bubble-ai',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}
