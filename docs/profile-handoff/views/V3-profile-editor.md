# V3 — Profile editor

| | |
| --- | --- |
| **Route** | `/me/profile` (also reached as `/profile?edit=true` on the crossover) |
| **Renders when** | Both flag paths — this component is flag-independent |
| **Source** | `src/experiences/voter/profile/profile-edit.tsx`, `use-media-upload.ts`, `city-autocomplete.tsx`; server side `src/lib/actions/profile.ts` |
| **Diagram** | [`V3-profile-editor.svg`](../assets/diagrams/V3-profile-editor.svg) |
| **Screenshot** | `IMG-V3-a` (owner-supplied, three-part) — see [assets](../assets/README.md) |
| **Findings** | [P1](../findings.md#p1--saving-a-profile-with-a-pasted-social-url-fails-with-a-bare-error), [P2](../findings.md#p2--intro-video-saves-with-an-error-then-renders-as-a-black-frame), [S1](../findings.md#s1--pinned-link-and-link-are-indistinguishable-in-the-editor), [G1](../findings.md#g1--interests-render-but-cannot-be-edited), [G6](../findings.md#g6--age-and-video-prompts-have-no-v2-equivalent) |
| **Tests** | [`V3-profile-editor.spec.ts`](../tests/e2e/V3-profile-editor.spec.ts), [`social-handle.test.ts`](../tests/unit/social-handle.test.ts) |

## What it does today

Sections: cover + avatar, Personal Information (display name, first, last, city,
headline), Bio (500 chars), Connect (Instagram, TikTok, X, LinkedIn, Link,
Pinned Link, Pinned Link Label), Photo Gallery (up to 6), Intro Video (upload or
YouTube embed), then Save.

Media commits **immediately** on upload and updates local state; Save
atomically persists the remaining identity fields. Occupation, birthdate and
interests are deliberately outside this editor.

This is the surface most ahead of legacy — cover image, display name, pinned
link, X handle and YouTube embed have no legacy equivalent.

## Requirements

- **RQ-V3-1** A rejected save must identify which field was rejected. (REQ-11)
- **RQ-V3-2** A field whose placeholder or helper text advertises a format must
  accept that format. (REQ-12)
- **RQ-V3-3** The same social value must be accepted identically here and in the
  contestant editor. Both write the same columns.
- **RQ-V3-4** A save must never report failure for work that already committed.
  (REQ-13)
- **RQ-V3-5** Media that has uploaded successfully must render with a visible
  first frame, not a black rectangle.
- **RQ-V3-6** Two fields that do different things must be labelled differently
  enough to tell apart without reading the code.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V3-01` | Pasting `https://instagram.com/crystalkendzior` into Instagram and saving succeeds, storing the handle `crystalkendzior`. Same for TikTok, X and LinkedIn. | P1 | `T-AC-V3-01` (unit + e2e) |
| `AC-V3-02` | A genuinely invalid social value produces an error naming the field, not a form-level generic. | P1 | `T-AC-V3-02` |
| `AC-V3-03` | A value accepted by the contestant editor is accepted here, and vice versa, for all four networks. | P1 | `T-AC-V3-03` (unit) |
| `AC-V3-04` | Uploading an intro video then clicking Save produces no error, and the video persists. | P2 | `T-AC-V3-04` |
| `AC-V3-05` | A saved intro video renders a visible poster frame before playback, never a black rectangle. | P2 | `T-AC-V3-05` (visual) |
| `AC-V3-06` | Interests are editable here, or the Interests panel and its empty-state copy are removed from V2. | G1 | `T-AC-V3-06` |
| `AC-V3-07` | A documented decision exists for age and video prompts: implemented, or recorded as an intentional drop. | G6 | Manual — [checklist](../tests/manual/verification-checklist.md) |
| `AC-V3-08` | "Link" and "Pinned Link" are labelled so their difference is clear without reading source; placeholders are not near-identical. | S1 | `T-AC-V3-08` (visual) |

## Notes

`AC-V3-01`, `AC-V3-02` and `AC-V3-03` are the highest-value automated coverage
in this package: the validation logic is pure and needs no session, so
[`tests/unit/social-handle.test.ts`](../tests/unit/social-handle.test.ts) runs
today against the real schema.
