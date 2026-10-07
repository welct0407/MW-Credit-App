-- R014: reviewer authority is independent of notification/Instagram opt-in.
ALTER TABLE public."Partners"
  ADD COLUMN "AI Reviewer" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public."Partners"."AI Reviewer" IS
  'Receives and decides AI payment reviews. Does not control daily summaries or Instagram integration. Initial reviewer: Tommy.';

-- Stable existing identity verified in DEV. Never grant by mutable display name.
UPDATE public."Partners" SET "AI Reviewer" = true
WHERE "Row ID" = '7gR2DfKI874AUy4AZl0L5f' AND "Partner Name" = 'Tommy';
