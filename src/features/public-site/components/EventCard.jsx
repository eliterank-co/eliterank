import React from 'react';
import { Edit2, Crown } from 'lucide-react';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import { formatEventTime } from '../../../utils/formatters';

/**
 * EventCard — shared card used by the Events page and the Upcoming Event
 * sidebar widget. Single source of truth so both surfaces stay visually
 * identical.
 *
 * Accepts either the camelCased shape used in EventsTab (imageUrl,
 * ticketUrl) or the raw snake_cased DB row shape (image_url, ticket_url).
 */
export default function EventCard({ event, isPast = false, canEdit = false, onEdit }) {
  const imageUrl = event.imageUrl || event.image_url;
  const ticketUrl = event.ticketUrl || event.ticket_url;
  const location = event.location || event.venue;

  const CardWrapper = ticketUrl && !isPast ? 'a' : 'div';
  const wrapperProps = ticketUrl && !isPast
    ? { href: ticketUrl, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  const formatDateBadge = (dateStr, timeStr) => {
    if (!dateStr) return 'Date TBD';
    const eventDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = eventDate.getTime() === today.getTime();
    const datePart = isToday
      ? 'TODAY'
      : eventDate
          .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          .toUpperCase();
    if (timeStr) {
      return `${datePart}  •  ${formatEventTime(timeStr)}`;
    }
    return datePart;
  };

  return (
    <CardWrapper
      {...wrapperProps}
      style={{
        display: 'block',
        opacity: isPast ? 0.6 : 1,
        position: 'relative',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'transform 0.2s ease, opacity 0.2s ease',
        cursor: ticketUrl && !isPast ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => {
        if (!isPast) e.currentTarget.style.transform = 'scale(1.02)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {/* Cover Image */}
      <div
        style={{
          width: '100%',
          aspectRatio: '3 / 2',
          borderRadius: '16px',
          overflow: 'hidden',
          position: 'relative',
          background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(139,92,246,0.1) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl ? (
          /* Real <img> instead of a CSS background so the browser decodes it once
             and never re-fetches on repaint (prevents cover-image flicker). */
          <img
            src={imageUrl}
            alt={event.name || ''}
            loading="lazy"
            decoding="async"
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <Crown size={56} style={{ color: 'rgba(212,175,55,0.35)' }} />
        )}

        {canEdit && onEdit && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(event);
            }}
            style={{
              position: 'absolute',
              top: spacing.md,
              right: spacing.md,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              padding: `${spacing.xs} ${spacing.sm}`,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: borderRadius.md,
              color: colors.text.secondary,
              cursor: 'pointer',
              fontSize: typography.fontSize.xs,
            }}
          >
            <Edit2 size={12} />
            Edit
          </button>
        )}

        {/* Bottom gradient fade */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '50%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Date/time badge */}
        <div
          style={{
            position: 'absolute',
            bottom: spacing.md,
            left: spacing.md,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(12px)',
            borderRadius: '20px',
            padding: `5px ${spacing.md}`,
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            letterSpacing: '0.3px',
          }}
        >
          {formatDateBadge(event.date, event.time)}
        </div>

        {isPast && (
          <div
            style={{
              position: 'absolute',
              top: spacing.md,
              left: spacing.md,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              borderRadius: '20px',
              padding: `4px ${spacing.sm}`,
              fontSize: typography.fontSize.xs,
              color: colors.text.tertiary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Past Event
          </div>
        )}
      </div>

      {/* Event Info */}
      <div style={{ padding: `${spacing.sm} 2px 0` }}>
        <h3
          style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            marginBottom: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.name}
        </h3>

        {location && (
          <p
            style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.tertiary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {location}
          </p>
        )}
      </div>
    </CardWrapper>
  );
}
