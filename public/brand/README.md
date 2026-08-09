# EliteRank Brand Assets

Generated from the official gold-crown mark (`src/components/ui/icons/EliteRankCrown.jsx`)
and theme tokens (`src/styles/theme.js`). All PNGs have transparent backgrounds unless noted.

Gold gradient: `#f5d485 → #d4af37 → #a8893a` · Ink: `#0a0a0c`

## Logos (transparent PNG)
| File | Use |
|------|-----|
| `eliterank-logo-dark.png` / `@2x` | Horizontal lockup for **dark** backgrounds (white "Elite" + gold "Rank") |
| `eliterank-logo-light.png` / `@2x` | Horizontal lockup for **light** backgrounds (ink "Elite" + gold "Rank") |
| `eliterank-logo-stacked-dark.png` | Crown-over-wordmark, dark bg |
| `eliterank-logo-stacked-light.png` | Crown-over-wordmark, light bg |
| `eliterank-logo-{dark,light}.svg` | Vector source (scales infinitely) |

## Favicon / app icons
| File | Size | Use |
|------|------|-----|
| `favicon.svg` | vector | Modern browsers (`<link rel="icon" type="image/svg+xml">`) |
| `favicon.ico` | 16/32/48 | Legacy fallback |
| `favicon-16/32/48/64/192/512.png` | square, transparent | PNG favicons / PWA manifest icons |
| `apple-touch-icon.png` | 180 | iOS home screen (crown on dark rounded tile) |
| `icon-maskable-512.png` | 512 | Android maskable PWA icon |

## Social share images
| File | Size | Use |
|------|------|-----|
| `og-image.png` | 1200×630 | Open Graph — Facebook, LinkedIn, iMessage |
| `twitter-card.png` | 1200×600 | X / Twitter `summary_large_image` |
| `social-square.png` | 1200×1200 | Instagram / 1:1 general share |

To wire the favicon + OG image into the live site, point `index.html`'s
`<link rel="icon">` and `og:image` / `twitter:image` tags at these files.
