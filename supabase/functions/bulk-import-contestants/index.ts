import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * bulk-import-contestants
 *
 * Host-facing edge function that lets a competition host upload their existing
 * roster in one shot. For each person in the roster it:
 *   1. Creates a real auth user (if one doesn't already exist) with a random
 *      temp password — same "no ghost accounts" discipline as the claim flow,
 *      except here the host is vouching for the whole roster at once.
 *   2. Upserts the person's profile with the roster data (name, photo, socials).
 *   3. Inserts them directly as an active contestant (skips the nomination /
 *      approval funnel — the host already has these people on their roster).
 *   4. Optionally emails each person a branded "claim your profile / set your
 *      password" link so they can log in and manage their card.
 *
 * Authorization: the caller must be the competition's host, a co-host, or a
 * super admin. This is enforced against the caller's JWT (forwarded by
 * supabase.functions.invoke) — the roster is created with the service role, so
 * we cannot lean on RLS and must check the caller ourselves.
 *
 * Accepts: {
 *   competition_id: string,
 *   contestants: Array<{ name, email, phone?, instagram?, city?, age?, bio?,
 *                        gender?, avatar_url? }>,
 *   send_invites?: boolean   // default true
 * }
 *
 * Returns: { success: true, created: [...], skipped: [...], errors: [...], summary }
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { competition_id, contestants, send_invites = true } = await req.json()

    if (!competition_id) {
      return json({ error: 'competition_id is required' }, 400)
    }
    if (!Array.isArray(contestants) || contestants.length === 0) {
      return json({ error: 'contestants must be a non-empty array' }, 400)
    }
    // Guardrail against accidental huge payloads.
    if (contestants.length > 500) {
      return json({ error: 'Cannot import more than 500 people at once' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 1. Authorize the caller ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return json({ error: 'Not authenticated' }, 401)
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
    const caller = userData?.user
    if (userError || !caller) {
      return json({ error: 'Invalid or expired session' }, 401)
    }

    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('id, name, host_id, entry_type')
      .eq('id', competition_id)
      .maybeSingle()

    if (compError || !comp) {
      return json({ error: 'Competition not found' }, 404)
    }

    let authorized = comp.host_id === caller.id

    if (!authorized) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', caller.id)
        .maybeSingle()
      if (profile?.is_super_admin) authorized = true
    }

    if (!authorized) {
      const { data: coHost } = await supabase
        .from('competition_co_hosts')
        .select('user_id')
        .eq('competition_id', competition_id)
        .eq('user_id', caller.id)
        .maybeSingle()
      if (coHost) authorized = true
    }

    if (!authorized) {
      return json({ error: 'You do not have permission to manage this competition' }, 403)
    }

    // This path is only for competitions whose entry type is host_upload — the
    // host provides the roster instead of running nominations/applications.
    // Enforced server-side so it can't be bypassed by calling the function
    // directly. (The dashboard also hides the button for other entry types.)
    if (comp.entry_type !== 'host_upload') {
      return json({
        error: 'This competition isn’t set up for host roster uploads. Set its entry type to “I upload my roster” first.',
      }, 400)
    }

    const competitionName = comp.name || 'Most Eligible'

    // ── 2. Pre-load existing contestants so we can dedupe cleanly ─────────
    const { data: existingContestants } = await supabase
      .from('contestants')
      .select('user_id, email')
      .eq('competition_id', competition_id)

    const existingUserIds = new Set(
      (existingContestants || []).map((c) => c.user_id).filter(Boolean)
    )
    const existingEmails = new Set(
      (existingContestants || [])
        .map((c) => c.email?.trim().toLowerCase())
        .filter(Boolean)
    )

    const created: Array<{ name: string; email: string; action: string; existingAccount: boolean; emailed: boolean }> = []
    const skipped: Array<{ name: string; email: string; reason: string }> = []
    const errors: Array<{ name: string; email: string; error: string }> = []

    for (const row of contestants) {
      const name = String(row?.name || '').trim()
      const email = String(row?.email || '').trim().toLowerCase()

      if (!name) {
        skipped.push({ name: name || '(unnamed)', email, reason: 'Missing name' })
        continue
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped.push({ name, email, reason: 'Missing or invalid email' })
        continue
      }
      if (existingEmails.has(email)) {
        skipped.push({ name, email, reason: 'Already a contestant in this competition' })
        continue
      }

      try {
        // ── Resolve or create the auth user ──────────────────────────────
        let authUserId: string | null = null
        let isNewAccount = false

        // Existing profile by email? Use ilike for case-insensitive matching,
        // but escape LIKE wildcards (_ and %) so an address such as
        // "a_b@x.com" can't accidentally match a different account.
        const emailPattern = email.replace(/([\\%_])/g, '\\$1')
        const { data: profileByEmail } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', emailPattern)
          .maybeSingle()

        if (profileByEmail?.id) {
          const { data: existing, error: getErr } = await supabase.auth.admin.getUserById(profileByEmail.id)
          if (existing?.user) {
            authUserId = existing.user.id
          } else if (!getErr) {
            // Definitively no auth user for this profile id — a truly orphaned
            // profile. Clear it so createUser (which triggers handle_new_user)
            // doesn't collide. We only do this on a clean "not found", never on
            // a transient error, so we can't delete a real user's profile.
            await supabase.from('profiles').delete().eq('id', profileByEmail.id)
          }
          // On a transient error we leave the profile alone and fall through to
          // the listUsers lookup below.
        }

        // Existing auth user by email (not yet in profiles)?
        if (!authUserId) {
          const { data: listData } = await supabase.auth.admin.listUsers({
            filter: email,
            page: 1,
            perPage: 50,
          })
          const match = listData?.users?.find(
            (u: { email?: string }) => u.email?.toLowerCase() === email
          )
          if (match) authUserId = match.id
        }

        const nameParts = name.split(/\s+/)
        const firstName = nameParts[0] || ''
        const lastName = nameParts.slice(1).join(' ') || ''

        // Create the account if we still don't have one.
        if (!authUserId) {
          isNewAccount = true
          const tempPassword = crypto.randomUUID() + '!A1'

          const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { first_name: firstName, last_name: lastName },
          })

          if (createError) {
            // createUser can fail mid-flight (e.g. handle_new_user hiccup) yet
            // still leave a usable user — try to recover it before erroring.
            const { data: retryList } = await supabase.auth.admin.listUsers({
              filter: email,
              page: 1,
              perPage: 50,
            })
            const found = retryList?.users?.find(
              (u: { email?: string }) => u.email?.toLowerCase() === email
            )
            if (found) {
              authUserId = found.id
            } else {
              errors.push({ name, email, error: `Failed to create account: ${createError.message}` })
              continue
            }
          } else if (newUser?.user) {
            authUserId = newUser.user.id
          }
        }

        if (!authUserId) {
          errors.push({ name, email, error: 'Could not create or find an account' })
          continue
        }

        // Someone already competing under this account? Dedupe.
        if (existingUserIds.has(authUserId)) {
          skipped.push({ name, email, reason: 'Already a contestant in this competition' })
          continue
        }

        // ── Sync roster data to the profile ──────────────────────────────
        const age = parseAge(row?.age)
        const instagram = normalizeInstagram(row?.instagram)

        // Does a real profile row already exist for this account?
        const { data: current } = await supabase
          .from('profiles')
          .select('email, first_name, last_name, avatar_url, bio, city, age, instagram, phone, onboarded_at')
          .eq('id', authUserId)
          .maybeSingle()

        let profilePayload: Record<string, unknown>
        if (isNewAccount || !current) {
          // Brand-new account, OR an auth user that somehow has no profile row
          // yet (orphaned account). Seed the profile fully from the roster row.
          // `email` MUST be present — profiles.email is NOT NULL, and without a
          // row to update this upsert becomes an insert.
          profilePayload = {
            id: authUserId,
            email,
            first_name: firstName,
            last_name: lastName,
            avatar_url: row?.avatar_url || null,
            bio: row?.bio || null,
            city: row?.city || null,
            age,
            instagram,
            phone: row?.phone || null,
            onboarded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        } else {
          // Existing account with a real profile — this is a person who already
          // set themselves up. Never clobber what they entered; only fill in
          // fields that are currently blank (e.g. they never added a photo but
          // the host has one). Keep their existing email.
          profilePayload = {
            id: authUserId,
            email: current.email || email,
            updated_at: new Date().toISOString(),
          }
          if (!current.first_name && firstName) profilePayload.first_name = firstName
          if (!current.last_name && lastName) profilePayload.last_name = lastName
          if (!current.avatar_url && row?.avatar_url) profilePayload.avatar_url = row.avatar_url
          if (!current.bio && row?.bio) profilePayload.bio = row.bio
          if (!current.city && row?.city) profilePayload.city = row.city
          if (!current.age && age != null) profilePayload.age = age
          if (!current.instagram && instagram) profilePayload.instagram = instagram
          if (!current.phone && row?.phone) profilePayload.phone = row.phone
          if (!current.onboarded_at) profilePayload.onboarded_at = new Date().toISOString()
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(profilePayload, { onConflict: 'id', ignoreDuplicates: false })

        if (profileError) {
          errors.push({ name, email, error: `Profile sync failed: ${profileError.message}` })
          continue
        }

        // ── Insert the contestant row directly ───────────────────────────
        // When the email already belongs to a real account, that person's OWN
        // profile wins over the host's typed values — the host is just adding
        // them, not overriding who they are. Fall back to the host input only
        // where the profile is blank. A brand-new account has no profile to
        // defer to, so the host's input is used as-is.
        const useProfile = !isNewAccount && current
        const profileName = useProfile
          ? [current.first_name, current.last_name].filter(Boolean).join(' ').trim()
          : ''

        const contestantRecord: Record<string, unknown> = {
          competition_id,
          user_id: authUserId,
          name: profileName || name,
          email,
          phone: (useProfile ? current.phone : null) || row?.phone || null,
          instagram: normalizeInstagram((useProfile ? current.instagram : null) || instagram),
          city: (useProfile ? current.city : null) || row?.city || null,
          age: (useProfile ? current.age : null) ?? age,
          bio: (useProfile ? current.bio : null) || row?.bio || null,
          gender: row?.gender || null,
          avatar_url: (useProfile ? current.avatar_url : null) || row?.avatar_url || null,
          status: 'active',
          votes: 0,
        }

        let { error: insertError } = await supabase.from('contestants').insert(contestantRecord)

        // Schema-cache fallback if the gender column hasn't propagated yet.
        if (
          insertError &&
          (insertError.code === 'PGRST204' ||
            insertError.message?.includes('schema cache') ||
            insertError.message?.includes('column "gender"'))
        ) {
          const { gender, ...withoutGender } = contestantRecord
          void gender
          ;({ error: insertError } = await supabase.from('contestants').insert(withoutGender))
        }

        if (insertError) {
          errors.push({ name, email, error: `Failed to add contestant: ${insertError.message}` })
          continue
        }

        // Track so later rows in this same batch dedupe against it too.
        existingUserIds.add(authUserId)
        existingEmails.add(email)

        // Bump the person's lifetime competition count.
        try {
          const { error: rpcError } = await supabase.rpc('increment_profile_competitions', {
            p_user_id: authUserId,
          })
          if (rpcError) {
            const { data: p } = await supabase
              .from('profiles')
              .select('total_competitions')
              .eq('id', authUserId)
              .maybeSingle()
            if (p) {
              await supabase
                .from('profiles')
                .update({ total_competitions: (p.total_competitions || 0) + 1 })
                .eq('id', authUserId)
            }
          }
        } catch (_) {
          // Non-fatal — the stat can be reconciled later.
        }

        // ── Email a "claim your profile / set password" link ─────────────
        // Only for brand-new accounts, and only when the host asked us to.
        if (send_invites && isNewAccount) {
          try {
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
              type: 'recovery',
              email,
              options: { redirectTo: `${appUrl}/reset-password` },
            })

            const recoveryLink = linkData?.properties?.action_link
            if (!linkError && recoveryLink) {
              const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  type: 'account_ready',
                  to_email: email,
                  to_name: name,
                  nominee_name: name,
                  competition_name: competitionName,
                  competition_id,
                  reset_password_url: recoveryLink,
                }),
              })
              if (!emailResp.ok) {
                console.warn(`account_ready email failed for ${email}:`, await emailResp.text())
              }
            } else if (linkError) {
              console.warn(`generateLink failed for ${email}:`, linkError.message)
            }
          } catch (emailErr) {
            // Non-fatal — they can always use "Forgot password" to get in.
            console.warn(`Email send error for ${email}:`, emailErr)
          }
        }

        created.push({
          name: (contestantRecord.name as string) || name,
          email,
          existingAccount: !isNewAccount,
          // We only email brand-new accounts a set-password link; someone who
          // already has an account keeps their existing login.
          emailed: isNewAccount && send_invites,
          action: isNewAccount
            ? send_invites
              ? 'Created account + added as contestant + sent claim email'
              : 'Created account + added as contestant'
            : 'Linked existing account + added as contestant (no email — already has a login)',
        })
      } catch (err) {
        console.error(`Error importing ${name} (${email}):`, err)
        errors.push({ name, email, error: String(err) })
      }
    }

    return json({
      success: true,
      created,
      skipped,
      errors,
      summary: `${created.length} added, ${skipped.length} skipped, ${errors.length} errors`,
    })
  } catch (error) {
    console.error('Error in bulk-import-contestants:', error)
    return json({ error: 'Internal server error', details: String(error) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseAge(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = parseInt(String(raw), 10)
  if (Number.isNaN(n) || n < 0 || n > 120) return null
  return n
}

function normalizeInstagram(raw: unknown): string | null {
  if (!raw) return null
  const clean = String(raw)
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/+$/, '')
    .split(/[/?#]/)[0]
  return clean || null
}
