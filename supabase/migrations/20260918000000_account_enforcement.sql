-- =============================================================================
-- Account enforcement: suspension / ban flag, immutable audit, and vote-path block
-- =============================================================================
--
-- Design notes
-- ------------
-- * The status lives in its own table (`account_status`) rather than a column on
--   `profiles`, because `profiles` has a public SELECT policy (`profiles_select
--   USING (true)`). A status column there would be world-readable. This table is
--   RLS-protected and only exposes a row to its owner and to super admins.
-- * Suspensions may be temporary (`suspended_until`). `account_effective_status`
--   treats an expired suspension as active, so no background job is required.
-- * Enforcement is at the data boundary: a BEFORE INSERT trigger on `votes`
--   rejects any vote whose `voter_id` is suspended or banned. This covers the
--   authenticated free-vote path, the paid-vote webhook (service role), and the
--   anonymous vote route alike, because triggers fire regardless of the client.
-- * Every change goes through `admin_set_account_status`, which is the only
--   writer of the flag and the audit table. It refuses to act on yourself or on
--   another super admin, so an admin cannot lock the platform's own operators.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enforcement state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_status (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'banned')),
  reason          TEXT,
  suspended_until TIMESTAMPTZ,
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.account_status IS
  'Current suspension/ban state per user. Absence of a row means active.';

-- ---------------------------------------------------------------------------
-- 2. Immutable enforcement audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_enforcement_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action              TEXT NOT NULL CHECK (action IN ('suspend', 'ban', 'restore')),
  status_before       TEXT,
  status_after        TEXT NOT NULL,
  reason              TEXT,
  suspended_until     TIMESTAMPTZ,
  performed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email  TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_enforcement_actions_user
  ON public.account_enforcement_actions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_enforcement_actions_created
  ON public.account_enforcement_actions (created_at DESC);

COMMENT ON TABLE public.account_enforcement_actions IS
  'Append-only log of every enforcement decision. Never updated or deleted by the app.';

-- ---------------------------------------------------------------------------
-- 3. Status resolution helpers
-- ---------------------------------------------------------------------------

-- Effective status, treating an elapsed temporary suspension as active.
CREATE OR REPLACE FUNCTION public.account_effective_status(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
               WHEN s.status = 'suspended'
                    AND s.suspended_until IS NOT NULL
                    AND s.suspended_until <= NOW()
                 THEN 'active'
               ELSE s.status
             END
      FROM public.account_status s
      WHERE s.user_id = p_user_id
    ),
    'active'
  );
$$;

-- Boolean convenience wrapper used by triggers and clients.
CREATE OR REPLACE FUNCTION public.account_is_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.account_effective_status(p_user_id) = 'active';
$$;

-- ---------------------------------------------------------------------------
-- 4. Vote-path enforcement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_account_active_on_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.voter_id IS NOT NULL AND NOT public.account_is_active(NEW.voter_id) THEN
    RAISE EXCEPTION 'account_not_active'
      USING ERRCODE = 'P0001',
            HINT = 'This account is suspended or banned and cannot cast or purchase votes.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_account_active_on_vote ON public.votes;
CREATE TRIGGER enforce_account_active_on_vote
  BEFORE INSERT ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_account_active_on_vote();

-- ---------------------------------------------------------------------------
-- 5. Admin mutation surface (the only writer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  p_user_id         UUID,
  p_action          TEXT,
  p_reason          TEXT DEFAULT NULL,
  p_suspended_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        UUID := auth.uid();
  v_actor_email  TEXT;
  v_target_status TEXT;
  v_before       TEXT;
  v_reason       TEXT;
  v_until        TIMESTAMPTZ;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('suspend', 'ban', 'restore') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;

  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'cannot_enforce_self' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_super_admin = TRUE) THEN
    RAISE EXCEPTION 'cannot_enforce_super_admin' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  v_target_status := CASE p_action
                       WHEN 'suspend' THEN 'suspended'
                       WHEN 'ban'     THEN 'banned'
                       ELSE 'active'
                     END;

  IF p_action = 'suspend' THEN
    v_until := p_suspended_until;
    IF v_until IS NOT NULL AND v_until <= NOW() THEN
      RAISE EXCEPTION 'invalid_suspended_until' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_until := NULL;
  END IF;

  v_reason := CASE WHEN p_action = 'restore' THEN NULL ELSE NULLIF(BTRIM(p_reason), '') END;

  SELECT public.account_effective_status(p_user_id) INTO v_before;

  INSERT INTO public.account_status (user_id, status, reason, suspended_until, updated_by, updated_at)
  VALUES (p_user_id, v_target_status, v_reason, v_until, v_actor, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET status          = EXCLUDED.status,
        reason          = EXCLUDED.reason,
        suspended_until = EXCLUDED.suspended_until,
        updated_by      = EXCLUDED.updated_by,
        updated_at      = NOW();

  SELECT email INTO v_actor_email FROM public.profiles WHERE id = v_actor;

  INSERT INTO public.account_enforcement_actions (
    user_id, action, status_before, status_after, reason,
    suspended_until, performed_by, performed_by_email
  ) VALUES (
    p_user_id, p_action, v_before, v_target_status, v_reason,
    v_until, v_actor, v_actor_email
  );

  RETURN jsonb_build_object(
    'user_id',        p_user_id,
    'status',         v_target_status,
    'prior_status',   v_before,
    'suspended_until', v_until
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.account_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_enforcement_actions ENABLE ROW LEVEL SECURITY;

-- account_status: the owner may read their own state (so the app can explain a
-- restriction); super admins may read and write all rows.
DROP POLICY IF EXISTS account_status_select_self_or_admin ON public.account_status;
CREATE POLICY account_status_select_self_or_admin ON public.account_status
  FOR SELECT
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS account_status_admin_write ON public.account_status;
CREATE POLICY account_status_admin_write ON public.account_status
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- audit: the subject may read their own history (appeal context); super admins
-- may read all. No client INSERT/UPDATE/DELETE policy — writes only via the
-- SECURITY DEFINER RPC, so the log cannot be forged or erased from a client.
DROP POLICY IF EXISTS account_enforcement_actions_select_self_or_admin
  ON public.account_enforcement_actions;
CREATE POLICY account_enforcement_actions_select_self_or_admin
  ON public.account_enforcement_actions
  FOR SELECT
  USING (user_id = auth.uid() OR public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.account_status FROM anon, authenticated;
REVOKE ALL ON public.account_enforcement_actions FROM anon, authenticated;

GRANT SELECT ON public.account_status TO authenticated;
GRANT SELECT ON public.account_enforcement_actions TO authenticated;
GRANT ALL ON public.account_status TO service_role;
GRANT ALL ON public.account_enforcement_actions TO service_role;

REVOKE ALL ON FUNCTION public.account_effective_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_is_active(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_account_status(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;

-- The client may ask whether an account is active (used to fail fast in the
-- vote UI); this leaks nothing beyond the boolean, and only for a supplied id.
GRANT EXECUTE ON FUNCTION public.account_is_active(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_effective_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
