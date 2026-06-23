// Generic protected admin placeholder for routes built in later phases.
import AdminShell from '../../components/AdminShell.jsx';

export default function Placeholder({ title, phase }) {
  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">{title}</h1>
      <p className="mt-2 text-muted">Coming in {phase}.</p>
    </AdminShell>
  );
}
