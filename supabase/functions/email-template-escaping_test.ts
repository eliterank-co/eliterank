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
