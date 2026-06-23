// Manual registration (spec 4.5): staff register a walk-in using the same
// chatbot flow, flagged as manually registered. Payment is taken offline
// (record it under Payments). Full-screen with a return link.
import { Link } from 'react-router-dom';
import Register from '../Register.jsx';

export default function ManualRegister() {
  return (
    <div className="relative">
      <Link
        to="/admin"
        className="absolute left-3 top-2 z-10 text-xs text-muted hover:text-body"
      >
        ← Admin
      </Link>
      <Register manual />
    </div>
  );
}
