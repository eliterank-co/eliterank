/**
 * GlobalFooter - Site-wide footer with legal links and copyright.
 *
 * Suppressed on competition routes (those render their own CompetitionFooter
 * with org branding), on profile pages (a person's profile is a focused,
 * shareable surface — the site chrome doesn't belong there), and on the
 * photo-booth route. Everywhere else it surfaces the four legal documents so
 * they're discoverable from any page.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Instagram } from 'lucide-react';
import { colors, spacing, typography, borderRadius } from '../../styles/theme';
import { isReservedPath, isIdRoute, isCompetitionSlug } from '../../utils/slugs';

const SUPPRESSED_EXACT = new Set(['/photobooth']);

function isCompetitionPath(pathname) {
  if (pathname.startsWith('/c/')) return true;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2) return false;
  if (isReservedPath(parts[0])) return false;
  return isIdRoute(parts[1]) || isCompetitionSlug(parts[1]);
}

// A person's profile — own (`/profile`) or public (`/profile/:profileId`).
function isProfilePath(pathname) {
  return pathname === '/profile' || pathname.startsWith('/profile/');
}

function shouldSuppress(pathname) {
  if (SUPPRESSED_EXACT.has(pathname)) return true;
  if (pathname.startsWith('/admin')) return true;
  if (isProfilePath(pathname)) return true;
  return isCompetitionPath(pathname);
}

const styles = {
  footer: {
    background: colors.background.secondary,
    borderTop: `1px solid ${colors.border.primary}`,
    padding: `${spacing[8]} ${spacing[4]}`,
    color: colors.text.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  inner: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing[5],
  },
  topRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing[4],
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: colors.gold.primary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.lg,
    letterSpacing: '0.02em',
  },
  socialRow: {
    display: 'flex',
    gap: spacing[3],
    alignItems: 'center',
  },
  socialLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: borderRadius.pill,
    background: 'transparent',
    border: `1px solid ${colors.border.primary}`,
    color: colors.text.secondary,
    transition: 'color 150ms ease, border-color 150ms ease',
    textDecoration: 'none',
  },
  divider: {
    height: '1px',
    background: colors.border.secondary,
    width: '100%',
  },
  bottomRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing[4],
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: typography.fontSize.sm,
  },
  legalRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: `${spacing[2]} ${spacing[4]}`,
    alignItems: 'center',
  },
  legalLink: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '40px',
    color: colors.text.secondary,
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    padding: `${spacing[1]} ${spacing[2]}`,
    fontSize: typography.fontSize.sm,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  copyright: {
    color: colors.text.tertiary,
    fontSize: typography.fontSize.xs,
  },
};

const LEGAL_LINKS = [
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Terms of Use', path: '/terms' },
  { label: 'Cookie Policy', path: '/cookies' },
  { label: 'Contest Terms', path: '/contest-terms' },
];

export default function GlobalFooter() {
  const navigate = useNavigate();
  const location = useLocation();

  // On mobile the explore experience renders a fixed bottom nav that overlays
  // the page; reserve clearance so the footer (and its legal links) sit above
  // it instead of being hidden behind it. Plus the iOS home-indicator inset.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const handleLegal = useCallback((path) => {
    navigate(path);
  }, [navigate]);

  if (shouldSuppress(location.pathname)) return null;

  const year = new Date().getFullYear();

  const footerStyle = {
    ...styles.footer,
    padding: `${spacing[8]} ${spacing[4]} ${
      isMobile ? 'calc(96px + env(safe-area-inset-bottom, 0px))' : spacing[8]
    }`,
  };

  return (
    <footer style={footerStyle}>
      <div style={styles.inner}>
        <div style={styles.topRow}>
          <div style={styles.brand}>EliteRank</div>
          <div style={styles.socialRow}>
            <a
              href="https://instagram.com/mosteligiblechi"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="EliteRank on Instagram"
              style={styles.socialLink}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = colors.gold.primary;
                e.currentTarget.style.borderColor = colors.gold.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = colors.text.secondary;
                e.currentTarget.style.borderColor = colors.border.primary;
              }}
            >
              <Instagram size={16} />
            </a>
          </div>
        </div>

        <div style={styles.divider} />

        <div
          style={{
            ...styles.bottomRow,
            // On mobile, stack with the legal links above the copyright and
            // centered so they're prominent and easy to tap.
            ...(isMobile
              ? { flexDirection: 'column-reverse', alignItems: 'center', textAlign: 'center', gap: spacing[2] }
              : {}),
          }}
        >
          <div style={styles.copyright}>
            © {year} Most Eligible LLC. All rights reserved.
          </div>
          <nav
            style={{ ...styles.legalRow, ...(isMobile ? { justifyContent: 'center' } : {}) }}
            aria-label="Legal"
          >
            {LEGAL_LINKS.map(link => (
              <button
                key={link.path}
                type="button"
                onClick={() => handleLegal(link.path)}
                style={styles.legalLink}
                onMouseEnter={(e) => { e.currentTarget.style.color = colors.gold.primary; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.secondary; }}
              >
                {link.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
