# Voter password setup and recovery

## Requirement

Keep the account created during anonymous free voting. A returning voter must be
able to set or reset a password using the same email, retain their account and
votes, and return to the contestant to confirm becoming a fan.

The anonymous vote endpoint already creates an Auth user without a password.
The login page's account-existence check therefore correctly recognizes that
email, but previously offered only password sign-in and a generic forgot-password
link. This change addresses that account-access journey; it does not create a
second account or change how votes are credited.

## Delivery scope

- Make password setup/reset explicit for existing accounts, including people
  who voted before choosing a password.
- Continue using Supabase Auth recovery to verify email ownership before setting
  a password. Retain the explicit confirmation click for scanner-safe token use.
- Show actionable errors and permit retry when a recovery request fails. A
  successful API response is request acceptance, not proof of inbox delivery.
- Keep normal password sign-in available after requesting recovery.
- Route existing `/signup` links to the shared login/sign-up screen while
  retaining their query parameters. Normalize the receipt producer's full
  same-origin contestant URL into an app path; reject external destinations.
  Public contestant profile links retain the pending fan confirmation intent.
- Pass a validated destination through the existing signup hook's optional
  email redirect so a new account's confirmation can return to the contestant.
  A signup response without an authenticated session does not grant access.
- Validate return destinations and restore the fan destination after recovery
  where the recovery URL or browser context supplies it. Becoming a fan still
  requires the existing explicit opt-in confirmation.

## Recovery destination and email template

The saved production investigation reports a recovery email template that uses
`SiteURL/reset-password?token_hash=TokenHash&type=recovery`. That form preserves
the one-time token until a person confirms, but does not carry the requested
`redirectTo` destination.

The client supports a validated return destination in the recovery URL and
a one-hour, same-origin browser fallback in one app-owned localStorage key.
The fallback contains a navigation
path only, never a password, recovery token, or customer email. Storage failure
does not prevent password recovery. The reset page captures the destination
before a second tab can consume it; failed password updates retain it for retry.
Only that key is consumed on success or invalidated for malformed/expired data.
Same-browser restoration does not guarantee
cross-device or cross-browser restoration when the email template omits the
destination.

Changing the hosted email template or redirect allowlist is a separate production
configuration operation. Preserve scanner-safe token handling if that change is
released. Supabase documents the distinction between `SiteURL` and `RedirectTo`
in its [email template reference](https://supabase.com/docs/guides/auth/auth-email-templates).

## Acceptance checks

- An email with an existing account reaches sign-in and offers password setup
  without another registration.
- New emails can still reach registration; existing passwords still sign in.
- Recovery request rejection or network failure shows an error and allows retry.
- An accepted recovery request does not permanently disable password sign-in.
- Recovery links are not exchanged on page load; an explicit click is required.
- Invalid or expired links cannot unlock the password form and offer a way back.
- Valid recovery updates the existing authenticated account and restores an
  allowed return path; external or malformed redirects are rejected.
- `/signup` compatibility routing preserves the intended contestant destination.
- Legacy receipt URLs are tested with their actual absolute same-origin shape;
  cross-origin URLs remain blocked. Signup confirmation options are verified at
  the Auth SDK boundary without treating an unconfirmed user as signed in.
- Mobile and desktop render the relevant states with the production styles.

## Release and evidence boundary

This is a frontend change. No migration, bulk account recreation, vote rewrite,
payment change, or production email send is required by the implementation.
Local tests with synthetic accounts verify application behavior and error
handling; they do not prove hosted Auth behavior or real recipient inbox delivery.

On Node 26, run the browser-oriented suite with
`NODE_OPTIONS=--no-experimental-webstorage npm test` so jsdom supplies its own
storage implementation. Without that flag, two unchanged storage test files
fail because Node's built-in localStorage is unavailable without a backing file.
Do not change browser storage, application code, or production settings to work
around this test-runner conflict.

Before describing the fix as live, publish and review the PR, obtain the required
release authorization, confirm the deployed candidate, and verify the recovery
journey with an authorized test account. A reported customer delivery failure
requires that recipient's address and request time to inspect the corresponding
Auth and email-provider records.
