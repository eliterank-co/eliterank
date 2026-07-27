import React from 'react';
import { Calendar, ExternalLink, Crown } from 'lucide-react';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import { formatEventTime } from '../../../utils/formatters';

/**
 * Compact card showing the next upcoming event for a competition.
 * Displays "No upcoming events" if none are scheduled.
 */
export default function UpcomingEventCard({ events = [], onViewAllEvents }) {
  // Filter to only public/visible events that are upcoming
  // Use string comparison to avoid timezone issues
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time
  const upcomingEvents = events
    .filter(e => {
      if (e.publicVisible === false) return false;
      if (e.status === 'completed') return false;
      if (!e.date) return true; // Include events without dates as upcoming
      return e.date >= todayStr;
    })
    .sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });

  const nextEvent = upcomingEvents[0] || null;

  const formatDateBadge = (dateStr, timeStr) => {
    if (!dateStr) return 'Date TBD';
    const eventDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = eventDate.getTime() === today.getTime();
    const datePart = isToday
      ? 'TODAY'
      : eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
    if (timeStr) {
      return `${datePart}  •  ${formatEventTime(timeStr)}`;
    }
    return datePart;
  };

  return (
    <div
      style={{
        background: colors.background.card,
        borderRadius: borderRadius.xl,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: `${spacing.md} ${spacing.lg}`,
          borderBottom: `1px solid ${colors.border.secondary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <Calendar size={16} style={{ color: colors.gold.primary }} />
          <span
            style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
            }}
          >
            Upcoming Event
          </span>
        </div>
        {onViewAllEvents && (
          <button
            onClick={onViewAllEvents}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: colors.gold.primary,
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.medium,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
            }}
          >
            View All
            <ExternalLink size={12} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: spacing.md }}>
        {nextEvent ? (
          <a
            href={nextEvent.ticketUrl || undefined}
            target={nextEvent.ticketUrl ? '_blank' : undefined}
            rel={nextEvent.ticketUrl ? 'noopener noreferrer' : undefined}
            style={{
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              cursor: nextEvent.ticketUrl ? 'pointer' : 'default',
            }}
          >
            {/* Event Image with date badge */}
            <div style={{
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: '14px',
              overflow: 'hidden',
              position: 'relative',
              background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(139,92,246,0.1) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {nextEvent.imageUrl ? (
                /* Real <img> instead of a CSS background so the browser decodes it once
                   and never re-fetches on repaint (prevents cover-image flicker). */
                <img
                  src={nextEvent.imageUrl}
                  alt={nextEvent.name || ''}
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
                <Crown size={28} style={{ color: 'rgba(212,175,55,0.4)' }} />
              )}

              {/* Bottom gradient */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)',
                pointerEvents: 'none',
              }} />

              {/* Date badge */}
              <div style={{
                position: 'absolute',
                bottom: spacing.sm,
                left: spacing.sm,
                background: 'rgba(0,0,0,0.75)',
                backdropFilter: 'blur(12px)',
                borderRadius: '20px',
                padding: `3px ${spacing.sm}`,
                fontSize: '0.6875rem',
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                letterSpacing: '0.3px',
              }}>
                {formatDateBadge(nextEvent.date, nextEvent.time)}
              </div>
            </div>

            {/* Event info below image */}
            <div style={{ padding: `${spacing.sm} 2px 0` }}>
              <h4
                style={{
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text.primary,
                  marginBottom: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {nextEvent.name}
              </h4>

              {(nextEvent.location || nextEvent.venue) && (
                <p style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.text.tertiary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {nextEvent.location || nextEvent.venue}
                </p>
              )}
            </div>
          </a>
        ) : (
          /* No Upcoming Events */
          <div style={{ textAlign: 'center', padding: spacing.lg }}>
            <Calendar
              size={32}
              style={{ color: colors.text.muted, marginBottom: spacing.sm }}
            />
            <p
              style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.muted,
              }}
            >
              No upcoming events
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
