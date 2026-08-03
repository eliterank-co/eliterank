import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, CheckCircle, Circle, XCircle, Check, X, Clock, Eye, Users, MapPin, Gift } from 'lucide-react';
import { Button, Badge, Avatar, Panel } from '../../../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../../../styles/theme';
import { isSupabaseConfigured } from '../../../../../lib/supabase';
import {
  getBonusVoteTasks,
  setupDefaultBonusTasks,
  updateBonusVoteTask,
  getBonusVoteCompletionStats,
  createCustomBonusTask,
  deleteCustomBonusTask,
  getPendingSubmissions,
  reviewBonusSubmission,
  getHostManagedTaskContestants,
  awardHostManagedTask,
  revokeHostManagedTask,
} from '../../../../../lib/bonusVotes';
import CustomBonusTaskModal from '../../../../../components/modals/CustomBonusTaskModal';
import ContestantViewPreviewModal from '../../../../../components/modals/ContestantViewPreviewModal';

/**
 * BonusVotesSection — Engagement tab. Configure the bonus-vote tasks
 * contestants can complete, review proof submissions, and manage
 * host-confirmed (attendance-style) tasks. Owns its own data loading.
 */
export default function BonusVotesSection({
  competitionId,
  isMobile,
  focusId,
  defaultCollapsed,
  style,
  reviewerId,
  toast,
  onRefresh,
}) {
  // Bonus votes state
  const [bonusTasks, setBonusTasks] = useState([]);
  const [bonusStats, setBonusStats] = useState(null);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  // Custom task modal state
  const [showCustomTaskModal, setShowCustomTaskModal] = useState(false);
  const [editingCustomTask, setEditingCustomTask] = useState(null);

  // Contestant view preview modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Submission review state
  const [submissions, setSubmissions] = useState([]);
  const [reviewingId, setReviewingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Host-managed attendance state
  const [attendanceTaskId, setAttendanceTaskId] = useState(null);
  const [attendanceContestants, setAttendanceContestants] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [awardingAttendance, setAwardingAttendance] = useState(null);

  const loadBonusTasks = useCallback(async () => {
    if (!competitionId || !isSupabaseConfigured()) return;
    setBonusLoading(true);
    const [tasksResult, statsResult] = await Promise.all([
      getBonusVoteTasks(competitionId),
      getBonusVoteCompletionStats(competitionId),
    ]);
    setBonusTasks(tasksResult.tasks);
    setBonusStats(statsResult.stats);
    setBonusLoading(false);
  }, [competitionId]);

  const loadSubmissions = useCallback(async () => {
    if (!competitionId || !isSupabaseConfigured()) return;
    const result = await getPendingSubmissions(competitionId);
    setSubmissions(result.submissions);
  }, [competitionId]);

  useEffect(() => {
    loadBonusTasks();
    loadSubmissions();
  }, [loadBonusTasks, loadSubmissions]);

  const handleSetupBonusTasks = async () => {
    if (!competitionId) return;
    setSettingUp(true);
    await setupDefaultBonusTasks(competitionId);
    await loadBonusTasks();
    setSettingUp(false);
  };

  const handleToggleBonusTask = async (taskId, currentEnabled) => {
    await updateBonusVoteTask(taskId, { enabled: !currentEnabled });
    setBonusTasks(prev => prev.map(t => t.id === taskId ? { ...t, enabled: !currentEnabled } : t));
  };

  const handleUpdateBonusVotes = async (taskId, newVotes) => {
    const votes = parseInt(newVotes, 10);
    if (isNaN(votes) || votes < 0) return;
    await updateBonusVoteTask(taskId, { votes_awarded: votes });
    setBonusTasks(prev => prev.map(t => t.id === taskId ? { ...t, votes_awarded: votes } : t));
  };

  const handleSaveCustomTask = async (data) => {
    if (!competitionId) return;
    if (editingCustomTask) {
      await updateBonusVoteTask(editingCustomTask.id, {
        label: data.label,
        description: data.description,
        votes_awarded: data.votesAwarded,
        proof_label: data.hostManaged ? null : data.proofLabel,
        host_managed: data.hostManaged || false,
        requires_approval: !data.hostManaged,
        link_url: data.linkUrl || null,
      });
    } else {
      await createCustomBonusTask(competitionId, {
        ...data,
        createdBy: reviewerId || null,
      });
    }
    setShowCustomTaskModal(false);
    setEditingCustomTask(null);
    await loadBonusTasks();
  };

  const handleDeleteCustomTask = async (taskId) => {
    if (!window.confirm('Delete this custom task? Any pending submissions will also be removed.')) return;
    await deleteCustomBonusTask(taskId);
    setBonusTasks(prev => prev.filter(t => t.id !== taskId));
    await loadSubmissions();
  };

  const handleApproveSubmission = async (submissionId) => {
    if (!reviewerId) {
      toast?.error?.('You must be signed in to review submissions.');
      return;
    }
    setReviewingId(submissionId);
    const result = await reviewBonusSubmission(submissionId, reviewerId, 'approve');
    setReviewingId(null);
    if (!result?.success) {
      toast?.error?.(result?.error || 'Failed to approve submission.');
      return;
    }
    toast?.success?.(`Approved — +${result.votes_awarded || ''} bonus votes awarded`);
    await Promise.all([loadSubmissions(), loadBonusTasks()]);
    if (onRefresh) onRefresh();
  };

  const handleRejectSubmission = async (submissionId) => {
    if (!reviewerId) {
      toast?.error?.('You must be signed in to review submissions.');
      return;
    }
    setReviewingId(submissionId);
    const result = await reviewBonusSubmission(submissionId, reviewerId, 'reject', rejectionReason);
    setReviewingId(null);
    setRejectingId(null);
    setRejectionReason('');
    if (!result?.success) {
      toast?.error?.(result?.error || 'Failed to reject submission.');
      return;
    }
    toast?.info?.('Submission rejected');
    await loadSubmissions();
  };

  // Host-managed attendance handlers
  const handleOpenAttendance = async (task) => {
    setAttendanceTaskId(task.id);
    setAttendanceLoading(true);
    const result = await getHostManagedTaskContestants(competitionId, task.id);
    setAttendanceContestants(result.contestants);
    setAttendanceLoading(false);
  };

  const handleCloseAttendance = () => {
    setAttendanceTaskId(null);
    setAttendanceContestants([]);
  };

  const handleToggleAttendance = async (contestant, task) => {
    setAwardingAttendance(contestant.id);
    if (contestant.completed) {
      await revokeHostManagedTask(competitionId, contestant.id, task.id);
    } else {
      await awardHostManagedTask(competitionId, contestant.id, contestant.user_id, task.task_key);
    }
    // Refresh the list
    const result = await getHostManagedTaskContestants(competitionId, task.id);
    setAttendanceContestants(result.contestants);
    setAwardingAttendance(null);
    await loadBonusTasks();
    if (onRefresh) onRefresh();
  };

  return (
    <>
      <Panel
        id="setup-section-bonusVotes"
        title="Bonus Votes"
        icon={Gift}
        collapsible
        defaultCollapsed={defaultCollapsed && focusId !== 'bonusVotes'}
        style={style}
      >
        <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
          {bonusLoading ? (
            <p style={{ color: colors.text.secondary, textAlign: 'center', padding: spacing.lg }}>
              Loading bonus vote tasks...
            </p>
          ) : bonusTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: spacing.xl }}>
              <Gift size={48} style={{ marginBottom: spacing.md, opacity: 0.5, color: colors.gold.primary }} />
              <p style={{ color: colors.text.secondary, marginBottom: spacing.lg }}>
                Bonus votes reward contestants for completing tasks like filling out their profile or reviewing competition info. Set up the default tasks to get started.
              </p>
              <Button
                onClick={handleSetupBonusTasks}
                disabled={settingUp}
                icon={Plus}
              >
                {settingUp ? 'Setting up...' : 'Enable Bonus Votes'}
              </Button>
            </div>
          ) : (
            <>
              {/* Stats summary */}
              {bonusStats && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
                  gap: spacing.sm,
                  marginBottom: spacing.lg,
                }}>
                  <div style={{
                    padding: spacing.md,
                    background: 'rgba(212,175,55,0.08)',
                    borderRadius: borderRadius.lg,
                    border: '1px solid rgba(212,175,55,0.15)',
                  }}>
                    <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginBottom: spacing.xs }}>Active Tasks</p>
                    <p style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.gold.primary }}>
                      {bonusTasks.filter(t => t.enabled).length}
                    </p>
                  </div>
                  <div style={{
                    padding: spacing.md,
                    background: 'rgba(34,197,94,0.08)',
                    borderRadius: borderRadius.lg,
                    border: '1px solid rgba(34,197,94,0.15)',
                  }}>
                    <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginBottom: spacing.xs }}>Total Completions</p>
                    <p style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.status.success }}>
                      {bonusStats.totalCompletions}
                    </p>
                  </div>
                  <div style={{
                    padding: spacing.md,
                    background: 'rgba(59,130,246,0.08)',
                    borderRadius: borderRadius.lg,
                    border: '1px solid rgba(59,130,246,0.15)',
                    ...(isMobile ? { gridColumn: 'span 2' } : {}),
                  }}>
                    <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginBottom: spacing.xs }}>Bonus Votes Awarded</p>
                    <p style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.status.info }}>
                      {bonusStats.totalBonusVotes}
                    </p>
                  </div>
                </div>
              )}

              <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, marginBottom: spacing.lg }}>
                Contestants earn bonus votes by completing these tasks. Toggle tasks on/off or adjust the vote reward.
              </p>

              {/* Task list */}
              <div style={{ display: 'grid', gap: spacing.sm }}>
                {bonusTasks.map((task) => (
                  <div key={task.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.md,
                    background: task.enabled ? colors.background.secondary : 'rgba(100,100,100,0.08)',
                    borderRadius: borderRadius.lg,
                    border: `1px solid ${task.enabled ? (task.is_custom ? 'rgba(212,175,55,0.2)' : colors.border.primary) : 'rgba(100,100,100,0.15)'}`,
                    opacity: task.enabled ? 1 : 0.6,
                  }}>
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggleBonusTask(task.id, task.enabled)}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: borderRadius.md,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: task.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(100,100,100,0.15)',
                        border: 'none',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {task.enabled ? (
                        <CheckCircle size={18} style={{ color: colors.status.success }} />
                      ) : (
                        <XCircle size={18} style={{ color: colors.text.muted }} />
                      )}
                    </button>

                    {/* Task info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <p style={{ fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.base }}>
                          {task.label}
                        </p>
                        {task.is_custom && (
                          <Badge variant="gold" size="sm" style={{ fontSize: '10px' }}>
                            {task.host_managed ? 'Host Managed' : 'Requires Approval'}
                          </Badge>
                        )}
                      </div>
                      <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>
                        {task.description || task.task_key}
                      </p>
                    </div>

                    {/* Vote amount editor */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
                      <span style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}>+</span>
                      <input
                        type="number"
                        value={task.votes_awarded}
                        onChange={(e) => handleUpdateBonusVotes(task.id, e.target.value)}
                        min="0"
                        max="100"
                        style={{
                          width: '48px',
                          padding: `${spacing.xs} ${spacing.sm}`,
                          background: colors.background.card,
                          border: `1px solid ${colors.border.primary}`,
                          borderRadius: borderRadius.sm,
                          color: colors.gold.primary,
                          fontSize: typography.fontSize.sm,
                          fontWeight: typography.fontWeight.semibold,
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}>votes</span>
                    </div>

                    {/* Completion count */}
                    {bonusStats?.completionsByTask?.[task.id] && (
                      <Badge variant="success" size="sm">
                        {bonusStats.completionsByTask[task.id]} done
                      </Badge>
                    )}

                    {/* Edit / Delete for custom tasks */}
                    {task.is_custom && (
                      <div style={{ display: 'flex', gap: spacing.xs, flexShrink: 0 }}>
                        {task.host_managed && (
                          <button
                            onClick={() => handleOpenAttendance(task)}
                            style={{
                              padding: `${spacing.xs} ${spacing.sm}`,
                              background: 'rgba(212,175,55,0.1)',
                              border: '1px solid rgba(212,175,55,0.3)',
                              borderRadius: borderRadius.md,
                              color: colors.gold.primary,
                              cursor: 'pointer',
                              fontSize: typography.fontSize.xs,
                              fontWeight: typography.fontWeight.medium,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Users size={12} /> Manage
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingCustomTask(task); setShowCustomTaskModal(true); }}
                          style={{
                            padding: spacing.sm,
                            background: 'transparent',
                            border: `1px solid ${colors.border.primary}`,
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
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomTask(task.id)}
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
                    )}
                  </div>
                ))}
              </div>

              {/* Add Custom Task / Preview contestant view */}
              <div style={{ marginTop: spacing.lg, display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Button
                  onClick={() => { setEditingCustomTask(null); setShowCustomTaskModal(true); }}
                  variant="secondary"
                  icon={Plus}
                  size="sm"
                >
                  Add Custom Task
                </Button>
                <Button
                  onClick={() => setShowPreviewModal(true)}
                  variant="secondary"
                  icon={Eye}
                  size="sm"
                >
                  Preview contestant view
                </Button>
              </div>

              {/* Pending Submissions Review */}
              {(() => {
                const pendingSubs = submissions.filter(s => s.status === 'pending');
                if (pendingSubs.length === 0) return null;
                return (
                  <div style={{ marginTop: spacing.xl }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.sm,
                      marginBottom: spacing.md,
                    }}>
                      <Clock size={18} style={{ color: colors.gold.primary }} />
                      <h4 style={{
                        fontSize: typography.fontSize.base,
                        fontWeight: typography.fontWeight.semibold,
                        color: colors.text.primary,
                      }}>
                        Pending Submissions
                      </h4>
                      <Badge variant="gold" size="sm">{pendingSubs.length}</Badge>
                    </div>
                    <div style={{ display: 'grid', gap: spacing.sm }}>
                      {pendingSubs.map((sub) => (
                        <div key={sub.id} style={{
                          padding: spacing.md,
                          background: 'rgba(212,175,55,0.04)',
                          borderRadius: borderRadius.lg,
                          border: '1px solid rgba(212,175,55,0.15)',
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: isMobile ? 'flex-start' : 'center',
                            gap: spacing.md,
                            flexDirection: isMobile ? 'column' : 'row',
                          }}>
                            {/* Contestant info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{
                                fontWeight: typography.fontWeight.medium,
                                fontSize: typography.fontSize.sm,
                                color: colors.text.primary,
                              }}>
                                {sub.contestant?.name || 'Unknown'}
                              </p>
                              <p style={{
                                fontSize: typography.fontSize.xs,
                                color: colors.text.muted,
                                marginTop: '2px',
                              }}>
                                {sub.task?.label} — +{sub.task?.votes_awarded} votes
                              </p>
                            </div>

                            {/* Proof preview */}
                            <a
                              href={sub.proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Click to view full size"
                              style={{
                                display: 'block',
                                flexShrink: 0,
                                borderRadius: borderRadius.sm,
                                overflow: 'hidden',
                                border: `1px solid ${colors.border.primary}`,
                                lineHeight: 0,
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <img
                                src={sub.proof_url}
                                alt="Proof"
                                style={{
                                  width: '80px',
                                  height: '80px',
                                  objectFit: 'cover',
                                  display: 'block',
                                }}
                              />
                            </a>

                            {/* Action buttons */}
                            {rejectingId === sub.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
                                <input
                                  type="text"
                                  placeholder="Reason (optional)"
                                  value={rejectionReason}
                                  onChange={(e) => setRejectionReason(e.target.value)}
                                  style={{
                                    width: isMobile ? '120px' : '160px',
                                    padding: `${spacing.xs} ${spacing.sm}`,
                                    background: colors.background.card,
                                    border: `1px solid ${colors.border.primary}`,
                                    borderRadius: borderRadius.sm,
                                    color: colors.text.primary,
                                    fontSize: typography.fontSize.xs,
                                  }}
                                />
                                <button
                                  onClick={() => handleRejectSubmission(sub.id)}
                                  disabled={reviewingId === sub.id}
                                  style={{
                                    padding: `${spacing.xs} ${spacing.sm}`,
                                    background: 'rgba(239,68,68,0.15)',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    borderRadius: borderRadius.sm,
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: typography.fontSize.xs,
                                    fontWeight: typography.fontWeight.medium,
                                  }}
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                                  style={{
                                    padding: spacing.xs,
                                    background: 'transparent',
                                    border: 'none',
                                    color: colors.text.muted,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: spacing.xs, flexShrink: 0 }}>
                                <button
                                  onClick={() => handleApproveSubmission(sub.id)}
                                  disabled={reviewingId === sub.id}
                                  style={{
                                    padding: `${spacing.xs} ${spacing.sm}`,
                                    background: 'rgba(34,197,94,0.15)',
                                    border: '1px solid rgba(34,197,94,0.3)',
                                    borderRadius: borderRadius.sm,
                                    color: colors.status.success,
                                    cursor: 'pointer',
                                    fontSize: typography.fontSize.xs,
                                    fontWeight: typography.fontWeight.medium,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <Check size={12} /> Approve
                                </button>
                                <button
                                  onClick={() => setRejectingId(sub.id)}
                                  disabled={reviewingId === sub.id}
                                  style={{
                                    padding: `${spacing.xs} ${spacing.sm}`,
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.2)',
                                    borderRadius: borderRadius.sm,
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: typography.fontSize.xs,
                                    fontWeight: typography.fontWeight.medium,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <X size={12} /> Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Host-Managed Attendance Panel */}
              {attendanceTaskId && (() => {
                const task = bonusTasks.find(t => t.id === attendanceTaskId);
                if (!task) return null;
                const confirmedCount = attendanceContestants.filter(c => c.completed).length;
                return (
                  <div style={{ marginTop: spacing.xl }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: spacing.md,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <MapPin size={18} style={{ color: colors.gold.primary }} />
                        <h4 style={{
                          fontSize: typography.fontSize.base,
                          fontWeight: typography.fontWeight.semibold,
                          color: colors.text.primary,
                        }}>
                          {task.label}
                        </h4>
                        <Badge variant="gold" size="sm">{confirmedCount}/{attendanceContestants.length}</Badge>
                      </div>
                      <button
                        onClick={handleCloseAttendance}
                        style={{
                          padding: spacing.xs,
                          background: 'transparent',
                          border: 'none',
                          color: colors.text.muted,
                          cursor: 'pointer',
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {attendanceLoading ? (
                      <p style={{ fontSize: typography.fontSize.sm, color: colors.text.muted }}>Loading contestants...</p>
                    ) : attendanceContestants.length === 0 ? (
                      <p style={{ fontSize: typography.fontSize.sm, color: colors.text.muted }}>No active contestants found.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: spacing.xs }}>
                        {attendanceContestants.map((c) => (
                          <div key={c.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: spacing.md,
                            padding: `${spacing.sm} ${spacing.md}`,
                            background: c.completed ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
                            borderRadius: borderRadius.md,
                            border: `1px solid ${c.completed ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
                          }}>
                            <Avatar src={c.avatar_url} name={c.name} size={32} />
                            <span style={{
                              flex: 1,
                              fontSize: typography.fontSize.sm,
                              color: colors.text.primary,
                              fontWeight: typography.fontWeight.medium,
                            }}>
                              {c.name}
                            </span>
                            <button
                              onClick={() => handleToggleAttendance(c, task)}
                              disabled={awardingAttendance === c.id}
                              style={{
                                padding: `${spacing.xs} ${spacing.sm}`,
                                background: c.completed ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${c.completed ? 'rgba(34,197,94,0.3)' : colors.border.primary}`,
                                borderRadius: borderRadius.sm,
                                color: c.completed ? colors.status.success : colors.text.muted,
                                cursor: 'pointer',
                                fontSize: typography.fontSize.xs,
                                fontWeight: typography.fontWeight.medium,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                opacity: awardingAttendance === c.id ? 0.5 : 1,
                              }}
                            >
                              {c.completed ? (
                                <><CheckCircle size={14} /> Confirmed</>
                              ) : (
                                <><Circle size={14} /> Confirm</>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </Panel>

      {/* Custom Bonus Task Modal */}
      <CustomBonusTaskModal
        isOpen={showCustomTaskModal}
        onClose={() => { setShowCustomTaskModal(false); setEditingCustomTask(null); }}
        task={editingCustomTask}
        onSave={handleSaveCustomTask}
      />

      {/* Contestant View Preview Modal */}
      <ContestantViewPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        tasks={bonusTasks}
      />
    </>
  );
}
