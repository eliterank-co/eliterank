import { supabase, isSupabaseConfigured, withFreshSession } from './supabase';

/**
 * Bonus vote task keys - must match database task_key values
 */
export const BONUS_TASK_KEYS = {
  COMPLETE_PROFILE: 'complete_profile',
  ADD_PHOTO: 'add_photo',
  ADD_SOCIAL: 'add_social',
  VIEW_HOW_TO_WIN: 'view_how_to_win',
  SHARE_PROFILE: 'share_profile',
  INTRO_VIDEO: 'intro_video',
};

/**
 * Deprecated task keys - filtered out on the frontend.
 */
export const DEPRECATED_TASK_KEYS = new Set(['add_bio']);

/**
 * Setup default bonus vote tasks for a competition
 * Called when a competition is created or when an admin enables bonus votes
 */
export async function setupDefaultBonusTasks(competitionId) {
  if (!supabase || !competitionId) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const { error } = await supabase.rpc('setup_default_bonus_tasks', {
      p_competition_id: competitionId,
    });

    if (error) {
      console.error('Error setting up bonus tasks:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Error setting up bonus tasks:', err);
    return { success: false, error: 'Failed to setup bonus tasks' };
  }
}

/**
 * Get bonus vote tasks and completion status for a contestant
 */
export async function getBonusVoteStatus(competitionId, contestantId) {
  if (!supabase || !competitionId || !contestantId) {
    return { tasks: [], error: null };
  }

  try {
    const { data, error } = await supabase.rpc('get_bonus_vote_status', {
      p_competition_id: competitionId,
      p_contestant_id: contestantId,
    });

    if (error) {
      console.error('Error getting bonus vote status:', error);
      return { tasks: [], error: error.message };
    }

    return { tasks: data || [], error: null };
  } catch (err) {
    console.error('Error getting bonus vote status:', err);
    return { tasks: [], error: 'Failed to get bonus vote status' };
  }
}

/**
 * Award bonus votes for completing a task
 * Idempotent - won't double-award.
 * Bonus votes are flat engagement rewards — intentionally NOT subject to
 * the double-vote-day multiplier. The award_bonus_votes RPC writes
 * directly to contestants.votes (bypassing the votes table), so the
 * multiplier code path can never accidentally apply here.
 */
export async function awardBonusVotes(competitionId, contestantId, userId, taskKey) {
  if (!supabase || !competitionId || !contestantId || !taskKey) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const { data, error } = await withFreshSession(() =>
      supabase.rpc('award_bonus_votes', {
        p_competition_id: competitionId,
        p_contestant_id: contestantId,
        p_user_id: userId || null,
        p_task_key: taskKey,
      })
    );

    if (error) {
      console.error('Error awarding bonus votes:', error);
      return { success: false, error: error.message };
    }

    // Fire push for the contestant if the credit landed and we have a user to push to.
    // The SQL function already inserted the in-app notification.
    const result = data || { success: false, error: 'No response' };
    if (result.success && result.contestant_user_id) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: result.contestant_user_id,
          type: 'bonus_awarded',
          vote_count: result.votes_awarded,
          url: `/profile/${result.contestant_user_id}`,
          data: {
            task_label: result.task_label,
            competition_id: competitionId,
            contestant_id: contestantId,
          },
        },
      }).catch((err) => console.warn('bonus_awarded push (non-blocking):', err));
    }

    return result;
  } catch (err) {
    console.error('Error awarding bonus votes:', err);
    return { success: false, error: 'Failed to award bonus votes' };
  }
}

/**
 * Get bonus vote tasks for a competition (admin view)
 */
export async function getBonusVoteTasks(competitionId) {
  if (!supabase || !competitionId) {
    return { tasks: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from('bonus_vote_tasks')
      .select('*')
      .eq('competition_id', competitionId)
      .order('sort_order');

    if (error) {
      console.error('Error fetching bonus vote tasks:', error);
      return { tasks: [], error: error.message };
    }

    return { tasks: data || [], error: null };
  } catch (err) {
    console.error('Error fetching bonus vote tasks:', err);
    return { tasks: [], error: 'Failed to fetch bonus vote tasks' };
  }
}

/**
 * Update a bonus vote task (admin)
 */
export async function updateBonusVoteTask(taskId, updates) {
  if (!supabase || !taskId) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const { error } = await supabase
      .from('bonus_vote_tasks')
      .update(updates)
      .eq('id', taskId);

    if (error) {
      console.error('Error updating bonus vote task:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Error updating bonus vote task:', err);
    return { success: false, error: 'Failed to update task' };
  }
}

/**
 * Get completion stats for a competition (admin view)
 */
export async function getBonusVoteCompletionStats(competitionId) {
  if (!supabase || !competitionId) {
    return { stats: null, error: null };
  }

  try {
    const { data, error } = await supabase
      .from('bonus_vote_completions')
      .select('task_id, votes_awarded')
      .eq('competition_id', competitionId);

    if (error) {
      console.error('Error fetching completion stats:', error);
      return { stats: null, error: error.message };
    }

    // Aggregate stats
    const completions = data || [];
    const totalBonusVotes = completions.reduce((sum, c) => sum + c.votes_awarded, 0);
    const completionsByTask = completions.reduce((acc, c) => {
      acc[c.task_id] = (acc[c.task_id] || 0) + 1;
      return acc;
    }, {});

    return {
      stats: {
        totalCompletions: completions.length,
        totalBonusVotes,
        completionsByTask,
      },
      error: null,
    };
  } catch (err) {
    console.error('Error fetching completion stats:', err);
    return { stats: null, error: 'Failed to fetch stats' };
  }
}

// =============================================================================
// Custom Bonus Task CRUD (Host)
// =============================================================================

/**
 * Create a custom bonus vote task for a competition
 */
export async function createCustomBonusTask(competitionId, { label, description, votesAwarded, proofLabel, createdBy, hostManaged }) {
  if (!supabase || !competitionId) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const taskKey = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { data: existingTasks } = await supabase
      .from('bonus_vote_tasks')
      .select('sort_order')
      .eq('competition_id', competitionId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextSortOrder = (existingTasks?.[0]?.sort_order || 10) + 1;

    const { data, error } = await supabase
      .from('bonus_vote_tasks')
      .insert({
        competition_id: competitionId,
        task_key: taskKey,
        label,
        description: description || null,
        votes_awarded: votesAwarded || 5,
        proof_label: hostManaged ? null : (proofLabel || 'Upload a screenshot as proof'),
        is_custom: true,
        requires_approval: !hostManaged,
        host_managed: hostManaged || false,
        created_by: createdBy || null,
        sort_order: nextSortOrder,
        enabled: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating custom bonus task:', error);
      return { success: false, error: error.message };
    }

    return { success: true, task: data };
  } catch (err) {
    console.error('Error creating custom bonus task:', err);
    return { success: false, error: 'Failed to create custom task' };
  }
}

/**
 * Delete a custom bonus vote task
 */
export async function deleteCustomBonusTask(taskId) {
  if (!supabase || !taskId) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const { error } = await supabase
      .from('bonus_vote_tasks')
      .delete()
      .eq('id', taskId)
      .eq('is_custom', true);

    if (error) {
      console.error('Error deleting custom bonus task:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Error deleting custom bonus task:', err);
    return { success: false, error: 'Failed to delete custom task' };
  }
}

// =============================================================================
// Proof Submission (Contestant)
// =============================================================================

/**
 * Submit proof for an approval-based bonus task
 */
export async function submitBonusProof(competitionId, contestantId, userId, taskId, proofUrl) {
  if (!supabase || !competitionId || !contestantId || !taskId || !proofUrl) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const { data, error } = await supabase.rpc('submit_bonus_proof', {
      p_competition_id: competitionId,
      p_contestant_id: contestantId,
      p_user_id: userId || null,
      p_task_id: taskId,
      p_proof_url: proofUrl,
    });

    if (error) {
      console.error('Error submitting bonus proof:', error);
      return { success: false, error: error.message };
    }

    return data || { success: false, error: 'No response' };
  } catch (err) {
    console.error('Error submitting bonus proof:', err);
    return { success: false, error: 'Failed to submit proof' };
  }
}

// =============================================================================
// Submission Review (Host)
// =============================================================================

/**
 * Get pending submissions for a competition (host view)
 */
export async function getPendingSubmissions(competitionId) {
  if (!supabase || !competitionId) {
    return { submissions: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from('bonus_vote_submissions')
      .select(`
        *,
        task:bonus_vote_tasks(label, votes_awarded, proof_label),
        contestant:contestants(name, avatar_url, user_id)
      `)
      .eq('competition_id', competitionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching submissions:', error);
      return { submissions: [], error: error.message };
    }

    return { submissions: data || [], error: null };
  } catch (err) {
    console.error('Error fetching submissions:', err);
    return { submissions: [], error: 'Failed to fetch submissions' };
  }
}

/**
 * Approve or reject a bonus vote submission
 */
export async function reviewBonusSubmission(submissionId, reviewerId, action, rejectionReason) {
  if (!supabase || !submissionId || !reviewerId || !action) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const { data, error } = await supabase.rpc('review_bonus_submission', {
      p_submission_id: submissionId,
      p_reviewer_id: reviewerId,
      p_action: action,
      p_rejection_reason: rejectionReason || null,
    });

    if (error) {
      console.error('Error reviewing submission:', error);
      return { success: false, error: error.message };
    }

    const result = data || { success: false, error: 'No response' };
    // The approve path's award_bonus_votes() call is what inserts the in-app
    // bonus_awarded row; the reject path inserts bonus_rejected directly.
    // Either way, fire a push so the contestant is notified outside the app too.
    if (result.success && result.contestant_user_id) {
      const pushType = result.action === 'approved' ? 'bonus_awarded' : 'bonus_rejected';
      supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: result.contestant_user_id,
          type: pushType,
          vote_count: result.votes_awarded || 0,
          url: `/profile/${result.contestant_user_id}`,
          data: {
            task_label: result.task_label,
            rejection_reason: result.rejection_reason || null,
            submission_id: submissionId,
          },
        },
      }).catch((err) => console.warn(`${pushType} push (non-blocking):`, err));
    }

    return result;
  } catch (err) {
    console.error('Error reviewing submission:', err);
    return { success: false, error: 'Failed to review submission' };
  }
}

/**
 * Check if a user has earned all bonus votes in any active competition.
 * Used to display the "All Bonus Votes Earned" badge on profiles.
 *
 * @param {string} userId - The user's profile UUID
 * @returns {Promise<{ allEarned: boolean, totalEarned: number, totalAvailable: number }>}
 */
export async function getAllBonusVotesEarnedStatus(userId) {
  const result = { allEarned: false, totalEarned: 0, totalAvailable: 0 };

  if (!supabase || !userId) return result;

  try {
    // Get the user's contestant entries for non-completed competitions
    const { data: contestants, error: cErr } = await supabase
      .from('contestants')
      .select('id, competition_id, competition:competitions(status)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (cErr || !contestants?.length) return result;

    // Check active competitions (non-completed)
    const activeEntries = contestants.filter(c => c.competition?.status && c.competition.status !== 'completed');
    if (activeEntries.length === 0) return result;

    // Check the most recent active competition
    const entry = activeEntries[0];
    const { tasks } = await getBonusVoteStatus(entry.competition_id, entry.id);

    // Filter out deprecated tasks
    const activeTasks = tasks.filter(t => !DEPRECATED_TASK_KEYS.has(t.task_key));
    if (activeTasks.length === 0) return result;

    const earned = activeTasks.filter(t => t.completed).reduce((sum, t) => sum + t.votes_awarded, 0);
    const available = activeTasks.reduce((sum, t) => sum + t.votes_awarded, 0);
    const completedCount = activeTasks.filter(t => t.completed).length;

    return {
      allEarned: completedCount === activeTasks.length,
      totalEarned: earned,
      totalAvailable: available,
    };
  } catch (err) {
    console.error('Error checking all bonus votes status:', err);
    return result;
  }
}

/**
 * Load nominee bonus action completions from the profiles table.
 * Falls back to localStorage if DB is unavailable.
 */
export async function loadNomineeBonusActions(userId, competitionId) {
  if (!supabase || !userId) {
    try {
      return JSON.parse(localStorage.getItem(`nominee_bonus_tasks_${userId}`) || '{}');
    } catch {
      return {};
    }
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('bonus_actions')
      .eq('id', userId)
      .single();

    const allActions = data?.bonus_actions;
    if (error || !allActions) {
      try {
        return JSON.parse(localStorage.getItem(`nominee_bonus_tasks_${userId}`) || '{}');
      } catch {
        return {};
      }
    }

    // Per-competition: actions stored under competitionId key
    if (competitionId && allActions[competitionId] && typeof allActions[competitionId] === 'object') {
      return allActions[competitionId];
    }

    // Backward compat: flat keys like { share_profile: true } (legacy global format)
    // Only return these if no competition-scoped data exists yet
    if (competitionId) {
      const hasCompKeys = Object.keys(allActions).some(k => typeof allActions[k] === 'object');
      if (!hasCompKeys) return allActions; // legacy format, treat as current competition
      return {}; // other competitions have scoped data, this one doesn't
    }

    return allActions;
  } catch {
    try {
      return JSON.parse(localStorage.getItem(`nominee_bonus_tasks_${userId}`) || '{}');
    } catch {
      return {};
    }
  }
}

/**
 * Save a nominee bonus action completion to the profiles table and localStorage.
 * Merges the new task key into the existing bonus_actions JSONB, scoped by competition.
 */
export async function saveNomineeBonusAction(userId, taskKey, competitionId) {
  // Always save to localStorage as a fast cache
  const storageKey = userId ? `nominee_bonus_tasks_${userId}` : null;
  if (storageKey) {
    try {
      const current = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (competitionId) {
        current[competitionId] = { ...(current[competitionId] || {}), [taskKey]: true };
      } else {
        current[taskKey] = true;
      }
      localStorage.setItem(storageKey, JSON.stringify(current));
    } catch { /* ignore */ }
  }

  // Persist to database
  if (!supabase || !userId) return;

  try {
    const { data } = await supabase
      .from('profiles')
      .select('bonus_actions')
      .eq('id', userId)
      .single();

    const allActions = { ...(data?.bonus_actions || {}) };
    if (competitionId) {
      allActions[competitionId] = { ...(allActions[competitionId] || {}), [taskKey]: true };
    } else {
      allActions[taskKey] = true;
    }

    await supabase
      .from('profiles')
      .update({ bonus_actions: allActions })
      .eq('id', userId);
  } catch (err) {
    console.error('Error saving nominee bonus action:', err);
  }
}

/**
 * Auto-award action-based bonus tasks (view_how_to_win, share_profile) for a
 * newly converted contestant. Reads completions from the user's profile
 * bonus_actions and awards them via the standard DB flow.
 */
export async function awardNomineeActionBonuses(competitionId, contestantId, userId) {
  if (!competitionId || !contestantId || !userId) return [];

  const actions = await loadNomineeBonusActions(userId);
  const awarded = [];

  const actionTaskKeys = [BONUS_TASK_KEYS.VIEW_HOW_TO_WIN, BONUS_TASK_KEYS.SHARE_PROFILE];

  for (const taskKey of actionTaskKeys) {
    if (actions[taskKey]) {
      const result = await awardBonusVotes(competitionId, contestantId, userId, taskKey);
      if (result.success) awarded.push(result);
    }
  }

  return awarded;
}

/**
 * Check profile completeness and auto-award applicable bonus votes
 * Call this after profile updates to check if any new tasks are completed
 */
export async function checkAndAwardProfileBonuses(competitionId, contestantId, userId, profile) {
  if (!competitionId || !contestantId || !profile) return [];

  const awarded = [];

  // Check complete_profile: has name, bio, and city
  const hasName = !!(profile.first_name || profile.name);
  const hasBio = !!(profile.bio && profile.bio.length > 0);
  const hasCity = !!(profile.city && profile.city.length > 0);

  if (hasName && hasBio && hasCity) {
    const result = await awardBonusVotes(competitionId, contestantId, userId, BONUS_TASK_KEYS.COMPLETE_PROFILE);
    if (result.success) awarded.push(result);
  }

  // Check add_photo: has avatar_url
  if (profile.avatar_url) {
    const result = await awardBonusVotes(competitionId, contestantId, userId, BONUS_TASK_KEYS.ADD_PHOTO);
    if (result.success) awarded.push(result);
  }

  // Check add_social: has at least one social link
  const hasSocial = !!(profile.instagram || profile.twitter || profile.tiktok || profile.linkedin);
  if (hasSocial) {
    const result = await awardBonusVotes(competitionId, contestantId, userId, BONUS_TASK_KEYS.ADD_SOCIAL);
    if (result.success) awarded.push(result);
  }

  return awarded;
}

// =============================================================================
// Host-Managed Task Operations (Attendance)
// =============================================================================

/**
 * Get contestants and their completion status for a host-managed bonus task
 */
export async function getHostManagedTaskContestants(competitionId, taskId) {
  if (!supabase || !competitionId || !taskId) {
    return { contestants: [], error: null };
  }

  try {
    const { data: contestants, error: cErr } = await supabase
      .from('contestants')
      .select('id, name, avatar_url, user_id')
      .eq('competition_id', competitionId)
      .eq('status', 'active')
      .order('name');

    if (cErr) {
      return { contestants: [], error: cErr.message };
    }

    const { data: completions, error: compErr } = await supabase
      .from('bonus_vote_completions')
      .select('contestant_id')
      .eq('task_id', taskId);

    if (compErr) {
      return { contestants: [], error: compErr.message };
    }

    const completedSet = new Set((completions || []).map(c => c.contestant_id));

    const result = (contestants || []).map(c => ({
      ...c,
      completed: completedSet.has(c.id),
    }));

    return { contestants: result, error: null };
  } catch (err) {
    console.error('Error fetching host-managed task contestants:', err);
    return { contestants: [], error: 'Failed to fetch contestants' };
  }
}

/**
 * Award a host-managed bonus task to a specific contestant (no proof needed)
 */
export async function awardHostManagedTask(competitionId, contestantId, userId, taskKey) {
  return awardBonusVotes(competitionId, contestantId, userId, taskKey);
}

/**
 * Revoke a host-managed bonus task from a contestant
 */
export async function revokeHostManagedTask(competitionId, contestantId, taskId) {
  if (!supabase || !competitionId || !contestantId || !taskId) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const { data: task, error: taskErr } = await supabase
      .from('bonus_vote_tasks')
      .select('votes_awarded')
      .eq('id', taskId)
      .single();

    if (taskErr || !task) {
      return { success: false, error: 'Task not found' };
    }

    const { error: delErr } = await supabase
      .from('bonus_vote_completions')
      .delete()
      .eq('task_id', taskId)
      .eq('contestant_id', contestantId);

    if (delErr) {
      return { success: false, error: delErr.message };
    }

    const { error: updateErr } = await supabase.rpc('increment_contestant_votes', {
      p_contestant_id: contestantId,
      p_count: -task.votes_awarded,
    });

    if (updateErr) {
      console.error('Error decrementing votes:', updateErr);
    }

    return { success: true };
  } catch (err) {
    console.error('Error revoking host-managed task:', err);
    return { success: false, error: 'Failed to revoke task' };
  }
}
