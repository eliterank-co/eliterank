import React, { memo, useMemo, useState } from 'react';
import {
  Gift, CheckCircle, Circle, Camera, Heart,
  Share2, User, BookOpen, Link as LinkIcon, Trophy,
  Clock, XCircle, Upload, ExternalLink, ChevronDown, ChevronUp, MapPin, FileText, Video,
} from 'lucide-react';
import { colors, spacing, borderRadius, typography, gradients, transitions } from '../styles/theme';
import { Badge } from './ui';

// Map task_key to icon
const TASK_ICONS = {
  complete_profile: User,
  add_photo: Camera,
  add_bio: FileText,
  add_social: LinkIcon,
  view_how_to_win: BookOpen,
  share_profile: Share2,
  bio_link: LinkIcon,
  intro_video: Video,
};

// Fallback subtitles shown when a task has no description in the DB
const TASK_DESCRIPTIONS = {
  complete_profile: 'Fill out your name, bio, and city',
  add_photo: 'Upload a profile photo so voters can see you',
  add_social: 'Connect your Instagram, Twitter, or TikTok',
  view_how_to_win: 'Read through the competition rules and tips',
  share_profile: 'Share your contestant profile link externally',
  intro_video: "Upload a short video telling voters who you are and why you should win",
  bio_link: 'Add your EliteRank profile link to your social media bio',
};

/**
 * Progress bar for bonus votes
 */
const ProgressBar = memo(function ProgressBar({ progress, earned, total }) {
  return (
    <div style={{ marginBottom: spacing.lg }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
      }}>
        <span style={{
          fontSize: typography.fontSize.sm,
          color: colors.text.secondary,
        }}>
          {earned} / {total} bonus votes earned
        </span>
        <span style={{
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
          color: progress === 100 ? colors.status.success : colors.gold.primary,
        }}>
          {Math.round(progress)}%
        </span>
      </div>
      <div style={{
        height: '8px',
        borderRadius: borderRadius.pill,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          borderRadius: borderRadius.pill,
          background: progress === 100
            ? gradients.success
            : gradients.gold,
          transition: `width 500ms ${transitions.ease}`,
        }} />
      </div>
    </div>
  );
});

/**
 * Single task row — supports standard auto-award tasks and approval-based custom tasks.
 * Approval states: null (no submission), 'pending', 'approved', 'rejected'
 */
const TaskRow = memo(function TaskRow({ task, onAction, isAwarding }) {
  const isHostManaged = task.host_managed;
  const Icon = isHostManaged ? MapPin : (task.is_custom ? Upload : (TASK_ICONS[task.task_key] || Gift));
  const description = task.description || (task.is_custom ? null : TASK_DESCRIPTIONS[task.task_key]);
  const isCompleted = task.completed;
  const isCurrentlyAwarding = isAwarding === task.task_key;
  const isPending = task.requires_approval && task.submission_status === 'pending';
  const isRejected = task.requires_approval && task.submission_status === 'rejected';

  const getBorderColor = () => {
    if (isCompleted) return 'rgba(34, 197, 94, 0.2)';
    if (isPending) return 'rgba(212, 175, 55, 0.25)';
    if (isRejected) return 'rgba(239, 68, 68, 0.2)';
    return 'rgba(255, 255, 255, 0.06)';
  };

  const getBackground = () => {
    if (isCompleted) return 'rgba(34, 197, 94, 0.08)';
    if (isPending) return 'rgba(212, 175, 55, 0.05)';
    if (isRejected) return 'rgba(239, 68, 68, 0.04)';
    return 'rgba(255, 255, 255, 0.03)';
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md,
      padding: `${spacing.md} ${spacing.lg}`,
      borderRadius: borderRadius.lg,
      background: getBackground(),
      border: `1px solid ${getBorderColor()}`,
      opacity: isCurrentlyAwarding ? 0.7 : 1,
      transition: transitions.all,
      cursor: !isCompleted && !isPending && !isHostManaged && onAction ? 'pointer' : 'default',
    }}
      onClick={() => {
        if (!isCompleted && !isPending && !isHostManaged && onAction) {
          onAction(task.task_key, task);
        }
      }}
    >
      {/* Status icon */}
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: borderRadius.md,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isCompleted
          ? 'rgba(34, 197, 94, 0.15)'
          : isPending
            ? 'rgba(212, 175, 55, 0.12)'
            : isRejected
              ? 'rgba(239, 68, 68, 0.1)'
              : 'rgba(212, 175, 55, 0.1)',
        flexShrink: 0,
      }}>
        <Icon size={18} style={{
          color: isCompleted
            ? colors.status.success
            : isPending
              ? colors.gold.primary
              : isRejected
                ? colors.status.error
                : colors.gold.primary,
        }} />
      </div>

      {/* Task info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
        }}>
          <span style={{
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.medium,
            color: isCompleted ? colors.text.secondary : colors.text.primary,
            textDecoration: isCompleted ? 'line-through' : 'none',
          }}>
            {task.label}
          </span>
        </div>
        {description && (
          <p style={{
            fontSize: typography.fontSize.xs,
            color: colors.text.muted,
            marginTop: '2px',
          }}>
            {description}
          </p>
        )}
        {/* Approval status messages */}
        {isPending && (
          <p style={{
            fontSize: typography.fontSize.xs,
            color: colors.gold.primary,
            marginTop: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <Clock size={12} /> Pending review
          </p>
        )}
        {isRejected && (
          <p style={{
            fontSize: typography.fontSize.xs,
            color: colors.status.error,
            marginTop: '4px',
          }}>
            Rejected{task.rejection_reason ? `: ${task.rejection_reason}` : ''} — tap to resubmit
          </p>
        )}
        {isHostManaged && !isCompleted && (
          <p style={{
            fontSize: typography.fontSize.xs,
            color: colors.text.muted,
            marginTop: '4px',
          }}>
            Confirmed by host after event
          </p>
        )}
        {task.link_url && (
          <a
            href={task.link_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '6px',
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.medium,
              color: colors.gold.primary,
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={12} /> View event
          </a>
        )}
      </div>

      {/* Votes badge / status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        flexShrink: 0,
      }}>
        {isCompleted ? (
          <CheckCircle size={20} style={{ color: colors.status.success }} />
        ) : isPending ? (
          <Badge
            variant="gold"
            size="sm"
            style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              opacity: 0.8,
            }}
          >
            +{task.votes_awarded}
          </Badge>
        ) : isRejected ? (
          <Badge
            variant="gold"
            size="sm"
            style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            +{task.votes_awarded}
          </Badge>
        ) : (
          <Badge
            variant="gold"
            size="sm"
            style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
            }}
          >
            +{task.votes_awarded}
          </Badge>
        )}
      </div>
    </div>
  );
});

/**
 * BonusVotesChecklist - Shows bonus vote tasks and completion status
 *
 * Used in:
 * 1. Contestant's own view (public competition page)
 * 2. Competition dashboard (admin view)
 */
function BonusVotesChecklist({
  tasks = [],
  loading = false,
  awarding = null,
  completedCount = 0,
  totalCount = 0,
  totalBonusVotesEarned = 0,
  totalBonusVotesAvailable = 0,
  progress = 0,
  allCompleted = false,
  onTaskAction,
  compact = false,
  showHeader = true,
  collapsible = false,
  defaultCollapsed = false,
  children,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (loading) {
    return (
      <div style={{
        background: colors.background.card,
        border: `1px solid ${colors.border.primary}`,
        borderRadius: borderRadius.xl,
        padding: spacing.xl,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
          color: colors.text.secondary,
        }}>
          <Heart size={20} style={{ opacity: 0.5 }} />
          <span>Loading bonus tasks...</span>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid rgba(255,255,255,0.06)`,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
    }}>
      {/* Header */}
      {showHeader && (
        <div
          style={{
            padding: `${spacing.lg} ${spacing.xl}`,
            borderBottom: (!collapsible || !collapsed) ? `1px solid ${colors.border.secondary}` : 'none',
            background: 'transparent',
            cursor: collapsible ? 'pointer' : 'default',
          }}
          onClick={collapsible ? () => setCollapsed(prev => !prev) : undefined}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: (!collapsible || !collapsed) ? spacing.md : 0,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
            }}>
              {allCompleted ? (
                <Trophy size={20} style={{ color: colors.status.success }} />
              ) : (
                <Heart size={20} style={{ color: colors.gold.primary, fill: colors.gold.primary }} />
              )}
              <h3 style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
              }}>
                {allCompleted ? 'All Bonus Votes Earned!' : 'Earn Bonus Votes'}
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <Badge
                variant={allCompleted ? 'success' : 'gold'}
                size="sm"
              >
                {completedCount}/{totalCount}
              </Badge>
              {collapsible && (
                collapsed
                  ? <ChevronDown size={18} style={{ color: colors.text.secondary }} />
                  : <ChevronUp size={18} style={{ color: colors.text.secondary }} />
              )}
            </div>
          </div>

          {(!collapsible || !collapsed) && (
            <>
              <ProgressBar
                progress={progress}
                earned={totalBonusVotesEarned}
                total={totalBonusVotesAvailable}
              />

              {!allCompleted && (
                <p style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.text.secondary,
                }}>
                  Complete tasks below to earn free bonus votes for your campaign.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Tasks list */}
      {(!collapsible || !collapsed) && (
        <div style={{
          padding: compact ? spacing.md : spacing.lg,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.sm,
        }}>
          {tasks.filter(t => !t.completed).map((task) => (
            <TaskRow
              key={task.id || task.task_key}
              task={task}
              onAction={onTaskAction}
              isAwarding={awarding}
            />
          ))}
          {children}
        </div>
      )}
    </div>
  );
}

export default memo(BonusVotesChecklist);
