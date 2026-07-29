# Cookie Policy

**Last Updated: May 26, 2026**

## 1. About This Policy

This Cookie Policy explains how **Most Eligible LLC** ("EliteRank," "we," "us," or "our") uses cookies and similar technologies when you visit eliterank.co or use our services (collectively, the "Service"). This Cookie Policy supplements our Privacy Policy.

By using the Service, you consent to our use of cookies and similar technologies in accordance with this Cookie Policy. You can control cookies through your browser settings as described in Section 5.

## 2. What Are Cookies and Similar Technologies?

**Cookies** are small text files placed on your device when you visit a website. They let websites remember your actions and preferences (such as login, language, and other display preferences) so you don't have to re-enter them on every visit.

Cookies can be **session** (deleted when you close the browser) or **persistent** (kept until they expire or you delete them). They can also be **first-party** (set by EliteRank) or **third-party** (set by a service we use).

We also use closely related technologies including:

- **HTML5 local storage and sessionStorage** — key/value storage in your browser used for purposes similar to cookies;
- **Browser fingerprinting** — a derived identifier based on publicly readable browser characteristics, used for fraud prevention only;
- **Web beacons / pixels** — small images used to measure email delivery and open rates for transactional messages;
- **SDKs and embedded scripts** — from our service providers (such as Stripe and Sentry) that may set their own cookies when their features are used.

## 3. How We Use Cookies

### 3.1 Strictly Necessary (Essential)

These cookies and storage entries are required for the Service to function and cannot be disabled in our systems. They are usually set in response to actions you take, such as signing in, voting, or setting preferences.

| Name | Provider | Purpose | Expiration |
| --- | --- | --- | --- |
| `sb-*-auth-token` | Supabase | Maintains your authenticated session and keeps you signed in. | 1 hour (rolling refresh) / up to 1 year |
| `sb-*-auth-token-code-verifier` | Supabase | Protects the OAuth / PKCE login flow against interception. | Session |
| `eliterank-anon-voted-v2-*` | EliteRank (localStorage) | Tracks anonymous votes already cast so the same person is not double-charged the free vote credit. | Persistent until cleared |
| `chunk-error-reload` | EliteRank (sessionStorage) | Prevents an infinite reload loop when a deployment changes JS chunk hashes mid-session. | Session |

### 3.2 Functional / Fraud Prevention

These technologies protect the integrity of competitions by detecting duplicate accounts and abusive voting patterns. They are not used for advertising and are not shared with third parties for marketing purposes. Where consent is required by law, you may opt out using the cookie preferences below; opting out may limit your ability to participate in certain voting flows.

| Name | Provider | Purpose | Expiration |
| --- | --- | --- | --- |
| `visitorId (browser fingerprint)` | FingerprintJS | Generates a stable browser identifier from publicly readable browser characteristics to detect duplicate accounts and fraudulent voting. Not a traditional cookie. | Re-derived per visit |

### 3.3 Analytics & Performance

These cookies and signals collect anonymized information about how visitors use the Service so we can measure performance and improve features.

| Name | Provider | Purpose | Expiration |
| --- | --- | --- | --- |
| `_vercel_speed_insights` | Vercel | Collects anonymized page-load performance metrics so we can keep the Service fast. | Session |

### 3.4 Error and Performance Monitoring

Headers used by Sentry to correlate errors and traces. These are sent only as part of normal requests and are not stored on your device.

| Name | Provider | Purpose | Expiration |
| --- | --- | --- | --- |
| `sentry-trace / baggage` | Sentry | Sent as request headers to correlate errors and performance traces across the front end and back end. Not stored on your device. | Per request |

### 3.5 Marketing / Advertising

**We do not currently use marketing or advertising cookies on the Service.** If we add any in the future, we will update this Cookie Policy and request your consent where required by law before setting them.

## 4. Third-Party Cookies

Some of our service providers may set their own cookies when their features are loaded on the Service. Their cookies are governed by their own privacy policies:

- **Stripe** (payments — only when you open the checkout flow): stripe.com/cookies-policy/legal
- **Supabase** (auth and storage): supabase.com/privacy
- **Vercel** (hosting and performance): vercel.com/legal/privacy-policy
- **OneSignal** (email / push delivery): onesignal.com/privacy_policy
- **Sentry** (error monitoring): sentry.io/privacy
- **FingerprintJS** (fraud prevention): fingerprint.com/privacy-policy

## 5. Managing Your Cookie Preferences

You can control cookies in your browser settings. Disabling essential cookies may prevent parts of the Service from functioning. Browser-level instructions:

- Google Chrome
- Mozilla Firefox
- Apple Safari
- Microsoft Edge

## 6. Changes to This Cookie Policy

We may update this Cookie Policy from time to time to reflect changes in our practices, the cookies we use, or for other operational, legal, or regulatory reasons. We will post the revised Cookie Policy with an updated "Last Updated" date. Please review it periodically.

## 7. Contact

Questions about this Cookie Policy? Contact us:

> **Most Eligible LLC**
> c/o Registered Agent
> 1 W Old State Capitol Plaza, Suite 805
> Springfield, IL 62701
> Email: info@eliterank.co
> Website: eliterank.co
