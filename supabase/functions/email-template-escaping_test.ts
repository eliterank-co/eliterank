import { assert, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { getEmailContent, type EmailRequest } from './send-onesignal-email/index.ts'
import { renderEmailTemplate, type TemplateData } from './process-engagement-queue/index.ts'
import { buildPhotoEmail } from './send-photobooth-photo/index.ts'

const hostile = '<script>alert(1)</script> & "quoted"'
const escaped = '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot;'

const senderRequest = {
  type: 'nominee_invite',
  to_email: 'recipient@example.test',
  to_name: hostile,
  nominee_name: hostile,
  nominator_name: hostile,
  competition_name: hostile,
  city_name: hostile,
  claim_url: `https://example.test/claim?value=${hostile}`,
  competition_url: `https://example.test/competition?value=${hostile}`,
  reason: hostile,
  nominee_email: hostile,
  reset_password_url: `https://example.test/reset?value=${hostile}`,
  contestant_name: hostile,
  profile_url: `https://example.test/profile?value=${hostile}`,
  unsubscribe_url: `https://example.test/unsubscribe?value=${hostile}`,
  next_event_name: hostile,
  next_event_date: hostile,
  signup_url: `https://example.test/signup?value=${hostile}`,
  tax_label: hostile,
  receipt_number: hostile,
  vendor_legal_name: hostile,
  vendor_tax_number: hostile,
  vendor_address: hostile,
  nomination_end: hostile,
  nomination_start: hostile,
  voting_round_end: hostile,
} satisfies EmailRequest

Deno.test('send-onesignal HTML templates escape relationship-derived values', () => {
  const types: EmailRequest['type'][] = [
    'nominee_invite',
    'nominee_reminder',
    'self_nominee_reminder',
    'nominator_confirm',
    'nominee_accepted',
    'nominee_declined',
    'account_ready',
    'contestant_promoted',
    'fan_confirmation',
    'fan_weekly_digest',
    'fan_round_closing',
    'fan_vote_boost',
    'vote_receipt',
    'nominations_open_subscriber',
    'subscriber_confirmation',
    'judge_invite',
  ]

  for (const type of types) {
    const result = getEmailContent({ ...senderRequest, type })
    assertStringIncludes(result.body, escaped)
    assert(!result.body.includes(hostile), `${type} leaked hostile HTML`)
  }
})

Deno.test('send-onesignal subject remains plain text', () => {
  const result = getEmailContent(senderRequest)
  assertStringIncludes(result.subject, hostile)
})

Deno.test('weekly fan update shows round totals without the weekly vote line', () => {
  const result = getEmailContent({
    type: 'fan_weekly_digest', to_email: 'fan@example.test',
    contestant_name: 'Alex Morgan', competition_name: 'City Creators',
    total_votes: 12480, weekly_votes: 1260, profile_url: 'https://example.test/profile/alex',
  })
  assert(result.subject === 'Weekly update on Alex Morgan - City Creators')
  assertStringIncludes(result.body, '12,480')
  assertStringIncludes(result.body, '>this round<')
  assertStringIncludes(result.body, 'Vote for Alex Morgan')
  assert(!result.body.includes('all time'))
  assert(!result.body.includes('votes credited this week'))
  assert(!result.body.includes('1,260'))
})

Deno.test('fan boost copy selects double or triple and escapes names once', () => {
  for (const multiplier of [2, 3]) {
    const result = getEmailContent({
      type: 'fan_vote_boost', to_email: 'fan@example.test',
      contestant_name: 'Alex & Morgan', competition_name: hostile,
      vote_multiplier: multiplier, profile_url: 'https://example.test/profile/alex?a=1&b=2',
    })
    assertStringIncludes(result.body, `All votes cast for <strong>Alex &amp; Morgan</strong> in <strong>${escaped}</strong> are now worth ${multiplier === 3 ? 'triple' : 'double'}. Ends soon!`)
    assertStringIncludes(result.body, 'Vote for Alex &amp; Morgan')
    assertStringIncludes(result.body, 'https://example.test/profile/alex?a=1&amp;b=2')
    assert(!result.body.includes('&amp;amp;'))
    assert(!result.body.includes('The price does not change'))
    assert(!result.body.includes('Purchase votes for'))
  }
})

Deno.test('engagement email HTML is escaped while its text part stays raw', () => {
  const data = {
    nominee_name: hostile,
    nominator_name: hostile,
    competition_name: hostile,
    city_name: hostile,
    claim_url: `https://example.test/claim?value=${hostile}`,
    profile_url: `https://example.test/profile?value=${hostile}`,
    competition_url: `https://example.test/competition?value=${hostile}`,
    voting_starts: hostile,
  } satisfies TemplateData
  const result = renderEmailTemplate('nomination_reminder_48h', data)

  assertStringIncludes(result.html, escaped)
  assert(!result.html.includes(hostile), 'engagement HTML leaked hostile HTML')
  assertStringIncludes(result.text, hostile)
})

Deno.test('photo email HTML escapes nominee names and image URLs', () => {
  const result = buildPhotoEmail([`https://example.test/photo?value=${hostile}`], hostile)

  assertStringIncludes(result.body, escaped)
  assert(!result.body.includes(hostile), 'photo email leaked hostile HTML')
  assertStringIncludes(result.subject, hostile)
})

Deno.test('fan email CTAs open profiles and never the legacy vote popup', () => {
  for (const type of ['fan_weekly_digest', 'fan_vote_boost', 'fan_round_closing'] as const) {
    for (const vote_multiplier of [2, 3]) {
      for (const profile_url of ['https://example.test/profile/user-123', undefined]) {
        const result = getEmailContent({
          type, to_email: 'fan@example.test', contestant_name: 'Alex', vote_multiplier,
          profile_url,
          competition_url: 'https://example.test/most-eligible/bachelors',
          purchase_votes_url: 'https://example.test/most-eligible/bachelors?voteFor=contestant-456',
        })
        assertStringIncludes(result.body, `href="${profile_url || 'https://example.test/most-eligible/bachelors'}"`)
        assert(!result.body.includes('voteFor='), `${type} opened the legacy vote popup`)
      }
    }
  }
})
