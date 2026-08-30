#!/usr/bin/env python3
"""Generate structural wireframes, one per view.

Each block is a real region of the rendered page, derived from the component
tree in eliterank-app. Findings are pinned to the block they occur on, so a
diagram doubles as a map from this package's finding IDs to screen regions.

Run:  python3 make-diagrams.py     (writes ./diagrams/*.svg)
"""
import os, html

W = 880
PAD = 24
BG, CARD, LINE, INK, MUTED, GOLD, RED = (
    "#FFFFFF", "#F5F3EE", "#D9D4C7", "#1A1814", "#6E675C", "#8A6D1F", "#B33240")

VIEWS = {
"V1-me-dashboard": ("V1 — Member dashboard", "/me  ·  social_profile OFF", [
    ("Identity strip", "avatar 44px · display name · email · “Gold member” badge", ["D1", "S3"]),
    ("Tab bar", "Overview · My votes · Watching · [Contestant] · Profile · Settings", []),
    ("Page header", "“Welcome back.” + subtitle", []),
    ("Stat tiles × 4", "Votes cast · Markets watched · Orgs owned / Active wins · Member tier", ["D1", "D2", "D3"]),
    ("Host hero  /  org link", "become-a-host invitation, or link to the host dashboard", []),
    ("Quick actions × 3", "Browse the floor · Tonight's main card · Your watch list", []),
    ("Live now", "up to 3 competitions in the voting phase", []),
    ("Recent activity", "5 most recent votes, or an empty state", []),
]),
"V2-me-social-profile": ("V2 — Social profile (v3)", "/me  ·  social_profile ON", [
    ("Profile hero", "cover · avatar · name · headline · bio · city · occupation · socials · pinned link", ["G2", "S3"]),
    ("Hero counts", "Fans · Crowns · Competitions · Watching (owner only)", []),
    ("Hero actions", "Share sheet · View as visitor · Edit", []),
    ("Featured: photos + intro", "gallery grid + intro video, with item count", []),
    ("Timeline", "entered · advanced · crowned · out · competing · voted · pick won · watching · reward", ["G3"]),
    ("Sidebar: Happening now", "up to 4 open competitions, local ones first", []),
    ("Sidebar: Interests", "renders member interests — no editor exists", ["G1"]),
    ("Sidebar: Fans", "up to 24 fans + total", []),
]),
"V3-profile-editor": ("V3 — Profile editor", "/me/profile  ·  both flag paths", [
    ("Edit header", "back chevron · “Edit Profile”", []),
    ("Cover + avatar", "drop zones · 10 MB max · commits immediately", ["P2"]),
    ("Personal Information", "display name · first · last · city · headline (100)", ["G6"]),
    ("Bio", "500 characters, counter shown", []),
    ("Connect", "Instagram · TikTok · X · LinkedIn · Link · Pinned Link · Pinned Link Label", ["P1", "S1"]),
    ("Photo Gallery", "up to 6 photos, drag-drop, remove per item", []),
    ("Intro Video", "upload (60s, 150 MB) or YouTube embed", ["P2"]),
    ("Save Changes", "atomic save of identity fields; blocked while media is in flight", ["P1", "P2"]),
]),
"V4-contestant": ("V4 — Contestant self-service", "/me/contestant  ·  claimed contestants only", [
    ("Page header", "display name · public path · multi-competition note", []),
    ("Saved / error banner", "confirms broadcast across all competitions", []),
    ("Live stats", "Lifetime votes · Placement #n · Status: Active | Eliminated", ["G4"]),
    ("Multi-competition rows", "one row per claim: votes · rank · status · external link", ["G4"]),
    ("Editor: identity", "display name · bio (400)", []),
    ("Editor: photos", "avatar · cover", []),
    ("Editor: socials", "Instagram · TikTok · X · Website — accepts “@handle or full URL”", ["P1"]),
]),
"V5-vote-records": ("V5 — Votes, transactions, history", "/me/votes · /me/transactions · /me/history", [
    ("/me/votes", "every contestant voted for, in order, with onward links", ["X3"]),
    ("→ link to full history", "history has no tab; this link is its entry point", []),
    ("/me/transactions", "same rows filtered to amountPaidCents > 0", ["X3"]),
    ("Transaction summary", "paid record count · total paid (USD)", []),
    ("/me/history", "competitions grouped by year, client-side filter", ["P3"]),
    ("History sources", "votes + notify_me_subscriptions — no org membership", ["P3"]),
    ("Votes received", "does not exist anywhere in the codebase", ["X3"]),
]),
"V6-watching": ("V6 — Watch list", "/me/watching", [
    ("Page header", "“Your watch list.” + phase-change notice copy", []),
    ("Saved markets", "rows from listMyWatching, keyed on lowercased email", ["D3"]),
    ("Phase tint", "draft · nominations · voting · finals · ended · archived", []),
    ("Empty state", "bookmark icon + prompt to discover", []),
]),
"V7-settings": ("V7 — Settings and account", "/me/settings  (+ /account crossover)", [
    ("Page header", "“Account.” — “Manage your profile, password, and notifications.”", ["G5"]),
    ("Profile panel", "links: /me/profile · /me/history · /me/transactions — no /account", ["G5"]),
    ("Notifications panel", "weekly digest toggle; push + SMS stubbed", ["G5"]),
    ("Sign out panel", "end this session", []),
    ("Danger zone", "account deletion — no host / contestant / winner preconditions", ["X1"]),
]),
"V8-public-profile": ("V8 — Public member profile", "/p/[voterId]  ·  404s while flag is OFF", [
    ("Profile hero", "same component as V2, rendered for a visitor", ["S4"]),
    ("Hero counts", "Fans · Crowns · Competitions — Watching deliberately absent", []),
    ("Owner preview banner", "does not exist — no way back to /me", ["P4"]),
    ("Fan button", "toggleFan · account required · same rule as voting", ["X2"]),
    ("Share sheet", "native share · copy link · download card", ["S5"]),
    ("Story card", "1080×1920 PNG: avatar · name · crown count", ["S2"]),
    ("Vote panel", "loadLiveEntries → profile-vote-panel", []),
    ("Timeline + fans", "shared components; owner-only kinds filtered out", []),
]),
"V9-contestant-public": ("V9 — Contestant public profile", "/o/[org]/c/[competition]/[contestant]", [
    ("Contestant hero", "name · avatar · cover · bio · socials", []),
    ("Standing", "votes · placement · round status", []),
    ("Vote affordance", "presence during an open round needs confirming", ["S6"]),
    ("Rewards section", "sponsor rewards for this contestant", []),
]),
}

def esc(s): return html.escape(s, quote=True)

def render(key, title, subtitle, blocks):
    rows, y = [], 96
    for name, desc, finds in blocks:
        h = 54
        rows.append((y, h, name, desc, finds)); y += h + 10
    height = y + 34

    p = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{height}" '
         f'viewBox="0 0 {W} {height}" font-family="ui-sans-serif,system-ui,Segoe UI,Helvetica,Arial,sans-serif">',
         f'<rect width="{W}" height="{height}" fill="{BG}"/>',
         f'<text x="{PAD}" y="34" font-size="17" font-weight="700" fill="{INK}">{esc(title)}</text>',
         f'<text x="{PAD}" y="56" font-size="12" fill="{MUTED}" font-family="ui-monospace,SFMono-Regular,Consolas,monospace">{esc(subtitle)}</text>',
         f'<line x1="{PAD}" y1="72" x2="{W-PAD}" y2="72" stroke="{LINE}" stroke-width="1"/>']

    for (y0, h, name, desc, finds) in rows:
        p.append(f'<rect x="{PAD}" y="{y0}" width="{W-2*PAD}" height="{h}" rx="4" fill="{CARD}" stroke="{LINE}"/>')
        p.append(f'<text x="{PAD+14}" y="{y0+22}" font-size="13" font-weight="600" fill="{INK}">{esc(name)}</text>')
        p.append(f'<text x="{PAD+14}" y="{y0+40}" font-size="11" fill="{MUTED}">{esc(desc)}</text>')
        x = W - PAD - 14
        for f in reversed(finds):
            w = 26 + 6 * (len(f) - 2)
            x -= w + 6
            p.append(f'<rect x="{x}" y="{y0+16}" width="{w}" height="20" rx="3" fill="{RED}" opacity="0.10"/>')
            p.append(f'<text x="{x+w/2}" y="{y0+30}" font-size="11" font-weight="700" fill="{RED}" '
                     f'text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Consolas,monospace">{esc(f)}</text>')

    p.append(f'<text x="{PAD}" y="{height-12}" font-size="10" fill="{MUTED}" '
             f'font-family="ui-monospace,SFMono-Regular,Consolas,monospace">'
             f'Structural wireframe from source — not a visual mock. Tags mark findings; see findings.md</text>')
    p.append('</svg>')
    return "\n".join(p)

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "diagrams")
os.makedirs(out, exist_ok=True)
for key, (title, sub, blocks) in VIEWS.items():
    path = os.path.join(out, key + ".svg")
    with open(path, "w") as fh:
        fh.write(render(key, title, sub, blocks))
    print("wrote", os.path.basename(path))
