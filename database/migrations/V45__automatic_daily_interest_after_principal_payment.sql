-- R036: retain an exact daily-interest basis in the existing free-text arrangement.
-- No new columns/tables, no backlog UPDATE and no rewriting of posted charges.
-- Two basis amounts retain the ratio without compounding rounded daily amounts.
CREATE FUNCTION public.daily_interest_basis(p_arrangement text)
RETURNS numeric[] LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE m text[]; matches integer:=0; result numeric[];
BEGIN
 FOR m IN SELECT regexp_matches(coalesce(p_arrangement,''),
  '\[Original daily interest: ([0-9]+(?:\.[0-9]+)?) baht/day on ([0-9]+(?:\.[0-9]+)?) baht principal\]','g')
 LOOP
  matches:=matches+1; result:=ARRAY[m[1]::numeric,m[2]::numeric];
 END LOOP;
 IF matches>1 OR (matches=1 AND (result[1]<=0 OR result[2]<=0)) THEN
  RAISE EXCEPTION 'Daily interest basis is invalid; review the loan arrangement';
 END IF;
 IF matches=0 AND strpos(coalesce(p_arrangement,''),'[Original daily interest:')>0 THEN
  RAISE EXCEPTION 'Daily interest basis is malformed; review the loan arrangement';
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.daily_interest_basis_note(p_basis numeric[])
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT '[Original daily interest: '||p_basis[1]::text||' baht/day on '||p_basis[2]::text||' baht principal]'
  ||' Original rate: '||round(100*p_basis[1]/p_basis[2],8)::text
  ||'% per day. Daily interest automatically follows remaining principal; retain this note.';
$$;

-- Called after vc_loan_row has read the authoritative signed repayment totals.
CREATE FUNCTION public.apply_principal_daily_interest(p public."Loans", previous public."Loans")
RETURNS public."Loans" LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE basis numeric[]; old_basis numeric[]; candidate numeric; n bigint;
 source text; previous_balance numeric;
 principal_changed boolean; note text;
BEGIN
 IF p."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' THEN RETURN p; END IF;
 principal_changed:=previous."Row ID" IS NOT NULL AND
  p."Total Principal Received" IS DISTINCT FROM previous."Total Principal Received";
 old_basis:=public.daily_interest_basis(previous."Loan Arrangement");
 basis:=public.daily_interest_basis(p."Loan Arrangement");
 IF old_basis IS NOT NULL THEN
  -- A stale app save must not remove/rebase the rate or restore an old daily amount.
  IF basis IS NOT NULL AND basis IS DISTINCT FROM old_basis THEN
   RAISE EXCEPTION 'Original daily interest basis cannot be changed by a loan edit';
  END IF;
  basis:=old_basis;
 ELSIF previous."Row ID" IS NOT NULL AND NOT principal_changed THEN
  -- Existing loans are untouched until a future posted principal change.
  RETURN p;
 END IF;

 IF basis IS NULL THEN
  IF previous."Row ID" IS NULL THEN
   IF p."Principal Amount"::numeric<=0 OR p."Current Daily Interest"::numeric<=0
    OR p."Principal Amount" IS NULL OR p."Current Daily Interest" IS NULL THEN RETURN p; END IF;
   basis:=ARRAY[p."Current Daily Interest"::numeric,p."Principal Amount"::numeric];
   source:='Initial loan entry';
  ELSE
   -- Owner-approved reconstruction: the first-day charge contains daily interest
   -- plus the recorded transfer fee. Require one positive, zero-principal charge.
   SELECT count(*),min(c."Interest Due"::numeric-coalesce(previous."Transfer Fee"::numeric,0))
    INTO n,candidate FROM public."Charges" c
    WHERE c."Ref Loans"=p."Row ID" AND c."Charge Date"=previous."Loan Date"
     AND coalesce(c."Principal Due"::numeric,0)=0;
   IF n=1 AND candidate>0 AND previous."Principal Amount"::numeric>0 THEN
    basis:=ARRAY[candidate,previous."Principal Amount"::numeric];
    source:='Original first-day charge less recorded transfer fee';
   ELSE
    -- A first-day charge may be absent when automatic generation was off.
    -- Retain the rate implied by the amount and principal immediately before
    -- this principal change; never divide by the already reduced balance.
    previous_balance:=previous."Outstanding Principal";
    IF previous_balance>0 AND previous."Current Daily Interest"::numeric>0 THEN
     basis:=ARRAY[previous."Current Daily Interest"::numeric,previous_balance];
     source:='Daily amount / outstanding principal immediately before automatic adjustment';
    ELSIF coalesce(previous."Current Daily Interest"::numeric,0)=0 THEN
     -- Existing zero/blank-interest setups have no positive rate to preserve.
     RETURN p;
    ELSE
     RAISE EXCEPTION 'Cannot establish daily interest basis; review original charges and loan arrangement';
    END IF;
   END IF;
  END IF;
 END IF;

 IF public.daily_interest_basis(p."Loan Arrangement") IS NULL THEN
  note:=public.daily_interest_basis_note(basis);
  p."Loan Arrangement":=coalesce(p."Loan Arrangement",'')
   ||CASE WHEN coalesce(p."Loan Arrangement",'')='' THEN '' ELSE E'\n' END||note
   ||CASE WHEN source IS NULL THEN '' ELSE ' Basis: '||source||'.' END;
 END IF;
 -- Preserve the original input at its original balance; adjusted amounts use
 -- whole baht, matching the existing payment engine and AppSheet price display.
 p."Current Daily Interest":=(CASE WHEN p."Outstanding Principal"=basis[2] THEN basis[1]
  ELSE round(basis[1]*greatest(0,p."Outstanding Principal")/basis[2],0) END)::money;
 RETURN p;
END $$;

CREATE OR REPLACE FUNCTION public.vc_loan_row() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT coalesce(sum("Interest Paid"::numeric),0),coalesce(sum("Principal Paid"::numeric),0),
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0)
 INTO NEW."Total Interest Received",NEW."Total Principal Received",NEW."Total Amount Received"
 FROM public."Repayments" WHERE "Ref Loans"=NEW."Row ID";
 NEW."Outstanding Principal":=coalesce(NEW."Principal Amount"::numeric,0)-NEW."Total Principal Received";
 NEW:=public.apply_principal_daily_interest(NEW,CASE WHEN TG_OP='UPDATE' THEN OLD ELSE NULL::public."Loans" END);
 -- zz_vc_daily_interest precedes this trigger. Refresh its result after adjusting
 -- principal/daily amount so downstream borrower rollups read the same state.
 NEW."Expected Daily Interest Amount":=public.vc_daily_interest(NEW);
 RETURN NEW;
END $$;
