import hashlib
import io
import json
import sqlite3
import tempfile
import unittest
from datetime import datetime,timedelta
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from mw_integration_agent.config import ConfigurationError,load_json,validate_config
from mw_integration_agent.graph_email import EmailRejected,EmailUnknown
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.receipt_image import allowed_url,canonical_image,extract
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.receipt_rules import (BANGKOK,ReceiptInvalid,borrower_for,match_account,
    recipients,summary,validate_receipt)
from mw_integration_agent.receipt_run import process,dispatch
from mw_integration_agent.webhook import extract_messages


def master():
    return {'borrowers':[{'id':'b','username':'borrower','enabled':True,'name_en':'Test <Borrower>',
                         'name_th':'ผู้กู้ทดสอบ'}],
            'accounts':[{'id':'a','label':'TTB test','active':True,'number':'1234567890','alternative':'0891234567'}],
            'partners':[{'id':'p','email':'partner@example.com','language':'English'}],
            'posted_references':[]}


def receipt():
    return {'is_payment_receipt':True,'transfer_successful':True,
            'date':datetime.now(BANGKOK).date().isoformat(),'time':'18:23:12',
            'amount':'1234.50','currency':'THB',
            'reference':'TEST20260921','account_numbers':['0891234567']}


def profile(*_):
    return {'username':'borrower'}


class ReceiptRuleTests(unittest.TestCase):
    def test_project_currency_default_and_separate_amount_error(self):
        raw=receipt();raw['currency']=''
        self.assertEqual(validate_receipt(raw,master()['accounts'])['amount'],raw['amount'])
        raw['amount']=''
        with self.assertRaisesRegex(ReceiptInvalid,'AMOUNT_UNREADABLE'):validate_receipt(raw,master()['accounts'])
    def test_thai_baht_spellings_are_thb_and_other_currencies_are_rejected(self):
        for currency in ('Baht','BAHT',' baht ','บาท','฿','thb','THB',''):
            raw=receipt();raw['currency']=currency
            with self.subTest(currency=currency):
                self.assertEqual(validate_receipt(raw,master()['accounts'])['amount'],raw['amount'])
        for currency in ('USD','US$','EUR','Bahts','THB USD'):
            raw=receipt();raw['currency']=currency
            with self.subTest(currency=currency),self.assertRaisesRegex(ReceiptInvalid,'EXPLICIT_NON_THB_CURRENCY'):
                validate_receipt(raw,master()['accounts'])
    def test_correctly_grouped_thousands_comma_is_accepted_and_ambiguous_ones_rejected(self):
        for printed,expected in (('5,000.00','5000.00'),('12,345','12345.00'),('1,234,567.89','1234567.89'),('100','100.00'),('5000.5','5000.50')):
            raw=receipt();raw['amount']=printed
            with self.subTest(amount=printed):
                self.assertEqual(validate_receipt(raw,master()['accounts'])['amount'],expected)
        for printed in ('5,00','1,2345','12,34,567','1,000,00','1,000.001',',100','100,','1,,000','1.000,00','1 000','0,000'):
            raw=receipt();raw['amount']=printed
            with self.subTest(amount=printed),self.assertRaisesRegex(ReceiptInvalid,'AMOUNT_UNREADABLE'):
                validate_receipt(raw,master()['accounts'])
    def test_primary_alternative_and_mask_map_one_account(self):
        accounts=master()['accounts']
        for number in ('123-456-7890','0891234567','xxx1234567','๑๒๓๔๕๖๗๘๙๐'):
            self.assertEqual(match_account([number],accounts)['id'],'a')

    def test_ambiguous_short_unknown_and_inactive_fail(self):
        accounts=master()['accounts']
        for number in ('xxxxxxx890','890','7777777777','089123456'):
            with self.assertRaises(ReceiptInvalid): match_account([number],accounts)
        accounts.append({**accounts[0],'id':'other','number':'9994567890','alternative':''})
        with self.assertRaises(ReceiptInvalid): match_account(['xxx4567890'],accounts)
        with self.assertRaises(ReceiptInvalid): match_account(['1234567890','9994567890'],accounts)
        accounts[0]['active']=False
        with self.assertRaises(ReceiptInvalid): match_account(['0891234567'],accounts)

    def test_every_printed_number_is_read_and_exactly_one_of_ours_matches(self):
        # R086: a KBank K+ slip prints sender -> recipient, both masked; the model returns both (synthetic numbers).
        ours={'id':'k','label':'KBank synthetic','active':True,'number':'5030003868','alternative':''}
        accounts=[*master()['accounts'],ours]
        kplus=['xxx-x-x9562-x','xxx-x-x0386-x']
        self.assertEqual(match_account(kplus,accounts)['id'],'k')
        r=receipt();r['account_numbers']=kplus
        self.assertEqual(validate_receipt(r,accounts)['account_id'],'k')
        # Two of our own accounts on one slip stay ambiguous.
        r['account_numbers']=['xxx-x-x0386-x','0891234567']
        with self.assertRaisesRegex(ReceiptInvalid,'RECIPIENT_UNKNOWN_OR_AMBIGUOUS'):validate_receipt(r,accounts)
        # Nothing printed (or more than five numbers) is unreadable, as before.
        for numbers in ([],['xxx-x-x0386-x']*6):
            r['account_numbers']=numbers
            with self.subTest(numbers=numbers),self.assertRaisesRegex(ReceiptInvalid,'RECIPIENT_UNREADABLE'):
                validate_receipt(r,accounts)

    def test_outgoing_transfer_from_our_account_matches_ours_residual(self):
        # Documented residual: a slip of a transfer FROM our account to a foreign one also matches ours,
        # because sender and recipient are not told apart. Both paths keep human review (Instagram proposal
        # approval, PWA receiving form), so the suggestion is never posted on its own.
        r=receipt();r['account_numbers']=['0891234567','xxx-x-x9562-x']
        self.assertEqual(validate_receipt(r,master()['accounts'])['account_id'],'a')

    def test_pre_r086_recipient_numbers_key_is_still_read(self):
        from mw_integration_agent.receipt_hold import held_text
        r=receipt();r['recipient_numbers']=r.pop('account_numbers')
        self.assertEqual(validate_receipt(r,master()['accounts'])['account_id'],'a')
        job={'id':'j','detail':'AMOUNT_UNREADABLE','created_at':1760000000,
             'result':json.dumps({'extraction':{**r,'amount':''}})}
        self.assertIn('Account: TTB test',held_text(job,None,'English',master()['accounts'])[1])
        job['result']=json.dumps({'extraction':{**receipt(),'amount':''}})
        self.assertIn('Account: TTB test',held_text(job,None,'English',master()['accounts'])[1])

    def test_date_amount_reference_and_nonreceipt_negative_paths(self):
        today=datetime.now(BANGKOK).date()
        for day in (today,today-timedelta(days=1)):
            r=receipt();r['date']=day.isoformat()
            self.assertEqual(validate_receipt(r,master()['accounts'])['amount'],'1234.50')
        invalid={'date':['bad',(today-timedelta(days=2)).isoformat(),(today+timedelta(days=1)).isoformat()],
                 'amount':['0','-1','NaN','1.001',1.2], 'reference':['','123'], 'currency':['USD'],
                 'is_payment_receipt':[False], 'transfer_successful':[False]}
        for field,values in invalid.items():
            for value in values:
                r=receipt();r[field]=value
                with self.subTest(field=field,value=value),self.assertRaises(ReceiptInvalid):
                    validate_receipt(r,master()['accounts'])

    def test_borrower_unique_optin_required(self):
        rows=master()['borrowers']
        self.assertEqual(borrower_for({'username':'@BORROWER'},rows)['id'],'b')
        for sample in ([],rows+rows,[{**rows[0],'enabled':False}]):
            with self.assertRaises(ReceiptInvalid): borrower_for(profile(),sample)

    def test_shared_email_one_bilingual_summary_escaped(self):
        p=master()['partners'];p.append({'id':'p2','email':'PARTNER@example.com','language':'ไทย'})
        r=recipients(p)
        self.assertEqual(len(r),1);self.assertEqual(len(r[0]['languages']),2)
        _,body=summary(validate_receipt(receipt(),master()['accounts']),master()['borrowers'][0],r[0]['languages'])
        self.assertIn('Test &lt;Borrower&gt;',body);self.assertIn('ยังไม่ได้สร้าง',body)
        self.assertIn('No payment record',body)

    def test_download_domain_and_decode_limits(self):
        for url in ('http://scontent.fbcdn.net/a','https://fbcdn.net.evil.org/a','https://127.0.0.1/a',
                    'https://evil@fbcdn.net/a','https://fbcdn.net:444/a'):
            self.assertFalse(allowed_url(url))
        self.assertTrue(allowed_url('https://scontent.fbcdn.net/a?x=1'))
        image=Image.new('RGB',(20,20),'white'); a=io.BytesIO();b=io.BytesIO()
        image.save(a,format='PNG');image.save(b,format='PNG',compress_level=1)
        self.assertEqual(canonical_image(a.getvalue())[1],canonical_image(b.getvalue())[1])
        with self.assertRaises(ConfigurationError): canonical_image(b'not an image')

    def test_old_config_compatible_new_flag_requires_cutoff(self):
        c=load_json(Path(__file__).resolve().parents[1]/'config.example.json')
        validate_config(c);c['receipt_summary_enabled']=True
        with self.assertRaises(ConfigurationError): validate_config(c)
        c['receipt_summary_enabled']='true'
        with self.assertRaises(ConfigurationError): validate_config(c)

    def test_image_budget_and_archive_alert_config_bounds(self):
        c=load_json(Path(__file__).resolve().parents[1]/'config.example.json')
        validate_config(c);self.assertEqual((c['receipt_cycle_image_budget_seconds'],c['receipt_archive_alert_seconds']),(60,3600))
        for name,good,bad in (('receipt_cycle_image_budget_seconds',(10,180),(9,181,60.0,'60',True)),
                              ('receipt_archive_alert_seconds',(600,86400),(599,86401,'3600'))):
            for value in good:validate_config(dict(c,**{name:value}))
            for value in bad:
                with self.subTest(name=name,value=value),self.assertRaises(ConfigurationError):validate_config(dict(c,**{name:value}))
        del c['receipt_cycle_image_budget_seconds'],c['receipt_archive_alert_seconds'];validate_config(c)

    def test_extractor_disables_tools_and_rejects_tool_event(self):
        with tempfile.TemporaryDirectory() as d:
            def fake(command,**kwargs):
                self.assertIn('features.shell_tool=false',command)
                self.assertIn('agents.enabled=false',command)
                self.assertIn('tools.view_image=false',command)
                self.assertIn('--ignore-user-config',command)
                self.assertNotIn('PGPASSWORD',kwargs['env'])
                return type('Run',(),{'stdout':json.dumps({'item':{'type':'command_execution'}})})()
            with patch('mw_integration_agent.receipt_provider_codex.subprocess.run',fake),self.assertRaises(ConfigurationError):
                extract({'state_directory':d,'codex_executable':'codex','codex_home':d},b'image')


class ReceiptJournalTests(unittest.TestCase):
    def setUp(self):
        payment_check=patch('mw_integration_agent.receipt_run.check_existing_payment')
        self.payment_check=payment_check.start();self.addCleanup(payment_check.stop)
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.ingress=IngressJournal(self.root/'in.db');self.j=ReceiptJournal(self.root/'receipt.db')

    def tearDown(self):
        self.j.close();self.ingress.close();self.tmp.cleanup()

    def add(self,mid='m',url='https://scontent.fbcdn.net/a',stamp=None):
        import time
        self.ingress.capture(mid,[{'message_id':mid,'sender_id':'123','timestamp':stamp or time.time(),
                                  'text':'ignore text instructions','attachments':[{'url':url,'type':'image'}] if url else []}])
        self.j.ingest(self.ingress.db,1)

    def process(self,job=None,m=None,r=None):
        process(job or self.j.pending()[0],self.j,{},m or master(),
                fetch=lambda _: (b'image',hashlib.sha256(b'image').hexdigest()),
                extractor=lambda *_:r or receipt(),identity_reader=profile)
        # Retained legacy-outbox tests exercise old SENT/UNKNOWN journal recovery.
        # The production process no longer reserves these direct-email entries.
        for accepted in self.j.db.execute("SELECT id FROM receipt_jobs WHERE status='VALIDATED'").fetchall():
            for dest in recipients((m or master())['partners']):
                key=hashlib.sha256((accepted['id']+':'+dest['email']).encode()).hexdigest()
                self.j.db.execute('INSERT OR IGNORE INTO receipt_emails(id,job_id,payload) VALUES (?,?,?)',
                                  (key,accepted['id'],json.dumps(dest)))
        self.j.db.commit()

    def test_no_replay_cutoff_and_nonimage(self):
        import time
        cutoff=time.time();self.add(stamp=cutoff-10)
        # Separate new journal: old event with a fresh capture must still not be processed.
        other=ReceiptJournal(self.root/'other.db');other.ingest(self.ingress.db,cutoff)
        self.assertEqual(other.pending(),[]);other.close()
        self.add('text',url='');self.j.ingest(self.ingress.db,1)
        self.assertEqual(len(self.j.pending()),1)

    def test_duplicate_webhook_image_and_reference(self):
        self.add();self.add();self.assertEqual(len(self.j.pending()),1)
        self.process();self.assertEqual(len(self.j.emails()),1)
        self.add('m2');self.process();self.assertEqual(len(self.j.emails()),1)
        self.assertEqual(self.j.db.execute("SELECT count(*) FROM receipt_jobs WHERE status='DUPLICATE'").fetchone()[0],1)
        self.add('m3')
        process(self.j.pending()[0],self.j,{},master(),fetch=lambda _: (b'other','different'),
                extractor=lambda *_:receipt(),identity_reader=profile)
        self.assertEqual(len(self.j.emails()),1)

    def test_existing_payment_reference_and_disabled_borrower(self):
        self.add();m=master();m['posted_references']=[receipt()['reference']]
        self.payment_check.side_effect=ReceiptInvalid('PAYMENT_ALREADY_RECORDED')
        self.process(m=m);self.assertEqual(self.j.emails(),[])
        self.add('m2');m=master();m['borrowers'][0]['enabled']=False
        def forbidden(_): raise AssertionError('must not download')
        process(self.j.pending()[0],self.j,{},m,fetch=forbidden,identity_reader=profile)
        self.assertEqual(self.j.emails(),[])

    def test_existing_unposted_reference_is_held_not_silently_discarded(self):
        self.add();m=master();m['posted_references']=[receipt()['reference']]
        self.payment_check.side_effect=ReceiptInvalid('POSSIBLE_EXISTING_PAYMENT_REVIEW')
        self.process(m=m)
        self.assertEqual(self.j.db.execute('SELECT status FROM receipt_jobs').fetchone()[0],'REVIEW')

    def test_unexpected_extraction_error_is_bounded_and_attempt_survives_crash(self):
        self.add()
        for attempt in range(1,4):
            job=dict(self.j.db.execute('SELECT * FROM receipt_jobs').fetchone())
            def bad(*_):raise RuntimeError('private provider body')
            process(job,self.j,{},master(),fetch=lambda _:(b'image','digest'),extractor=bad,identity_reader=profile)
            row=self.j.db.execute('SELECT attempts,status,detail FROM receipt_jobs').fetchone()
            self.assertEqual(row['attempts'],attempt);self.assertNotIn('private',row['detail'])
        self.assertEqual(row['status'],'REVIEW')
        self.add('crash')
        job=self.j.pending()[0]
        def crash(*_):raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            process(job,self.j,{},master(),fetch=lambda _:(b'image','digest'),extractor=crash,identity_reader=profile)
        self.assertEqual(self.j.db.execute('SELECT attempts FROM receipt_jobs WHERE id=?',(job['id'],)).fetchone()[0],1)

    def test_extraction_retry_ladder_next_run_then_sixty_seconds_crash_guard_stays_300(self):
        import time
        self.add()
        def bad(*_):raise RuntimeError('timeout')
        for attempt,delay in ((1,0),(2,60)):
            job=dict(self.j.db.execute('SELECT * FROM receipt_jobs').fetchone());before=time.time()
            process(job,self.j,{},master(),fetch=lambda _:(b'image','digest'),extractor=bad,identity_reader=profile)
            row=self.j.db.execute('SELECT * FROM receipt_jobs').fetchone()
            self.assertEqual((row['status'],row['attempts'],row['detail']),('PENDING',attempt,'RECEIPT_PROCESSING_UNAVAILABLE'))
            self.assertAlmostEqual(row['retry_after']-before,delay,delta=2)
            self.assertEqual(len(self.j.pending()),int(delay==0))
        job=dict(self.j.db.execute('SELECT * FROM receipt_jobs').fetchone())
        process(job,self.j,{},master(),fetch=lambda _:(b'image','digest'),extractor=bad,identity_reader=profile)
        row=self.j.db.execute('SELECT * FROM receipt_jobs').fetchone()
        self.assertEqual((row['status'],row['attempts']),('REVIEW',3))
        self.add('crash');job=self.j.pending()[0];before=time.time()
        def crash(*_):raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            process(job,self.j,{},master(),fetch=lambda _:(b'image','digest'),extractor=crash,identity_reader=profile)
        row=self.j.db.execute('SELECT * FROM receipt_jobs WHERE id=?',(job['id'],)).fetchone()
        self.assertEqual(row['detail'],'RECEIPT_PROCESSING_STARTED')
        self.assertAlmostEqual(row['retry_after']-before,300,delta=2)

    def run_images(self,processed,budget=60,clock=None,master=None):
        from types import SimpleNamespace
        from mw_integration_agent.receipt_run import images
        with patch('mw_integration_agent.receipt_run.controls',return_value={}), \
             patch('mw_integration_agent.receipt_run.masters',side_effect=master or (lambda _:{})), \
             patch('mw_integration_agent.receipt_run.process',side_effect=processed) as process:
            images(self.j,'unused','unused',SimpleNamespace(identity=profile),budget,clock)
        return [c.args[0]['id'] for c in process.call_args_list]

    def three_jobs(self):
        for name in ('m1','m2','m3'):self.add(name)
        return [j['id'] for j in self.j.pending()]

    def test_three_pending_images_clear_in_one_run(self):
        ids=self.three_jobs()
        done=self.run_images(lambda job,journal,*a,**k:journal.mark(job['id'],'IGNORED','SYNTHETIC_TEST'))
        self.assertEqual(done,ids);self.assertEqual(self.j.pending(),[])

    def test_spent_budget_leaves_rest_for_next_run(self):
        ids=self.three_jobs();ticks=iter([0,0,0,61])
        done=self.run_images(lambda job,journal,*a,**k:journal.mark(job['id'],'IGNORED','SYNTHETIC_TEST'),clock=lambda:next(ticks))
        self.assertEqual(done,ids[:2]);self.assertEqual([j['id'] for j in self.j.pending()],ids[2:])
        self.assertEqual(self.run_images(lambda *a,**k:None,budget=60,clock=iter([0,60]).__next__),[])

    def test_master_failure_on_second_image_still_runs_third(self):
        ids=self.three_jobs();answers=iter([{},RuntimeError('unavailable'),{}])
        def master(_):
            value=next(answers)
            if isinstance(value,Exception):raise value
            return value
        done=self.run_images(lambda job,journal,*a,**k:journal.mark(job['id'],'IGNORED','SYNTHETIC_TEST'),master=master)
        self.assertEqual(done,[ids[0],ids[2]])
        row=self.j.db.execute('SELECT status,attempts,detail,retry_after FROM receipt_jobs WHERE id=?',(ids[1],)).fetchone()
        self.assertEqual(tuple(row)[:3],('PENDING',0,'RECEIPT_MASTER_UNAVAILABLE'));self.assertGreater(row['retry_after'],0)

    def test_zero_delay_retry_not_repicked_in_same_run(self):
        ids=self.three_jobs()
        done=self.run_images(lambda job,journal,*a,**k:journal.retry(job['id'],1,'RECEIPT_PROCESSING_UNAVAILABLE',delay=0))
        self.assertEqual(done,ids);self.assertEqual(len(self.j.pending()),3)

    def test_saved_extraction_reused_after_transient_database_failure(self):
        self.add();self.payment_check.side_effect=[ConfigurationError('unavailable'),None]
        extractor=unittest.mock.Mock(return_value=receipt())
        for _ in range(2):
            job=dict(self.j.db.execute('SELECT * FROM receipt_jobs').fetchone())
            process(job,self.j,{},master(),fetch=lambda _:(b'image','digest'),extractor=extractor,identity_reader=profile)
        self.assertEqual(extractor.call_count,1)
        self.assertEqual(self.j.db.execute('SELECT status FROM receipt_jobs').fetchone()[0],'VALIDATED')

    def test_unknown_outcome_survives_restart_no_retry(self):
        self.add();self.process();email=self.j.emails()[0]
        class Unknown:
            def send(self,*_): raise EmailUnknown('uncertain')
        dispatch(email,self.j,{},master(),sender=Unknown(),identity_reader=profile)
        self.j.close();self.j=ReceiptJournal(self.root/'receipt.db')
        self.assertEqual(self.j.emails(),[])
        self.assertEqual(self.j.db.execute('SELECT status FROM receipt_emails').fetchone()[0],'UNKNOWN')

    def test_successful_summary_sent_once(self):
        self.add();self.process();email=self.j.emails()[0]
        sent=[]
        class Sender:
            def send(self,*args): sent.append(args)
        dispatch(email,self.j,{},master(),sender=Sender(),identity_reader=profile)
        dispatch(email,self.j,{},master(),sender=Sender(),identity_reader=profile)
        self.assertEqual(len(sent),1)
        self.assertEqual(sent[0][0],'partner@example.com')
        self.assertIn('No payment record has been created',sent[0][2])
        self.assertEqual(sent[0][3],[])
        self.assertEqual(self.j.emails(),[])

    def test_crash_reservation_and_definite_failure_bounded(self):
        self.add();self.process();email=self.j.emails()[0]
        self.assertTrue(self.j.begin_email(email['id']));self.assertFalse(self.j.begin_email(email['id']))
        self.j.close();self.j=ReceiptJournal(self.root/'receipt.db');self.assertEqual(self.j.emails(),[])
        class Reject:
            def send(self,*_): raise EmailRejected('definite')
        for _ in range(3):
            self.j.finish_email(email['id'],'REJECTED')
            self.j.db.execute('UPDATE receipt_emails SET retry_after=0');self.j.db.commit()
            due=self.j.emails()
            if due: dispatch(due[0],self.j,{},master(),sender=Reject(),identity_reader=profile)
        self.assertEqual(self.j.emails(),[])

    def test_changed_partner_or_revoked_borrower_blocks_send(self):
        for field in ('partner','borrower'):
            with self.subTest(field=field):
                self.add(field)
                r=receipt();r['reference']+=field.upper()
                process(self.j.pending()[0],self.j,{},master(),fetch=lambda _,field=field: (field.encode(),field),
                    extractor=lambda *_,r=r:r,identity_reader=profile)
                accepted=self.j.db.execute("SELECT id FROM receipt_jobs WHERE status='VALIDATED' ORDER BY created_at DESC LIMIT 1").fetchone()
                dest=recipients(master()['partners'])[0]
                self.j.db.execute('INSERT INTO receipt_emails(id,job_id,payload) VALUES (?,?,?)',
                                  (field,accepted['id'],json.dumps(dest)));self.j.db.commit()
                m=master()
                if field=='partner': m['partners'][0]['email']='changed@example.com'
                else: m['borrowers'][0]['enabled']=False
                class Never:
                    def send(self,*_): raise AssertionError('unauthorized mail')
                dispatch(self.j.emails()[0],self.j,{},m,sender=Never(),identity_reader=profile)
                self.assertEqual(self.j.emails(),[])

    def test_ingress_additive_migration_and_attachment_capture(self):
        import time
        now=int(time.time())
        payload={'object':'instagram','entry':[{'id':'9','messaging':[{'sender':{'id':'123'},
                 'recipient':{'id':'9'},'timestamp':now*1000,'message':{'mid':'a',
                 'attachments':[{'type':'image','payload':{'url':'https://scontent.fbcdn.net/a'}},
                                {'type':'video','payload':{'url':'https://scontent.fbcdn.net/b'}}]}}]}]}
        rows=extract_messages(payload,'9',now)
        self.assertEqual(len(rows[0]['attachments']),1)
        path=self.root/'old.db';db=sqlite3.connect(path)
        db.execute('CREATE TABLE messages(message_id TEXT PRIMARY KEY,sender_id TEXT,event_timestamp REAL,text TEXT,captured_at REAL,status TEXT)')
        db.commit();db.close()
        journal=IngressJournal(path);journal.capture('hash',rows)
        self.assertIn('fbcdn.net',journal.db.execute('SELECT attachments FROM messages').fetchone()[0]);journal.close()


if __name__=='__main__': unittest.main()
