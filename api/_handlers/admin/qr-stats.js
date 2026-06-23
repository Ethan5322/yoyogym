// GET /api/admin/qr-stats -> QR scan analytics (spec 4.10). Owner/Manager.
import { getSupabase } from '../../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../../_lib/http.js';
import { requireRole } from '../../_lib/auth.js';

const count = async (q) => (await q).count || 0;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  try {
    const supabase = getSupabase();
    const [total, newScans, registrations] = await Promise.all([
      count(supabase.from('qr_scan_analytics').select('id', { count: 'exact', head: true })),
      count(supabase.from('qr_scan_analytics').select('id', { count: 'exact', head: true }).eq('qr_type', 'new_member')),
      count(supabase.from('members').select('id', { count: 'exact', head: true })),
    ]);

    const conversion = newScans > 0 ? Math.min(100, Math.round((registrations / newScans) * 100)) : 0;

    return ok(res, {
      total_scans: total,
      new_member_scans: newScans,
      registrations,
      conversion_rate: conversion,
    });
  } catch (err) {
    console.error('qr-stats error:', err.message);
    return serverError(res, 'Could not load QR stats');
  }
}
