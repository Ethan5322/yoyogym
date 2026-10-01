import { Link } from 'react-router-dom';
import Credit from '../components/Credit.jsx';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-5xl font-bold text-accent">404</h1>
        <p className="mt-4 text-muted">This page does not exist.</p>
        <Link to="/" className="btn-outline mt-8">
          Go Home
        </Link>
      </div>
      <Credit />
    </div>
  );
}
