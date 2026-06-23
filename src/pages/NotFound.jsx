import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <h1 className="text-5xl font-bold text-accent">404</h1>
      <p className="mt-4 text-muted">This page does not exist.</p>
      <Link to="/" className="btn-outline mt-8">
        Go Home
      </Link>
    </div>
  );
}
