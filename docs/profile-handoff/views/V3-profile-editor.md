# V3 — Profile editor

| | |
| --- | --- |
| **Route** | `/me/profile` (either experience; also reachable from the profile hero's Edit Profile — the specs pin the profile experience) |
| **Source** | `src/experiences/voter/profile/profile-edit.tsx`, `src/components/profile/panels.tsx`, `src/lib/actions/profile.ts` |
| **Findings** | [R4](../findings.md#r4--the-editor-captures-fields-the-profile-never-renders), [R5](../findings.md#r5--save-errors-are-fieldless-raw-codes), [R17](../findings.md#r17--interests-still-cannot-be-set), [R20](../findings.md#r20--age-on-the-profile-is-an-undecided-product-question), [R22](../findings.md#r22--link-and-pinned-link-are-still-indistinguishable-in-the-editor), [R24](../findings.md#r24--the-editors-video-preview-still-paints-a-black-frame) |
| **Tests** | [`V3-profile-editor.spec.ts`](../tests/e2e/V3-profile-editor.spec.ts), [`social-handle.test.ts`](../tests/unit/social-handle.test.ts) |

## What it does today

Sections: identity (display/first/last name, city with autocomplete,
headline), bio, Connect (Instagram/TikTok/X/LinkedIn/Link/Pinned Link +
label), photo gallery (6 slots, drag-drop), intro video (upload or YouTube
URL). Media commits immediately and Save is disabled + relabelled while a
commit is in flight; text saves go through `saveOwnProfile` in one RPC.
Social handles are normalized server-side (`extractSocialHandle`) — pasted
URLs are accepted.

What is broken or undecided: errors render as raw codes with no field marked
(R5); LinkedIn, cover image, and occupation are captured but the redesigned
profile never renders them (R4); the video preview panel has no poster and
paints black (R24); interests have no editor (R17); the two link fields are
indistinguishable (R22); age is an unmade product decision (R20).

## Requirements

- **RQ-V3-1** Every field the editor offers appears somewhere on the rendered
  profile, or is removed (REQ-07 — the inverse direction: real data must not
  be silently dropped).
- **RQ-V3-2** Validation failures name the field and speak human (REQ-11).
- **RQ-V3-3** The editor's own previews match what the profile will render —
  same poster behavior, same crops.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V3-01` | Submitting an invalid value marks the offending input and shows human copy; no raw code (`invalid_input`, `profile_update_failed`, …) ever renders. | R5 | `T-AC-V3-01` (unit + e2e) |
| `AC-V3-02` | **Guard:** pasted profile URLs for all four networks normalize to bare handles; bare handles pass through; `@` strips; unsafe schemes reject. The guarded behavior ships today (`6b665a8`); the unit file proving it is contract-first and compiles only after the R5 fix extracts `extractSocialHandle` to a plain module. | — | `T-AC-V3-02` (unit, contract-first) |
| `AC-V3-03` | For each of LinkedIn, cover image, occupation: the field renders on the profile, or the field is gone from the editor — with the decision recorded. | R4 | `T-AC-V3-03` + Manual |
| `AC-V3-04` | No surface renders an unpostered `<video>`: the editor preview (and any other `panels.tsx` consumer) posters with the avatar or a captured frame. | R24 | `T-AC-V3-04` (fixture with an uploaded video) |
| `AC-V3-05` | The two link fields are labelled by what they produce, and the pinned-link label field says it is button text. | R22 | `T-AC-V3-05` (+ visual) |
| `AC-V3-06` | Interests are editable from this page (taxonomy picker), or the interests field and card are removed everywhere. | R17 | `T-AC-V3-06` (fixture with imported tags — either-arm) |
| `AC-V3-07` | A recorded decision on public age display, referencing the 18+ eligibility work. | R20 | Manual |
