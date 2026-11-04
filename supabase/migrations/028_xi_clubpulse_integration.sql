-- ─────────────────────────────────────────────────────────────────────────────
-- XI–ClubPulse Integration tables
--
-- 1. xi_users                   — one row per ClubPulse player who has an XI
--    account; created via POST /api/xi/users/create called at sign-up.
--
-- 2. xi_match_performances      — per-player per-match stats + calculated
--    fantasy/rewards points; upserted by POST /api/xi/matches/performance.
--
-- 3. xi_wallet_transactions     — append-only ledger of rewards earned and
--    spent on The XI side; written alongside every performance sync.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. xi_users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.xi_users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Link back to ClubPulse — stored for audit / reconciliation only.
  -- The XI does NOT query ClubPulse's DB; this is a one-way foreign key hint.
  clubpulse_user_id   UUID        NOT NULL UNIQUE,
  display_name        TEXT        NOT NULL,
  email               TEXT        NOT NULL UNIQUE,
  wallet_balance      INTEGER     NOT NULL DEFAULT 0,
  -- bronze → silver → gold as lifetime_earned crosses thresholds
  tier                TEXT        NOT NULL DEFAULT 'bronze'
                        CHECK (tier IN ('bronze', 'silver', 'gold')),
  lifetime_earned     INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION public.xi_users_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER xi_users_updated_at
  BEFORE UPDATE ON public.xi_users
  FOR EACH ROW EXECUTE FUNCTION public.xi_users_set_updated_at();

-- Auto-promote tier when lifetime_earned crosses thresholds
-- Silver: 500 pts lifetime   Gold: 2000 pts lifetime
CREATE OR REPLACE FUNCTION public.xi_users_auto_tier()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lifetime_earned >= 2000 THEN
    NEW.tier = 'gold';
  ELSIF NEW.lifetime_earned >= 500 THEN
    NEW.tier = 'silver';
  ELSE
    NEW.tier = 'bronze';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER xi_users_tier_update
  BEFORE UPDATE OF lifetime_earned ON public.xi_users
  FOR EACH ROW EXECUTE FUNCTION public.xi_users_auto_tier();

CREATE INDEX IF NOT EXISTS xi_users_clubpulse_user_id_idx
  ON public.xi_users (clubpulse_user_id);

COMMENT ON TABLE public.xi_users IS
  'One row per ClubPulse player with an XI account. Created by
   POST /api/xi/users/create on ClubPulse player sign-up.';

-- RLS: service role (API key routes) handles all writes; no browser client
-- touches this table directly, so no auth.uid() policies needed.
-- Keep RLS on to prevent accidental direct-client access.
ALTER TABLE public.xi_users ENABLE ROW LEVEL SECURITY;

-- 2. xi_match_performances ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.xi_match_performances (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  xi_user_id          UUID        NOT NULL REFERENCES public.xi_users(id) ON DELETE CASCADE,
  -- ClubPulse match UUID — The XI does not own match records
  match_id            UUID        NOT NULL,
  player_role         TEXT        CHECK (player_role IN ('batsman','bowler','all_rounder','wicket_keeper')),
  -- Batting
  runs_scored         INTEGER     NOT NULL DEFAULT 0,
  balls_faced         INTEGER     NOT NULL DEFAULT 0,
  fours               INTEGER     NOT NULL DEFAULT 0,
  sixes               INTEGER     NOT NULL DEFAULT 0,
  did_not_bat         BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Bowling
  wickets             INTEGER     NOT NULL DEFAULT 0,
  maidens             INTEGER     NOT NULL DEFAULT 0,
  dot_balls           INTEGER     NOT NULL DEFAULT 0,
  -- Fielding
  catches             INTEGER     NOT NULL DEFAULT 0,
  stumpings           INTEGER     NOT NULL DEFAULT 0,
  run_outs            INTEGER     NOT NULL DEFAULT 0,
  -- Calculated scores (set by the API route, not recomputed here)
  base_points         INTEGER     NOT NULL DEFAULT 0,
  fantasy_points      INTEGER     NOT NULL DEFAULT 0,
  rewards_earned      INTEGER     NOT NULL DEFAULT 0,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (xi_user_id, match_id)
);

CREATE INDEX IF NOT EXISTS xi_match_performances_user_idx
  ON public.xi_match_performances (xi_user_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS xi_match_performances_match_idx
  ON public.xi_match_performances (match_id);

COMMENT ON TABLE public.xi_match_performances IS
  'Per-player per-match stats and calculated points. Upserted by
   POST /api/xi/matches/performance on conflict (xi_user_id, match_id).';

ALTER TABLE public.xi_match_performances ENABLE ROW LEVEL SECURITY;

-- 3. xi_wallet_transactions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.xi_wallet_transactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  xi_user_id      UUID        NOT NULL REFERENCES public.xi_users(id) ON DELETE CASCADE,
  -- Positive = credit, negative = debit
  amount          INTEGER     NOT NULL,
  category        TEXT        NOT NULL
                    CHECK (category IN (
                      'match_performance',  -- rewards from match sync
                      'tier_bonus',         -- one-off bonus on tier promotion
                      'top_up',             -- manual credit
                      'spend',              -- redemption / purchase
                      'adjustment'          -- admin correction
                    )),
  -- ClubPulse match UUID, contest UUID, etc. — free-text reference
  reference       TEXT,
  balance_after   INTEGER     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS xi_wallet_transactions_user_idx
  ON public.xi_wallet_transactions (xi_user_id, created_at DESC);

COMMENT ON TABLE public.xi_wallet_transactions IS
  'Append-only wallet ledger for The XI rewards. match_performance rows are
   written by POST /api/xi/matches/performance on every ClubPulse sync.';

ALTER TABLE public.xi_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lifetime-earned increment helper
--
-- Called after xi_wallet_transactions INSERT when category = match_performance.
-- Keeps lifetime_earned in sync without requiring a separate UPDATE call from
-- the API route.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.xi_increment_lifetime_earned()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category = 'match_performance' AND NEW.amount > 0 THEN
    UPDATE public.xi_users
    SET lifetime_earned = lifetime_earned + NEW.amount
    WHERE id = NEW.xi_user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER xi_wallet_lifetime_earned
  AFTER INSERT ON public.xi_wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.xi_increment_lifetime_earned();
