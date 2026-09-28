// Session-pack consumption (spec 3.1).
//
// RESTORED 2026-09-28. This lived in server/lib/sessions.js until efedc0b wrote
// the "stay signed in" code into a NEW file of the same name and replaced it —
// every handler importing consumeSession then failed to load, and with it the
// whole admin and member APIs (FUNCTION_INVOCATION_FAILED). A session PACK
// (training sessions a member bought) and a sign-in SESSION now live apart.
// Decrements a member's remaining sessions
// on check-in and reports when the pack is running low / depleted so the caller
// can notify the member. Returns { consumed, remaining, low, depleted }.
const LOW_AT = 2;

export async function consumeSession(supabase, memberId) {
  const { data: m } = await supabase
    .from('memberships')
    .select('id, visit_type, sessions_remaining')
    .eq('member_id', memberId)
    .eq('visit_type', 'session_pack')
    .eq('state', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!m || m.sessions_remaining == null || m.sessions_remaining <= 0) {
    return { consumed: false, remaining: m?.sessions_remaining ?? null };
  }

  const remaining = m.sessions_remaining - 1;
  await supabase
    .from('memberships')
    .update({ sessions_remaining: remaining, updated_at: new Date().toISOString() })
    .eq('id', m.id);

  return { consumed: true, remaining, low: remaining > 0 && remaining <= LOW_AT, depleted: remaining === 0 };
}
