-- R009: report current daily income as a return on principal still outstanding.
-- The view signature is unchanged. Closed/fully repaid loans return zero rather than divide by zero.
-- V23 wrapped this view to append cash-account request columns, so preserve the current definition
-- and replace only the named calculation instead of rebuilding it from the older V22 source text.
DO $$
DECLARE
    definition text;
    start_marker constant text := 'CASE a."Loan Type"';
    end_marker constant text := 'END AS "Effective Daily Interest Rate"';
    start_at integer;
    end_at integer;
    replacement constant text := $rate$
CASE
                            WHEN COALESCE(a."Outstanding Principal"::numeric, 0::numeric) <= 0::numeric THEN 0::numeric
                            ELSE
                            CASE a."Loan Type"
                                WHEN 'ดอกเบี้ยรายวัน'::text THEN COALESCE(a."Current Daily Interest"::numeric, 0::numeric) / a."Outstanding Principal"::numeric
                                WHEN 'กำหนดวันชำระ'::text THEN COALESCE(a."Fixed Interest"::numeric, 0::numeric) / NULLIF(a.term_days, 0)::numeric / a."Outstanding Principal"::numeric
                                WHEN 'ผ่อนชำระรายวัน'::text THEN (COALESCE(a."Daily Payment Amount"::numeric, 0::numeric) * a.term_days::numeric - COALESCE(a."Principal Amount"::numeric, 0::numeric)) / NULLIF(a.term_days, 0)::numeric / a."Outstanding Principal"::numeric
                                ELSE 0::numeric
                            END
                        END AS "Effective Daily Interest Rate"$rate$;
BEGIN
    definition := rtrim(pg_get_viewdef('public.olap_loans_analytics'::regclass, true), E';\n ');
    start_at := strpos(definition, start_marker);
    IF start_at = 0 THEN
        RAISE EXCEPTION 'Could not find the existing Effective Daily Interest Rate calculation start';
    END IF;

    end_at := strpos(substr(definition, start_at), end_marker);
    IF end_at = 0 THEN
        RAISE EXCEPTION 'Could not find the existing Effective Daily Interest Rate calculation end';
    END IF;
    end_at := start_at + end_at - 1 + length(end_marker);

    definition := substr(definition, 1, start_at - 1)
        || replacement
        || substr(definition, end_at);

    EXECUTE 'CREATE OR REPLACE VIEW public.olap_loans_analytics AS ' || definition;
END
$$;
