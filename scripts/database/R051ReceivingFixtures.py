"""Common receipt paths; exact synthetic IDs, no connection or writes on import."""
from R051PerformanceFixtures import counts

PREFIX = 'SYN-R051-RECV-'

def setup(c, case, track=True):
    c.execute("SET LOCAL timezone='Asia/Bangkok'; SET LOCAL statement_timeout='90s'; SET LOCAL lock_timeout='3s'")
    if track: c.execute("SET LOCAL track_functions='all'")
    c.execute('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES (\'SYN-R051-RECV-LISA\',\'ch:lisa\',\'Synthetic receiving Lisa\',\'Synthetic\'),(\'SYN-R051-RECV-DAD\',\'ch:dad\',\'Synthetic receiving Dad\',\'Synthetic\')')
    c.execute('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES (\'SYN-R051-RECV-B\',\'Synthetic receiving performance\')')
    c.execute('INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account") VALUES (\'SYN-R051-RECV-L\',\'SYN-R051-RECV-B\',current_date-30,1000::money,\'ยังไม่ปิดยอด\',\'ดอกเบี้ยรายวัน\',false,10::money,\'SYN-R051-RECV-LISA\')')
    n = 20 if case.endswith('_20') else 5
    c.execute('INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") SELECT \'SYN-R051-RECV-C\'||i,\'SYN-R051-RECV-L\',current_date-i,0::money,10::money FROM generate_series(1,%s) i',(n,))
    if case == 'loan_close':
        c.execute('UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=\'SYN-R051-RECV-L\'')
    c.execute('SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED')

def receipt(method, amount, target=None):
    return ('INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account") '
            "VALUES ('SYN-R051-RECV-P','SYN-R051-RECV-B','Processing',"+str(amount)+"::money,current_date,'"+method+"',"+("'"+target+"'" if target else 'NULL')+",'SYN-R051-RECV-DAD')")

cases = {
    'single_full': 'UPDATE "Charges" SET "Payment Request Cash Account"=\'SYN-R051-RECV-DAD\',"Payment Request Token"=current_date||\'|receivingperf\' WHERE "Row ID"=\'SYN-R051-RECV-C1\'',
    'single_partial': receipt('Single Partial',5,'SYN-R051-RECV-C1'),
    'receive_all_5': 'UPDATE "Borrowers" SET "Payment Request Cash Account"=\'SYN-R051-RECV-DAD\',"Payment Request Token"=current_date||\'|receivingperf\' WHERE "Row ID"=\'SYN-R051-RECV-B\'',
    'receive_all_20': 'UPDATE "Borrowers" SET "Payment Request Cash Account"=\'SYN-R051-RECV-DAD\',"Payment Request Token"=current_date||\'|receivingperf\' WHERE "Row ID"=\'SYN-R051-RECV-B\'',
    'lump_sum': receipt('Lump Sum',25),
    'loan_close': 'UPDATE "Loans" SET "Payment Request Cash Account"=\'SYN-R051-RECV-DAD\',"Payment Request Token"=current_date||\'|receivingperf\' WHERE "Row ID"=\'SYN-R051-RECV-L\'',
}
