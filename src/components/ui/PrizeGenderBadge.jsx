import { colors, spacing, typography, borderRadius } from '../../styles/theme';
import { formatPrizeGender } from '../../utils/formatters';

/**
 * Small "who wins it" tag for a gender-designated prize ("Male Winner" /
 * "Female Winner" / "Both Winners", or "Men" / "Women" for contestant rewards).
 *
 * Styled as a neutral, outlined, uppercase, letter-spaced tag — deliberately NOT
 * gold, so it reads as quiet metadata sitting below the (gold) sponsor name and
 * the prize title rather than competing with them. Renders nothing when there's
 * no gender designation to show.
 */
export function PrizeGenderBadge({ prize, isMobile = false, splitByGender = false, style }) {
  const label = formatPrizeGender(prize, { splitByGender });
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
        color: colors.text.tertiary,
        background: 'transparent',
        border: `1px solid ${colors.border.primary}`,
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
