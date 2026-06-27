// Writes an entry to gym.admin_inbox — the admin notification bell + message
// inbox. Best-effort: never throws and never blocks the underlying action
// (booking, message, etc.), and tolerates the table not being migrated yet.
export async function notifyAdmin(supabase, { kind = 'event', type, title, body = null, member_id = null, sender_name = null, sender_role = 'system', link = null, direction = 'in', parent_id = null, is_read = false, is_read_member = false }) {
  try {
    await supabase.from('admin_inbox').insert({
      kind,
      type: type || null,
      title: title || null,
      body,
      member_id,
      sender_name,
      sender_role,
      link,
      direction,
      parent_id,
      is_read,
      is_read_member,
    });
    return { ok: true };
  } catch (e) {
    console.error('notifyAdmin failed:', e.message);
    return { ok: false, error: e.message };
  }
}
