// Records a staff action to gym.audit_log for accountability/compliance.
// Best-effort: never throws and never blocks the underlying operation.
export async function recordAudit(supabase, admin, { action, entity = null, entity_id = null, detail = null }) {
  try {
    await supabase.from('audit_log').insert({
      admin_id: admin?.sub || null,
      admin_name: admin?.full_name || admin?.username || 'system',
      action,
      entity,
      entity_id: entity_id != null ? String(entity_id) : null,
      detail: detail || null,
    });
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}
