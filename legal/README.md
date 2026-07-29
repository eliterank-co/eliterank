# EliteRank — Legal & Contract Copy

This folder contains the **verbatim copy** of EliteRank's legal documents, extracted from the source of record in the codebase. Each file is the plain-text version of the live document (HTML entities decoded; markup removed).

| Document | Source of record | Applies to |
| --- | --- | --- |
| [Terms of Use](./Terms-of-Use.md) | `src/pages/TermsPage.jsx` | Everyone using the Service |
| [Contest Terms & Conditions](./Contest-Terms-and-Conditions.md) | `src/pages/ContestTermsPage.jsx` | Entrants, voters, participants |
| [Privacy Policy](./Privacy-Policy.md) | `src/pages/PrivacyPage.jsx` | Everyone (US-led, with CCPA/GDPR/PIPEDA notices) |
| [Cookie Policy](./Cookie-Policy.md) | `src/pages/CookiesPage.jsx` | Everyone |
| [Host Agreement](./Host-Agreement.md) | `src/lib/hostAgreement.js` (version `2026-07-v1`) | Organizations that host competitions |
| [Official Rules (template)](./Official-Rules-Template.md) | `src/lib/officialRules.js` | Per competition — generated from each competition's configuration |

## Notes

- **Operator of record:** Most Eligible LLC (Illinois, USA), doing business as EliteRank.
- **"Last Updated" dates** on the four policy pages are **May 26, 2026**. The Host Agreement is versioned (**2026-07-v1**) and is SHA-256-hashed on acceptance so the exact wording a host agreed to can always be proven.
- **Official Rules are not a single static document.** They are generated per competition from that competition's own setup, so the actual operator, eligibility, schedule, scoring, judging, prizes, and charity always match how it is configured. `Official-Rules-Template.md` reproduces the verbatim boilerplate with dynamic fields shown in `{{braces}}` and conditional sections marked.
- These Markdown files are a **snapshot for reference/review**. The rendered pages in `src/` remain the authoritative source — if the copy changes there, regenerate these files.
