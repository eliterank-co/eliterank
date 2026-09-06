import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkFanEmailPreflight } from './_shared/fan-email-preflight.ts'

const payload = {
  fan_id: 'fan-1', recipient_id: 'user-1', to_email: 'fan@example.test', competition_id: 'competition-1',
}

function fixture() {
  const state = {
    contestant: { status: 'active', competition_id: 'competition-1' } as Record<string, string> | null,
    subscribed: true,
    email: ' Fan@example.test ',
    failure: '',
    reads: 0,
  }
  const db = createClient('https://example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input) => {
      const url = new URL(String(input))
      const table = url.pathname.split('/').pop()
      assertEquals(url.searchParams.get(table === 'profiles' ? 'id' : 'user_id'), 'eq.user-1')
      if (table === 'contestant_fans') {
        state.reads++
        assertEquals(url.searchParams.get('id'), 'eq.fan-1')
        assertStringIncludes(url.searchParams.get('select') || '', 'contestant:contestants(status,competition_id)')
      }
      if (state.failure === table) {
        return Promise.resolve(new Response(JSON.stringify({ message: 'lookup failed' }), { status: 500 }))
      }
      const data = table === 'profiles' ? [{ email: state.email }] : [{
        id: 'fan-1', user_id: 'user-1', email_weekly_updates: state.subscribed, contestant: state.contestant,
      }]
      return Promise.resolve(new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }))
    } },
  })
  return { db, state }
}

Deno.test('fresh preflight allows active contestant, then suppresses after elimination', async () => {
  const { db, state } = fixture()
  assertEquals(await checkFanEmailPreflight(db, payload), { eligible: true, error: null })
  state.contestant!.status = 'eliminated'
  assertEquals(await checkFanEmailPreflight(db, payload), { eligible: false, error: null })
  assertEquals(state.reads, 2)
})

Deno.test('inactive, missing, and wrong-competition contestants are suppressed', async () => {
  const { db, state } = fixture()
  for (const contestant of [
    { status: 'withdrawn', competition_id: 'competition-1' },
    { status: 'pending', competition_id: 'competition-1' },
    { status: 'active', competition_id: 'different-competition' },
    null,
  ]) {
    state.contestant = contestant
    assertEquals(await checkFanEmailPreflight(db, payload), { eligible: false, error: null })
  }
})

Deno.test('current unsubscribe and recipient-email guards remain enforced', async () => {
  const { db, state } = fixture()
  state.subscribed = false
  assertEquals((await checkFanEmailPreflight(db, payload)).eligible, false)
  state.subscribed = true
  state.email = 'changed@example.test'
  assertEquals((await checkFanEmailPreflight(db, payload)).eligible, false)
})

Deno.test('lookup failures fail closed and remain retryable errors', async () => {
  const { db, state } = fixture()
  for (const table of ['contestant_fans', 'profiles']) {
    state.failure = table
    assertEquals(await checkFanEmailPreflight(db, payload), { eligible: false, error: 'lookup failed' })
  }
})
