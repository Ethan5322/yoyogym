// Writes an entry to gym.admin_inbox — the admin notification bell + message
// inbox. Best-effort: never throws and never blocks the underlying action
// (booking, message, etc.), and tolerates the table not being migrated yet.
export async function notifyAdmin(supabase, { kind = 'event', type, title, body = null, member_id = null, sender_name = null, sender_role = 'system', link = null }) {
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
    });
    return { ok: true };
  } catch (e) {
    console.error('notifyAdmin failed:', e.message);
    return { ok: false, error: e.message };
  }
}
