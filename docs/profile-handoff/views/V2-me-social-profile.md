# V2 — Social profile (v3)

| | |
| --- | --- |
| **Route** | `/me` |
| **Renders when** | `social_profile` is **on** |
| **Source** | `src/app/(public)/(member)/me/_v3/page-v3.tsx`, `src/components/profile/{hero,timeline,panels}.tsx` |
| **Data** | `loadMyTimeline`, `loadMemberProfileExtras`, `loadPublicProfile`, `listFansOfVoter`, `listMyWatching`, `listCompetitions` |
| **Diagram** | [`V2-me-social-profile.svg`](../assets/diagrams/V2-me-social-profile.svg) |
| **Screenshot** | `IMG-V2-a` — not captured, see [assets](../assets/README.md) |
| **Findings** | [G1](../findings.md#g1--interests-render-but-cannot-be-edited), [G2](../findings.md#g2--host-role-never-appears-on-a-profile), [G3](../findings.md#g3--bonus-tasks-are-visible-only-after-the-fact), [S3](../findings.md#s3--profile-icon-size-and-alignment) |
| **Tests** | [`V2-me-social-profile.spec.ts`](../tests/e2e/V2-me-social-profile.spec.ts) |

## What it does today

The owner's view of the page a visitor sees at `/p/[voterId]` — same hero, same
timeline component, different actions plus one owner-only count (Watching).

Hero carries name, avatar, cover, headline, bio, city, occupation, socials,
pinned link and crown count, with counts for Fans, Crowns, Competitions and
Watching. Below: a media section (gallery + intro video), the activity timeline,
and a sidebar with a discovery rail, an Interests panel and a Fans list. Actions
are Share, View as visitor, and Edit.

Note the layout deliberately drops the member-area identity strip here, because
rendering it above this hero would show the same name twice.

## Requirements

- **RQ-V2-1** A panel with a heading must be capable of holding content. An
  empty-state that instructs the reader to use a control must point at a control
  that exists.
- **RQ-V2-2** Host membership is identity and belongs in the hero, named by
  organization rather than a generic badge.
- **RQ-V2-3** A contestant with open bonus tasks must be able to see them from
  their own profile, not only from the competition page.
- **RQ-V2-4** Owner-only data (the Watching count) must never appear on the
  public rendering of the same components.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V2-01` | A member who owns or belongs to an organization sees that organization named in the hero. A non-host sees no host affordance. | G2 | `T-AC-V2-01` + `T-AC-V2-01b` |
| `AC-V2-02` | A contestant with at least one incomplete bonus task sees those open tasks on their own profile, each linking to the action that completes it. | G3 | `T-AC-V2-02` |
| `AC-V2-03` | The hero avatar renders larger than the current 44×44, and identity text below it is left-aligned. (Owner feedback: "a bit bigger" — the exact size is a design call; larger-than-current and left-alignment are the testable floor.) | S3 | `T-AC-V2-03` (visual) |
| `AC-V2-04` | The Interests panel either renders member-set interests or does not render. Its empty-state never references a control that does not exist. | G1 | `T-AC-V2-04` |
| `AC-V2-05` | The Watching count renders for the owner and is absent from `/p/[voterId]`. | — (regression guard) | `T-AC-V2-05` |

## Notes

`AC-V2-05` guards behaviour that is currently correct. It is here so a fix to
`G2` or `G3` — both of which touch the shared hero — cannot leak owner-only data
onto the public page.
