// Three staggered pulsing dots in the accent color (dignified, spec 7.1).
export default function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-accent/15 bg-bubble px-4 py-4">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-2 w-2 rounded-full bg-accent"
            style={{ animation: 'pulse 1s infinite', animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
