-- Durable recipient-level delivery state. The worker must claim this row
-- before provider dispatch; a competition-level success flag cannot make a
-- recipient retry safe.
CREATE TABLE IF NOT EXISTS public.fan_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_kind text NOT NULL CHECK (message_kind IN ('weekly_digest', 'round_closing', 'double_day', 'vote_boost')),
  occurrence_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'accepted', 'failed', 'suppressed', 'delivered', 'bounced', 'complained')),
  provider_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (competition_id, recipient_id, message_kind, occurrence_key)
);

ALTER TABLE public.fan_email_deliveries ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_settings (key, value)
VALUES ('fan_email_dispatch', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
