CREATE ROLE mw_app_prod NOLOGIN;
CREATE ROLE mw_app_prod_journal_owner NOLOGIN;
CREATE ROLE "mw-credit-app-read-prod@clever-oasis-508610-n7.iam" LOGIN;
CREATE ROLE "mw-credit-app-command-prod@clever-oasis-508610-n7.iam" LOGIN;
GRANT mw_app_prod TO "mw-credit-app-command-prod@clever-oasis-508610-n7.iam" WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT USAGE ON SCHEMA public TO "mw-credit-app-read-prod@clever-oasis-508610-n7.iam","mw-credit-app-command-prod@clever-oasis-508610-n7.iam";
GRANT SELECT ON public."Partners" TO "mw-credit-app-read-prod@clever-oasis-508610-n7.iam","mw-credit-app-command-prod@clever-oasis-508610-n7.iam";
