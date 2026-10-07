-- R011: two receiving identifiers may resolve to one cash account.
-- Optional text preserves leading zeroes and old-app compatibility. No backfill.
ALTER TABLE public."Cash Accounts"
 ADD COLUMN "Alternative Account Number" text;
COMMENT ON COLUMN public."Cash Accounts"."Alternative Account Number" IS
 'Optional second bank account or PromptPay number mapped to this cash account; receipt matching must reject ambiguous matches.';
