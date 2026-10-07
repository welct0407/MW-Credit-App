"""R047 synthetic DEV fixture and bounded verification. Never targets PROD."""
import argparse, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(os.environ['LOCALAPPDATA']) / 'AppSheetLoanTools/python-deps'))
import psycopg

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['seed', 'verify', 'retire', 'metadata'])
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
target = json.loads((repo / 'database/environments.json').read_text())['development']
assert (target['instance'], target['host'], target['database']) == ('appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_dev')
with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'], user=target['user'],
                     password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=15) as c:
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone() == ('loan_manager_dev', '34.21.174.215')
    assert c.execute('SELECT max(version::integer) FROM public.flyway_schema_history WHERE success').fetchone()[0] == 51
    if args.mode == 'metadata':
        c.execute('SET TRANSACTION READ ONLY')
        routines = c.execute("""SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid)
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname IN
          ('selected_charge_ids','guard_selected_charge_scope','payment_charge_balances','post_payment')
          ORDER BY 1""").fetchall()
        column = c.execute("""SELECT data_type,is_nullable,column_default FROM information_schema.columns
          WHERE table_schema='public' AND table_name='Payments' AND column_name='Selected Charge IDs'""").fetchone()
        trigger = c.execute("""SELECT pg_get_triggerdef(oid) FROM pg_trigger
          WHERE tgrelid='public."Payments"'::regclass AND tgname='a1_selected_charge_scope'""").fetchone()[0]
        print(json.dumps({'environment':'development','migration':51,'column':column,'trigger':trigger,
                          'routines':dict(routines)},ensure_ascii=False,indent=2))
        sys.exit(0)
    if args.mode == 'seed':
        assert not c.execute('SELECT 1 FROM public."Borrowers" WHERE "Row ID"=%s', ('R047-SC-B',)).fetchone(), 'Fixture already exists; inspect instead'
        assert c.execute('''SELECT bool_and("Email" IS NULL OR btrim("Email")='' OR lower(btrim("Email"))='welct0407@mw-credit.com') FROM public."Partners"''').fetchone()[0]
        c.execute('''INSERT INTO public."Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
          ('R047-SC-DAD','ch:dad','R047 synthetic receipt account','Synthetic'),
          ('R047-SC-LISA','ch:lisa','R047 synthetic loan account','Synthetic');
          INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Creation Date","Hidden Flag","Ref Preferred Receiving Cash Account")
          VALUES('R047-SC-B','R047 SELECTED CHARGES TEST','Synthetic DEV only - no real borrower',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,false,'R047-SC-DAD');
          INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Loan Arrangement","Created By") VALUES
          ('R047-SC-LISA','R047-SC-L1','R047-SC-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'R047 SYNTHETIC DEV TEST','welct0407@mw-credit.com'),
          ('R047-SC-LISA','R047-SC-L2','R047-SC-B',current_date-9,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'R047 SYNTHETIC DEV TEST','welct0407@mw-credit.com');
          INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES
          ('R047-SC-A','R047-SC-L1',current_date-4,300::money,100::money,'R047 unselected 400'),
          ('R047-SC-B','R047-SC-L1',current_date-3,100::money,100::money,'R047 selected 200'),
          ('R047-SC-C','R047-SC-L1',current_date-2,100::money,100::money,'R047 selected residual 150'),
          ('R047-SC-D','R047-SC-L2',current_date-1,200::money,100::money,'R047 selected 300'),
          ('R047-SC-F','R047-SC-L2',current_date+1,0::money,30::money,'R047 future excluded');
          INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Created By","Notes")
          VALUES('R047-SC-PART','R047-SC-B','R047-SC-DAD','Processing',50::money,current_date,'Single Partial','R047-SC-C','welct0407@mw-credit.com','R047 synthetic pre-existing partial receipt');''')
    elif args.mode == 'retire':
        c.execute('''UPDATE public."Borrowers" SET "Hidden Flag"=true WHERE "Row ID"='R047-SC-B' AND "Description"='Synthetic DEV only - no real borrower';
          UPDATE public."Cash Accounts" SET "Active"=false WHERE "Row ID" IN ('R047-SC-DAD','R047-SC-LISA') AND "Bank Name"='Synthetic';''')
    rows = c.execute('''SELECT "Row ID","Status","Amount Received"::numeric,"Allocation Method","Selected Charge IDs"
      FROM public."Payments" WHERE "Ref Borrower"='R047-SC-B' ORDER BY "Row ID"''').fetchall()
    charges = c.execute('''SELECT "Row ID","Amount Remaining","Payment Status" FROM public."Charges"
      WHERE "Ref Loans" IN ('R047-SC-L1','R047-SC-L2') ORDER BY "Row ID"''').fetchall()
    totals = c.execute('''SELECT p."Row ID",(SELECT count(*) FROM public."Payment Allocations" a WHERE a."Ref Payment"=p."Row ID"),
      (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) FROM public."Repayments" r WHERE r."Ref Payment"=p."Row ID"),
      (SELECT count(*) FROM public."Cash Ledger" l WHERE l."Ref Payment"=p."Row ID"),
      (SELECT sum("Amount"::numeric) FROM public."Cash Ledger" l WHERE l."Ref Payment"=p."Row ID")
      FROM public."Payments" p WHERE p."Ref Borrower"='R047-SC-B' AND p."Allocation Method"='Selected Charges' ''').fetchall()
    if args.mode in ('verify', 'retire'):
        assert len(totals)==1 and tuple(totals[0][1:])==(3,650,1,650), 'Selected receipt must reconcile exactly once'
        selected = [r for r in rows if r[3]=='Selected Charges']
        assert len(selected)==1 and selected[0][1:]==('Posted',650,'Selected Charges','R047-SC-B , R047-SC-C , R047-SC-D')
        assert {r[0]:r[1] for r in charges}=={'R047-SC-A':400,'R047-SC-B':0,'R047-SC-C':0,'R047-SC-D':0,'R047-SC-F':30}
    if args.mode == 'retire':
        assert c.execute('SELECT "Hidden Flag" FROM public."Borrowers" WHERE "Row ID"=%s', ('R047-SC-B',)).fetchone()[0] is True
        assert c.execute('SELECT count(*) FROM public."Cash Accounts" WHERE "Row ID" IN (%s,%s) AND "Active"=false', ('R047-SC-DAD','R047-SC-LISA')).fetchone()[0] == 2
    print(json.dumps({'environment': 'development', 'mode': args.mode, 'payments': rows, 'charges': charges, 'selected_receipt_reconciliation': totals}, default=str, ensure_ascii=False, indent=2))
