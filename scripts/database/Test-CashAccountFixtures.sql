\set ON_ERROR_STOP on
-- Synthetic accounts for legacy payment/loan regressions on the current schema.
-- Call only from disposable test databases; no balances, defaults or guards changed.
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name")
VALUES ('CI-DAD','ch:dad','Synthetic CI Dad','Synthetic'),
       ('CI-LISA','ch:lisa','Synthetic CI Lisa','Synthetic')
ON CONFLICT ("Row ID") DO NOTHING;
