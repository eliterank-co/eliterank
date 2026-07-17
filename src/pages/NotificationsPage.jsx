/**
 * NotificationsPage - Full screen view of all notifications
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Trash2 } from 'lucide-react';
import NotificationsSkeleton from '../components/skeletons/NotificationsSkeleton';
import EmptyState from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import { useNotifications, getNotificationMeta } from '../contexts/NotificationContext';
import { PageHeader } from '../components/ui';
import { colors, spacing, borderRadius, typography, transitions } from '../styles/theme';
import { useResponsive } from '../hooks/useResponsive';
import { formatRelativeTime } from '../utils/formatters';
import { renderTextWithLinks } from '../utils/linkify';

function NotificationRow({ notification, onRead, onNavigate, onDelete }) {
  const meta = getNotificationMeta(notification.type);
  const isUnread = !notification.read_at;

  const handleClick = () => {
    if (isUnread) onRead(notification.id);
    if (notification.action_url) onNavigate(notification.action_url);
  };

  // Row is a div (not a <button>) so the body can contain real <a> links —
  // interactive elements can't be nested inside a <button>.
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.md,
        width: '100%',
        padding: spacing.lg,
        background: isUnread ? 'rgba(212, 175, 55, 0.05)' : 'transparent',
        border: 'none',
        borderBottom: `1px solid ${colors.border.lighter}`,
        cursor: notification.action_url ? 'pointer' : 'default',
        textAlign: 'left',
        transition: `background ${transitions.fast}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = colors.background.cardHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isUnread ? 'rgba(212, 175, 55, 0.05)' : 'transparent'; }}
    >
      {/* Icon */}
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: borderRadius.full,
        background: colors.background.elevated,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        flexShrink: 0,
      }}>
        {meta.emoji}
      </div>

      {/* Content - no truncation */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: typography.fontSize.md,
          fontWeight: isUnread ? typography.fontWeight.semibold : typography.fontWeight.normal,
          color: colors.text.primary,
          lineHeight: 1.4,
        }}>
          {notification.title}
        </div>
        {notification.body && (
          <div style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            lineHeight: 1.5,
            marginTop: '4px',
            whiteSpace: 'pre-wrap',
          }}>
            {renderTextWithLinks(notification.body)}
          </div>
        )}
        <div style={{
          fontSize: typography.fontSize.xs,
          color: colors.text.tertiary,
          marginTop: '6px',
        }}>
          {formatRelativeTime(notification.created_at)}
        </div>
      </div>

      {/* Unread indicator + delete */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing[2], flexShrink: 0 }}>
        {isUnread && (
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: borderRadius.full,
            background: colors.gold.primary,
          }} />
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: spacing.xs,
              borderRadius: borderRadius.sm,
              color: colors.text.muted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Delete notification"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { isMobile } = useResponsive();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification, fetchNotifications } = useNotifications();

  const handleNavigate = (url) => {
    if (url.startsWith('http')) {
      window.location.href = url;
    } else {
      navigate(url);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary }}>
      <PageHeader title="Notifications" />

      <div style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: isMobile ? 0 : `0 ${spacing.lg}`,
      }}>
        {/* Actions bar */}
        {notifications.length > 0 && unreadCount > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: `${spacing.md} ${spacing.lg}`,
            borderBottom: `1px solid ${colors.border.lighter}`,
          }}>
            <button
              onClick={markAllAsRead}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                fontSize: typography.fontSize.sm,
                color: colors.gold.primary,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: `${spacing.xs} ${spacing.sm}`,
                borderRadius: borderRadius.sm,
              }}
            >
              <Check size={14} />
              Mark all as read ({unreadCount})
            </button>
          </div>
        )}

        {/* Notification list */}
        {loading && notifications.length === 0 ? (
          <NotificationsSkeleton />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={32} />}
            title="No notifications yet"
            description="You'll see updates about votes, rankings, and events here"
            ctaLabel="Browse Competitions"
            onCta={() => navigate('/')}
          />
        ) : (
          <div style={{
            background: colors.background.secondary,
            borderRadius: isMobile ? 0 : borderRadius.lg,
            overflow: 'hidden',
            marginBottom: spacing.xxl,
          }}>
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onRead={markAsRead}
                onNavigate={handleNavigate}
                onDelete={deleteNotification}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
