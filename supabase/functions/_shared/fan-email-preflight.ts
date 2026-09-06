import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Re-read eligibility for every claimed delivery, including retries. */
export async function checkFanEmailPreflight(db: SupabaseClient, payload: Record<string, unknown>) {
  const recipientId = String(payload.recipient_id || '')
  const [{ data: fan, error: fanError }, { data: profile, error: emailError }] = await Promise.all([
    db.from('contestant_fans')
      .select('id, user_id, email_weekly_updates, contestant:contestants(status, competition_id)')
      .eq('id', String(payload.fan_id || ''))
      .eq('user_id', recipientId)
      .maybeSingle(),
    db.from('profiles').select('email').eq('id', recipientId).maybeSingle(),
  ])
  if (fanError || emailError) {
    return { eligible: false, error: fanError?.message || emailError?.message || 'preflight_failed' }
  }
  const related = fan?.contestant
  const contestant = Array.isArray(related) ? (related.length === 1 ? related[0] : null) : related
  return {
    eligible: !!fan?.email_weekly_updates &&
      profile?.email?.trim().toLowerCase() === String(payload.to_email || '') &&
      contestant?.status === 'active' &&
      contestant?.competition_id === payload.competition_id,
    error: null,
  }
}
