WITH expected AS (
    SELECT l."Row ID",
        CASE
            WHEN coalesce(l."Outstanding Principal"::numeric, 0) <= 0 THEN 0
            ELSE CASE l."Loan Type"
                WHEN 'ดอกเบี้ยรายวัน' THEN coalesce(l."Current Daily Interest"::numeric, 0) / l."Outstanding Principal"::numeric
                WHEN 'กำหนดวันชำระ' THEN coalesce(l."Fixed Interest"::numeric, 0) / nullif(l."Due Date" - l."Loan Date" + 1, 0) / l."Outstanding Principal"::numeric
                WHEN 'ผ่อนชำระรายวัน' THEN (
                    coalesce(l."Daily Payment Amount"::numeric, 0) * (l."Due Date" - l."Loan Date" + 1)
                    - coalesce(l."Principal Amount"::numeric, 0)
                ) / nullif(l."Due Date" - l."Loan Date" + 1, 0) / l."Outstanding Principal"::numeric
                ELSE 0
            END
        END AS expected_rate
    FROM public."Loans" l
), audit AS (
    SELECT count(*) AS total_loans,
        count(*) FILTER (
            WHERE l."Outstanding Principal"::numeric > 0
              AND l."Outstanding Principal"::numeric < l."Principal Amount"::numeric
        ) AS partial_balance_loans,
        count(*) FILTER (
            WHERE coalesce(l."Outstanding Principal"::numeric, 0) <= 0
              AND v."Effective Daily Interest Rate" <> 0
        ) AS nonzero_zero_balance_rates,
        count(*) FILTER (
            WHERE v."Effective Daily Interest Rate" IS DISTINCT FROM round(coalesce(e.expected_rate, 0), 4)
        ) AS calculation_mismatches
    FROM public.olap_loans_analytics v
    JOIN public."Loans" l USING ("Row ID")
    JOIN expected e USING ("Row ID")
)
SELECT json_build_object(
    'flywayVersion', (
        SELECT max(replace(version, '.', '')::integer)
        FROM public.flyway_schema_history
        WHERE success AND version ~ '^[0-9]+$'
    ),
    'totalLoans', total_loans,
    'partialBalanceLoans', partial_balance_loans,
    'nonzeroZeroBalanceRates', nonzero_zero_balance_rates,
    'calculationMismatches', calculation_mismatches
)::text
FROM audit;
