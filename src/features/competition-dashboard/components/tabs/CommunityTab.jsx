import React, { useState } from 'react';
import { Plus, FileText, Pin, Edit, Trash2 } from 'lucide-react';
import { Button, Badge, Avatar, Panel } from '../../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../../styles/theme';
import { formatRelativeTime } from '../../../../utils/formatters';

export default function CommunityTab({
  announcements,
  competition,
  host,
  isSuperAdmin,
  onAddAnnouncement,
  onUpdateAnnouncement,
  onDeleteAnnouncement,
  onTogglePin,
}) {
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '' });

  const authorName = isSuperAdmin
    ? (competition?.organization?.name || 'EliteRank')
    : (host?.name || 'Host');
  const authorAvatar = isSuperAdmin ? null : host?.avatar;

  const handleCreateAnnouncement = async () => {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) return;
    await onAddAnnouncement(announcementForm);
    setAnnouncementForm({ title: '', content: '' });
    setShowAnnouncementForm(false);
  };

  const handleUpdateAnnouncement = async () => {
    if (!editingAnnouncement || !announcementForm.title.trim()) return;
    await onUpdateAnnouncement(editingAnnouncement.id, announcementForm);
    setEditingAnnouncement(null);
    setAnnouncementForm({ title: '', content: '' });
  };

  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });

  return (
    <div>
      {/* Create Post Section */}
      <Panel title="Create Announcement" icon={Plus}>
        <div style={{ padding: spacing.xl }}>
          {showAnnouncementForm || editingAnnouncement ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
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
                  fontSize: typography.fontSize.lg,
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
                  fontSize: typography.fontSize.md,
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: spacing.md, justifyContent: 'flex-end' }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAnnouncementForm(false);
                    setEditingAnnouncement(null);
                    setAnnouncementForm({ title: '', content: '' });
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={editingAnnouncement ? handleUpdateAnnouncement : handleCreateAnnouncement}>
                  {editingAnnouncement ? 'Update' : 'Post'}
                </Button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.lg,
                padding: spacing.xl,
                background: 'rgba(255,255,255,0.02)',
                borderRadius: borderRadius.xl,
                border: `1px dashed ${colors.border.gold}`,
                cursor: 'pointer',
              }}
              onClick={() => setShowAnnouncementForm(true)}
            >
              <Avatar name={authorName} avatarUrl={authorAvatar} size={44} />
              <div style={{ flex: 1 }}>
                <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.lg }}>
                  Share an update with your audience...
                </p>
              </div>
              <Button icon={Plus}>New Post</Button>
            </div>
          )}
        </div>
      </Panel>

      {/* Announcements Feed */}
      <Panel
        title="Announcements Feed"
        icon={FileText}
        action={<span style={{ color: colors.text.secondary }}>{announcements.length} posts</span>}
      >
        <div style={{ padding: spacing.xl }}>
          {sortedAnnouncements.length > 0 ? (
            sortedAnnouncements.map((post) => (
              <div
                key={post.id}
                style={{
                  background: post.pinned ? 'rgba(212,175,55,0.05)' : 'rgba(255,255,255,0.02)',
                  border: post.pinned ? `1px solid rgba(212,175,55,0.2)` : `1px solid ${colors.border.lighter}`,
                  borderRadius: borderRadius.xl,
                  padding: spacing.xl,
                  marginBottom: spacing.lg,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md }}>
                  <Avatar name={authorName} avatarUrl={authorAvatar} size={44} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                      <span style={{ fontWeight: typography.fontWeight.semibold }}>{authorName}</span>
                      {post.pinned && <Badge variant="gold" size="sm">Pinned</Badge>}
                      <span style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>
                        • {formatRelativeTime(post.publishedAt)}
                      </span>
                    </div>
                    <h4 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, marginBottom: spacing.sm }}>
                      {post.title}
                    </h4>
                    <p style={{ color: colors.text.secondary }}>{post.content}</p>
                  </div>
                  <div style={{ display: 'flex', gap: spacing.sm }}>
                    <button
                      onClick={() => onTogglePin(post.id, post.pinned)}
                      style={{
                        padding: spacing.sm,
                        background: post.pinned ? 'rgba(212,175,55,0.2)' : 'transparent',
                        border: `1px solid ${post.pinned ? colors.gold.primary : colors.border.light}`,
                        borderRadius: borderRadius.md,
                        color: post.pinned ? colors.gold.primary : colors.text.secondary,
                        cursor: 'pointer',
                      }}
                      title={post.pinned ? 'Unpin' : 'Pin'}
                    >
                      <Pin size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingAnnouncement(post);
                        setAnnouncementForm({ title: post.title, content: post.content });
                      }}
                      style={{
                        padding: spacing.sm,
                        background: 'transparent',
                        border: `1px solid ${colors.border.light}`,
                        borderRadius: borderRadius.md,
                        color: colors.text.secondary,
                        cursor: 'pointer',
                      }}
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => onDeleteAnnouncement(post.id)}
                      style={{
                        padding: spacing.sm,
                        background: 'transparent',
                        border: `1px solid rgba(239,68,68,0.3)`,
                        borderRadius: borderRadius.md,
                        color: '#ef4444',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: spacing.xxl, color: colors.text.secondary }}>
              <FileText size={48} style={{ marginBottom: spacing.md, opacity: 0.5 }} />
              <p>No announcements yet. Create your first post above.</p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
