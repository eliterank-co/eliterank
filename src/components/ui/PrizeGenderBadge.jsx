import { colors, spacing, typography, borderRadius } from '../../styles/theme';
import { formatPrizeGender } from '../../utils/formatters';

/**
 * Small "who's it for" tag for a gender-restricted prize (men-only / women-only).
 *
 * Styled as an outlined, uppercase, letter-spaced gold tag so it reads as a
 * distinct label rather than a clone of the filled "recipient" pill, and echoes
 * the uppercase gender headings used on the gender-split leaderboard. Renders
 * nothing for prizes open to everyone (recipient_gender 'all').
 */
export function PrizeGenderBadge({ prize, isMobile = false, style }) {
  const label = formatPrizeGender(prize);
  if (!label) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: isMobile ? '10px' : typography.fontSize.xs,
        fontWeight: typography.fontWeight.semibold,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: colors.gold.primary,
        background: 'transparent',
        border: `1px solid ${colors.border.focus}`,
        padding: `2px ${spacing.sm}`,
        borderRadius: borderRadius.pill,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </span>
  );
}

export default PrizeGenderBadge;
