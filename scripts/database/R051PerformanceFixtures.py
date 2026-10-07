"""Bounded synthetic fixture and operation definitions shared by profilers. No connection or writes on import."""
def counts(c):
    return {name: {'calls': calls, 'total_ms': total, 'self_ms': own}
            for name, calls, total, own in c.execute('SELECT schemaname||\'.\'||funcname,calls,total_time,self_time FROM pg_stat_xact_user_functions')}


def setup(c, receipt, track=True):
    c.execute("SET LOCAL timezone='Asia/Bangkok'; SET LOCAL statement_timeout='90s'; SET LOCAL lock_timeout='3s'")
    if track: c.execute("SET LOCAL track_functions='all'")
    c.execute('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES (\'SYN-R051-PERF-LISA\',\'ch:lisa\',\'Synthetic performance Lisa\',\'Synthetic\'),(\'SYN-R051-PERF-DAD\',\'ch:dad\',\'Synthetic performance Dad\',\'Synthetic\')')
    c.execute('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES (\'SYN-R051-PERF-B\',\'Synthetic performance\')')
    c.execute('INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Ref Disbursed From Cash Account") VALUES (\'SYN-R051-PERF-L\',\'SYN-R051-PERF-B\',current_date-30,1000::money,\'ยังไม่ปิดยอด\',\'กำหนดวันชำระ\',false,\'SYN-R051-PERF-LISA\')')
    c.execute('INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") SELECT \'SYN-R051-PERF-C\'||i,\'SYN-R051-PERF-L\',current_date-30,0::money,10::money FROM generate_series(1,10) i')
    c.execute('INSERT INTO "Business Expenses"("Row ID","Expense Date","Amount","Expense Category","Source Type","Ref Related Borrower","Ref Paid By Cash Account") VALUES (\'SYN-R051-PERF-E\',current_date-1,10::money,\'Other / อื่น ๆ\',\'Manual\',\'SYN-R051-PERF-B\',\'SYN-R051-PERF-LISA\')')
    if receipt:
        c.execute(ADD)
    c.execute('SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED')


ADD = 'INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Received By Cash Account") VALUES (\'SYN-R051-PERF-P\',\'SYN-R051-PERF-B\',\'Processing\',50::money,current_date,\'Lump Sum\',\'SYN-R051-PERF-DAD\')'
cases = {
    'receipt_add': ADD,
    'receipt_amount': 'UPDATE "Payments" SET "Amount Received"=60::money WHERE "Row ID"=\'SYN-R051-PERF-P\'',
    'receipt_delete': 'DELETE FROM "Payments" WHERE "Row ID"=\'SYN-R051-PERF-P\'',
    'receipt_backdated': 'UPDATE "Payments" SET "Amount Received"=60::money,"Payment Date"=current_date-25 WHERE "Row ID"=\'SYN-R051-PERF-P\'',
    'receipt_metadata': 'UPDATE "Payments" SET "Notes"=\'Synthetic metadata\' WHERE "Row ID"=\'SYN-R051-PERF-P\'',
    'expense_amount': 'UPDATE "Business Expenses" SET "Amount"=12::money WHERE "Row ID"=\'SYN-R051-PERF-E\'',
}
