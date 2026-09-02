-- Recipient-level fan-email delivery state. A worker queues deterministic
-- occurrences, atomically claims a bounded batch, and settles every claim.
-- Provider dispatch remains independently default-off.
CREATE TABLE public.fan_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  competition_id uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  contestant_id uuid REFERENCES public.contestants(id) ON DELETE SET NULL,
  fan_id uuid REFERENCES public.contestant_fans(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  message_kind text NOT NULL CHECK (
    message_kind IN ('weekly_digest', 'round_closing', 'vote_boost')
  ),
  occurrence_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'claimed', 'accepted', 'failed', 'suppressed', 'delivered', 'bounced', 'complained')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz DEFAULT now(),
  claimed_at timestamptz,
  lease_until timestamptz,
  claim_token uuid,
  provider_id text,
  last_error text,
  accepted_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, contestant_id, message_kind, occurrence_key)
);

CREATE INDEX fan_email_deliveries_claim_idx
  ON public.fan_email_deliveries (next_attempt_at, created_at)
  WHERE status IN ('queued', 'failed', 'claimed');
CREATE INDEX fan_email_deliveries_provider_idx
  ON public.fan_email_deliveries (provider_id)
  WHERE provider_id IS NOT NULL;

ALTER TABLE public.fan_email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fan_email_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fan_email_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fan_email_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_fan_email_deliveries(
  p_limit integer DEFAULT 50,
  p_now timestamptz DEFAULT now(),
  p_lease interval DEFAULT interval '5 minutes'
)
RETURNS TABLE (
  id uuid,
  payload jsonb,
  attempt_count integer,
  claim_token uuid
)
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT d.id
    FROM public.fan_email_deliveries AS d
    WHERE (
      (d.status IN ('queued', 'failed') AND COALESCE(d.next_attempt_at, p_now) <= p_now)
      OR (d.status = 'claimed' AND d.lease_until < p_now)
    )
    ORDER BY d.next_attempt_at NULLS FIRST, d.created_at, d.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE public.fan_email_deliveries AS d
  SET status = 'claimed',
      attempt_count = d.attempt_count + 1,
      claimed_at = p_now,
      lease_until = p_now + p_lease,
      claim_token = gen_random_uuid(),
      updated_at = p_now
  FROM candidates
  WHERE d.id = candidates.id
  RETURNING d.id, d.payload, d.attempt_count, d.claim_token;
$$;

CREATE OR REPLACE FUNCTION public.settle_fan_email_delivery(
  p_id uuid,
  p_claim_token uuid,
  p_status text,
  p_provider_id text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_retry_at timestamptz DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('accepted', 'failed', 'suppressed') THEN
    RAISE EXCEPTION 'invalid fan email settlement status: %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.fan_email_deliveries
  SET status = p_status,
      provider_id = COALESCE(p_provider_id, provider_id),
      last_error = CASE WHEN p_status = 'failed' THEN left(p_error, 1000) ELSE NULL END,
      next_attempt_at = CASE WHEN p_status = 'failed' THEN p_retry_at ELSE NULL END,
      accepted_at = CASE WHEN p_status = 'accepted' THEN p_now ELSE accepted_at END,
      settled_at = CASE WHEN p_status IN ('accepted', 'suppressed') THEN p_now ELSE NULL END,
      lease_until = NULL,
      claim_token = NULL,
      updated_at = p_now
  WHERE id = p_id
    AND status = 'claimed'
    AND claim_token = p_claim_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_fan_email_deliveries(integer, timestamptz, interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fan_email_deliveries(integer, timestamptz, interval)
  TO service_role;
REVOKE ALL ON FUNCTION public.settle_fan_email_delivery(uuid, uuid, text, text, text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_fan_email_delivery(uuid, uuid, text, text, text, timestamptz, timestamptz)
  TO service_role;

INSERT INTO public.app_settings (key, value)
VALUES ('fan_email_dispatch', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
