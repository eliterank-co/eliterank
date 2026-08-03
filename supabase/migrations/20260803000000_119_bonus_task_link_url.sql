-- =============================================================================
-- Bonus Task Link URL
-- Allows hosts to attach an optional link to a bonus task (e.g. an RSVP page,
-- signup form, resource, or event). Contestants see this as a clickable
-- "Open link" on their bonus votes checklist.
-- =============================================================================

ALTER TABLE bonus_vote_tasks
  ADD COLUMN IF NOT EXISTS link_url TEXT DEFAULT NULL;

-- =============================================================================
-- Update get_bonus_vote_status to include link_url
-- =============================================================================
CREATE OR REPLACE FUNCTION get_bonus_vote_status(
  p_competition_id UUID,
  p_contestant_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'task_key', t.task_key,
      'label', t.label,
      'description', t.description,
      'votes_awarded', t.votes_awarded,
      'sort_order', t.sort_order,
      'completed', (c.id IS NOT NULL),
      'completed_at', c.completed_at,
      'is_custom', COALESCE(t.is_custom, false),
      'requires_approval', COALESCE(t.requires_approval, false),
      'host_managed', COALESCE(t.host_managed, false),
      'proof_label', t.proof_label,
      'link_url', t.link_url,
      'submission_status', s.status,
      'submission_id', s.id,
      'rejection_reason', s.rejection_reason,
      'proof_url', s.proof_url
    ) ORDER BY t.sort_order, t.created_at
  ) INTO v_result
  FROM bonus_vote_tasks t
  LEFT JOIN bonus_vote_completions c
    ON c.task_id = t.id AND c.contestant_id = p_contestant_id
  LEFT JOIN bonus_vote_submissions s
    ON s.task_id = t.id AND s.contestant_id = p_contestant_id
  WHERE t.competition_id = p_competition_id
    AND t.enabled = TRUE;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
