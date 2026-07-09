import React, { useState } from 'react';
import { Plus, FileText, Pin, Edit, Trash2 } from 'lucide-react';
import { Button, Badge, Avatar, Panel } from '../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import { useResponsive } from '../../../hooks/useResponsive';
import { formatRelativeTime } from '../../../utils/formatters';

/**
 * AnnouncementsManager — create, edit, pin, and delete competition
 * announcements. An engagement tool (keeping the audience updated), so it
 * lives on the Engagement tab.
 */
export default function AnnouncementsManager({
  announcements = [],
  competition,
  host,
  isSuperAdmin,
  onAddAnnouncement,
  onUpdateAnnouncement,
  onDeleteAnnouncement,
  onTogglePin,
}) {
  const { isMobile } = useResponsive();
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '' });

  // Super-admin posts are authored as the competition's organization/brand
  // (competitions run under many different brands), not the platform.
  const authorName = isSuperAdmin
    ? (competition?.organizationName || 'EliteRank')
    : (host?.name || 'Host');
  const authorAvatar = isSuperAdmin ? null : host?.avatar;

  const handleSubmit = async () => {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) return;
    if (editingAnnouncement) {
      await onUpdateAnnouncement(editingAnnouncement.id, announcementForm);
      setEditingAnnouncement(null);
    } else {
      await onAddAnnouncement(announcementForm);
    }
    setAnnouncementForm({ title: '', content: '' });
    setShowAnnouncementForm(false);
  };

  const resetForm = () => {
    setShowAnnouncementForm(false);
    setEditingAnnouncement(null);
    setAnnouncementForm({ title: '', content: '' });
  };

  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });

  return (
    <>
      {/* Create Announcement Section */}
      <Panel title="Create Announcement" icon={Plus} collapsible defaultCollapsed>
        <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
          {showAnnouncementForm || editingAnnouncement ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <input
                type="text"
                placeholder="Announcement title..."
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm(prev => ({ ...prev, title: e.target.value }))}
                style={{
                  background: colors.background.secondary,
                  border: `1px solid ${colors.border.light}`,
                  borderRadius: borderRadius.lg,
                  padding: spacing.md,
                  color: '#fff',
                  fontSize: '16px',
                  minHeight: '44px',
                }}
              />
              <textarea
                placeholder="Write your announcement..."
                value={announcementForm.content}
                onChange={(e) => setAnnouncementForm(prev => ({ ...prev, content: e.target.value }))}
                rows={4}
                style={{
                  background: colors.background.secondary,
                  border: `1px solid ${colors.border.light}`,
                  borderRadius: borderRadius.lg,
                  padding: spacing.md,
                  color: '#fff',
                  fontSize: '16px',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: spacing.md, justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={resetForm}>Cancel</Button>
                <Button onClick={handleSubmit}>{editingAnnouncement ? 'Update' : 'Post'}</Button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.lg,
                padding: isMobile ? spacing.md : spacing.lg,
                background: 'rgba(255,255,255,0.02)',
                borderRadius: borderRadius.xl,
                border: `1px dashed ${colors.border.gold}`,
                cursor: 'pointer',
                flexWrap: isMobile ? 'wrap' : 'nowrap',
              }}
              onClick={() => setShowAnnouncementForm(true)}
            >
              <Avatar name={authorName} src={authorAvatar} size={isMobile ? 36 : 44} />
              <div style={{ flex: 1, minWidth: isMobile ? '100%' : 'auto' }}>
                <p style={{ color: colors.text.secondary, fontSize: isMobile ? typography.fontSize.sm : typography.fontSize.md }}>
                  Share an update with your audience...
                </p>
              </div>
              <Button icon={Plus} size={isMobile ? 'sm' : 'md'}>New Post</Button>
            </div>
          )}
        </div>
      </Panel>

      {/* Announcements Feed */}
      <Panel
        title="Announcements Feed"
        icon={FileText}
        action={<span style={{ color: colors.text.secondary }}>{announcements.length} posts</span>}
        collapsible
      >
        <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
          {sortedAnnouncements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.text.secondary }}>
              <FileText size={48} style={{ marginBottom: spacing.md, opacity: 0.5 }} />
              <p>No announcements yet. Create your first post above.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {sortedAnnouncements.map((post) => (
                <div
                  key={post.id}
                  style={{
                    background: post.pinned ? 'rgba(212,175,55,0.05)' : 'rgba(255,255,255,0.02)',
                    border: post.pinned ? '1px solid rgba(212,175,55,0.2)' : `1px solid ${colors.border.lighter}`,
                    borderRadius: borderRadius.xl,
                    padding: isMobile ? spacing.md : spacing.lg,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: spacing.md,
                    marginBottom: spacing.md,
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                  }}>
                    <Avatar name={authorName} src={authorAvatar} size={isMobile ? 36 : 44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.sm,
                        marginBottom: spacing.xs,
                        flexWrap: 'wrap',
                      }}>
                        <span style={{ fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.sm }}>
                          {authorName}
                        </span>
                        {post.pinned && <Badge variant="gold" size="sm">Pinned</Badge>}
                        <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>
                          · {formatRelativeTime(post.publishedAt)}
                        </span>
                      </div>
                      <h4 style={{
                        fontSize: isMobile ? typography.fontSize.base : typography.fontSize.lg,
                        fontWeight: typography.fontWeight.semibold,
                        marginBottom: spacing.sm,
                      }}>
                        {post.title}
                      </h4>
                      <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
                        {post.content}
                      </p>
                    </div>
                    <div style={{
                      display: 'flex',
                      gap: spacing.xs,
                      ...(isMobile ? { width: '100%', justifyContent: 'flex-end', marginTop: spacing.sm } : {}),
                    }}>
                      <button
                        onClick={() => onTogglePin(post.id, post.pinned)}
                        style={{
                          padding: spacing.sm,
                          background: post.pinned ? 'rgba(212,175,55,0.2)' : 'transparent',
                          border: `1px solid ${post.pinned ? colors.gold.primary : colors.border.light}`,
                          borderRadius: borderRadius.md,
                          color: post.pinned ? colors.gold.primary : colors.text.secondary,
                          cursor: 'pointer',
                          minWidth: '36px',
                          minHeight: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={post.pinned ? 'Unpin' : 'Pin'}
                      >
                        <Pin size={14} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingAnnouncement(post);
                          setAnnouncementForm({ title: post.title, content: post.content });
                          setShowAnnouncementForm(true);
                        }}
                        style={{
                          padding: spacing.sm,
                          background: 'transparent',
                          border: `1px solid ${colors.border.light}`,
                          borderRadius: borderRadius.md,
                          color: colors.text.secondary,
                          cursor: 'pointer',
                          minWidth: '36px',
                          minHeight: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => onDeleteAnnouncement(post.id)}
                        style={{
                          padding: spacing.sm,
                          background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: borderRadius.md,
                          color: '#ef4444',
                          cursor: 'pointer',
                          minWidth: '36px',
                          minHeight: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
