-- =============================================================================
-- tests/setup_judging_fixture.sql
-- Baseline schema fixture for testing judging readiness barrier & finalization
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitions
CREATE TABLE IF NOT EXISTS public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  status TEXT NOT NULL DEFAULT 'voting',
  winners_split_by_gender BOOLEAN DEFAULT false,
  number_of_winners INTEGER DEFAULT 1,
  winner_placement_labels TEXT[],
  winners UUID[],
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contestants
CREATE TABLE IF NOT EXISTS public.contestants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES public.competitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  votes INTEGER DEFAULT 0,
  rank INTEGER,
  gender TEXT,
  advancement_status TEXT,
  current_round INTEGER,
  eliminated_in_round INTEGER,
  votes_at_round_start JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voting Rounds
CREATE TABLE IF NOT EXISTS public.voting_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES public.competitions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  round_order INTEGER NOT NULL,
  round_type TEXT NOT NULL DEFAULT 'voting',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  contestants_advance INTEGER NOT NULL DEFAULT 1,
  judge_weight INTEGER NOT NULL DEFAULT 0,
  votes_reset_at_start BOOLEAN DEFAULT false,
  votes_accumulate BOOLEAN DEFAULT true,
  finalized_at TIMESTAMPTZ,
  finalized_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Judges
CREATE TABLE IF NOT EXISTS public.judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id UUID,
  name TEXT NOT NULL,
  email TEXT,
  claimed_at TIMESTAMPTZ,
  hidden BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Judging Criteria
CREATE TABLE IF NOT EXISTS public.judging_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT,
  weight NUMERIC(4,2) NOT NULL DEFAULT 1.0 CHECK (weight > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Judge Scores
CREATE TABLE IF NOT EXISTS public.judge_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  voting_round_id UUID NOT NULL REFERENCES public.voting_rounds(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES public.judges(id) ON DELETE CASCADE,
  contestant_id UUID NOT NULL REFERENCES public.contestants(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES public.judging_criteria(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (voting_round_id, judge_id, contestant_id, criterion_id)
);

-- Auxiliary tables for finalize_voting_round
CREATE TABLE IF NOT EXISTS public.bonus_vote_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contestant_id UUID,
  votes_awarded INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.manual_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contestant_id UUID,
  vote_count INTEGER DEFAULT 0
);
