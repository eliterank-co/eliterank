# Image assets

No screenshots are included — member views require authentication and this
audit ran from source. This file is the capture spec; once captured, drop
files here and the view-doc links resolve.

The prior packet's structural diagrams (the old `assets/diagrams/` SVGs and
their generator) described the pre-#158 layout and are **not** carried
forward — they were removed with this revision. Regenerate against the new
component tree if diagrams are wanted.

## Naming

Two grammars:

- **Per-view captures:** `IMG-<view>-<letter>[-<state>].png` — e.g.
  `IMG-V2-a.png`, `IMG-V8-b-winner-tab.png`. Letter = order of appearance in
  the view doc.
- **Light-theme walkthrough captures:** `IMG-V10-<view>-light.png` — e.g.
  `IMG-V10-V2-light.png`, one per view V1–V9 (AC-V10-07).

## What to capture

| Asset | View | Shot | Experience |
| --- | --- | --- | --- |
| `IMG-V1-a` | V1 | Stat tile row, close crop — evidence for R6/R7/R8 | dashboard |
| `IMG-V2-a` | V2 | Full 748px page, owner, with a live round | profile |
| `IMG-V2-b` | V2 | Owner live-round module: standing + bonus checklist (R2 evidence: 0/N) | profile |
| `IMG-V3-a` | V3 | Connect section — R5 raw error visible after a bad save, R22 link fields | profile |
| `IMG-V3-b` | V3 | Full editor page (LinkedIn + cover fields — R4 evidence) | profile |
| `IMG-V3-c` | V3 | Video preview black frame (R24) | profile |
| `IMG-V4-a` | V4 | Contestant tab, eliminated fixture — "Eliminated" status (R18) | dashboard |
| `IMG-V5-a` | V5 | History page for the host fixture — hosting absent (R12) | dashboard |
| `IMG-V6-a` | V6 | Watch list beside dashboard tile — disagreement (R8) | dashboard |
| `IMG-V7-a` | V7 | Settings page — no account links (R19) | dashboard |
| `IMG-V8-a` | V8 | Public profile, visitor — fan card with no toggle (R1) | profile |
| `IMG-V8-b` | V8 | Story-card modal, WINNER tab selected on a crownless fixture (R9) | profile |
| `IMG-V9-a` | V9 | Contestant page vote CTA (guard baseline) | either |
| `IMG-V10-a` | V10 | Same page in both themes, side by side (after palette lands) | either |
| `IMG-V10-b` | V10 | Status states (success/error/warning) in light | either |
| `IMG-V10-V1-light` … `IMG-V10-V9-light` | V10 | One light capture per view for the walkthrough | both |

Capture at 1440×900 desktop and 375-wide mobile for V2/V8; desktop only
elsewhere. Fixture accounts per [tests/README.md](../tests/README.md#fixtures) —
never real members.
