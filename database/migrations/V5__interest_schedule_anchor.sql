-- Optional schedule origin for daily-interest interval changes.
-- NULL preserves the existing Loan Date schedule. This never changes accrual.
ALTER TABLE public."Loans"
    ADD COLUMN "Interest Schedule Anchor Date" date;

ALTER TABLE public."Loans"
    ADD CONSTRAINT loans_interest_schedule_anchor_date_check
    CHECK ("Interest Schedule Anchor Date" IS NULL OR
           ("Loan Date" IS NOT NULL AND "Interest Schedule Anchor Date" >= "Loan Date"));

COMMENT ON COLUMN public."Loans"."Interest Schedule Anchor Date" IS
    'Optional daily-interest schedule origin. First subsequent scheduled charge is anchor plus Interest Payment Interval. NULL uses Loan Date. Does not reset interest accrual or change existing charges.';
