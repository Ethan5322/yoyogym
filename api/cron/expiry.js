// CRON (daily 09:00) — Membership expiry detection (spec 3.2 / 3.4 #43).
//  - Memberships ending within 7 days  -> member 'expiring' + renewal reminder + owner alert
//  - Memberships already ended         -> member 'lapsed' + membership 'expired' + churn alert
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../_lib/http.js';
import { authorizeCron } from '../_lib/cron.js';
import { notifyMemberEmail, notifyOwner } from '../_lib/notify/index.js';
import { ownerTemplates } from '../_lib/notify/templates.js';

const isoDate = (d) => d.toISOString().slice(0, 10);
const fmt = (d) => new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;

  try {
    const supabase = getSupabase();
    const today = isoDate(new Date());
    const in7 = isoDate(new Date(Date.now() + 7 * 86400000));

    // ---- expiring within 7 days (only those currently 'active') ----
    const { data: expiring } = await supabase
      .from('memberships')
      .select('id, member_id, end_date, members(email, full_name, status, membership_number)')
      .eq('state', 'active')
      .gte('end_date', today)
      .lte('end_date', in7);

    let expiringCount = 0;
    for (const m of expiring || []) {
      const member = m.members;
      if (!member || member.status !== 'active') continue; // notify once on transition
      await supabase.from('members').update({ status: 'expiring', updated_at: new Date().toISOString() }).eq('id', m.member_id);
      await notifyMemberEmail(
        supabase,
        { id: m.member_id, full_name: member.full_name, email: member.email },
        'renewal_reminder',
        { endDate: fmt(m.end_date) }
      );
      await notifyOwner(supabase, 'expiring', ownerTemplates.expiring({ member: { full_name: member.full_name, membership_number: member.membership_number }, endDate: fmt(m.end_date) }), m.member_id);
      expiringCount++;
    }

    // ---- already ended -> lapsed ----
    const { data: ended } = await supabase
      .from('memberships')
      .select('id, member_id, members(full_name, membership_number, status)')
      .eq('state', 'active')
      .lt('end_date', today);

    let lapsedCount = 0;
    for (const m of ended || []) {
      const member = m.members;
      await supabase.from('memberships').update({ state: 'expired', updated_at: new Date().toISOString() }).eq('id', m.id);
      await supabase.from('members').update({ status: 'lapsed', updated_at: new Date().toISOString() }).eq('id', m.member_id);
      if (member) {
        await notifyOwner(supabase, 'lapsed', ownerTemplates.lapsed({ member: { full_name: member.full_name, membership_number: member.membership_number } }), m.member_id);
      }
      lapsedCount++;
    }

    return ok(res, { expiring: expiringCount, lapsed: lapsedCount });
  } catch (err) {
    console.error('expiry cron error:', err.message);
    return serverError(res, 'Expiry run failed');
  }
}
