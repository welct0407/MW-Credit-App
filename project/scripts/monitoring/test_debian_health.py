from contextlib import contextmanager
import datetime as dt
import importlib.util
import pathlib
import sys
import unittest
from unittest.mock import Mock,patch

spec=importlib.util.spec_from_file_location('health', pathlib.Path(__file__).with_name('debian-health.py'))
health=importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)

class TimerHealthTests(unittest.TestCase):
    def test_completion_timestamp_uses_monotonic_age(self):
        self.assertEqual(health.completion_epoch({'ExecMainExitTimestampMonotonic':'950000000'},1000,1800000000),1799999950)
    def test_missing_or_future_completion_is_unavailable(self):
        self.assertEqual(health.completion_epoch({},1000,1800000000),0)
        self.assertEqual(health.completion_epoch({'ExecMainExitTimestampMonotonic':'2000000000'},1000,1800000000),0)
    def test_group_cannot_hide_failed_member(self):
        self.assertEqual(health.combine([0,1]),0)
        self.assertEqual(health.combine([1,4]),4)
    def test_idle_success_is_healthy(self):
        self.assertEqual(self.check(), 1)
    def test_failed_job_is_down(self):
        self.assertEqual(self.check(Result='exit-code'), 0)
    def test_stale_success_is_degraded(self):
        self.assertEqual(self.check(ExecMainExitTimestampMonotonic='1000000'), 2)
    def test_disabled_timer_is_down(self):
        self.assertEqual(self.check(timer={'LoadState':'loaded','ActiveState':'inactive'}), 0)
    def test_running_job_not_marked_down(self):
        self.assertEqual(self.check(ActiveState='activating',ExecMainStartTimestampMonotonic='950000000'), 1)
    def test_stuck_job_is_degraded(self):
        self.assertEqual(self.check(ActiveState='activating',ExecMainStartTimestampMonotonic='1000000'), 2)
    def test_unseen_unit_is_unknown(self):
        self.assertEqual(self.check(LoadState='not-found'), 4)
    def check(self,timer=None,**kw):
        service=dict(LoadState='loaded',ActiveState='inactive',Result='success',ExecMainStatus='0',ExecMainExitTimestampMonotonic='950000000')
        service.update(kw)
        return health.timer_status(service,timer or {'LoadState':'loaded','ActiveState':'active'},1000,dt.datetime(2026,9,22,12),180,300)

class ReceiptSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.values={k:0 for k in ('pending_images','validated_receipts','held_receipts','pending_reviews','approved_payments','completed_payments','oldest_pending_seconds','stalled_jobs','unnotified_holds','unconfirmed_postings','undelivered_reviews','overdue_reviews','failed_notifications')}
        self.values['status']=1
    def test_extra_integer_fields_such_as_ingress_review_open_are_exported(self):
        self.values['ingress_review_open']=4
        snapshot=health.receipt_snapshot({'receipt_summary_enabled':True},Mock(return_value=1),Mock(return_value=self.values))
        self.assertEqual((snapshot['status'],snapshot['ingress_review_open']),(1,4))
    def test_recent_queue_is_not_failure(self):
        self.values['pending_images']=2
        self.assertEqual(health.receipt_snapshot({'receipt_summary_enabled':True},Mock(return_value=1),Mock(return_value=self.values))['status'],1)
    def test_database_and_import_failure_are_down_not_empty(self):
        c={'receipt_summary_enabled':True};job=Mock(return_value=1)
        result=health.receipt_snapshot(c,job,Mock(side_effect=RuntimeError()))
        self.assertEqual(result,{'status':0,'inspection_failed':1})
        with patch.dict('sys.modules',{'mw_integration_agent.receipt_health':None}):
            self.assertEqual(health.receipt_snapshot(c,job),result)
    def test_paused_has_no_queue_counts_and_does_not_inspect(self):
        inspector=Mock();job=Mock()
        self.assertEqual(health.receipt_snapshot({},job,inspector),{'status':3})
        inspector.assert_not_called();job.assert_not_called()
    def test_missing_or_invalid_fields_fail_closed(self):
        for value in ({'status':1},dict(self.values,pending_images=-1),dict(self.values,status=99)):
            self.assertEqual(health.receipt_snapshot({'receipt_summary_enabled':True},Mock(return_value=1),Mock(return_value=value))['status'],0)
    def test_service_failure_cannot_be_hidden_by_healthy_queue(self):
        self.assertEqual(health.receipt_snapshot({'receipt_summary_enabled':True},Mock(return_value=0),Mock(return_value=self.values))['status'],0)

class RelaySnapshotTests(unittest.TestCase):
    def setUp(self):
        self.values={'status':1,'completed_at':990,'completed_success':1,'backlog':0,
                     'oldest_unexported_seconds':0,'missing_intents':0,'running':0,'inspection_failed':0}
    def test_running_systemd_success_cannot_hide_previous_failure(self):
        self.values.update(status=0,completed_success=0,running=1)
        result=health.relay_snapshot({},Mock(return_value=1),Mock(return_value=self.values))
        self.assertEqual(result['status'],0)
    def test_valid_completed_success_and_empty_backlog_are_healthy(self):
        self.assertEqual(health.relay_snapshot({},Mock(return_value=1),Mock(return_value=self.values))['status'],1)
    def test_backlog_degradation_survives_running_service(self):
        self.values.update(status=2,backlog=1,oldest_unexported_seconds=200,running=1)
        self.assertEqual(health.relay_snapshot({},Mock(return_value=1),Mock(return_value=self.values))['status'],2)
    def test_failed_missing_or_invalid_inspection_fails_closed(self):
        for inspector in (Mock(side_effect=RuntimeError()),Mock(return_value={}),
                          Mock(return_value=dict(self.values,backlog=-1))):
            self.assertEqual(health.relay_snapshot({},Mock(return_value=1),inspector),{'status':0,'inspection_failed':1})
    def test_disabled_timer_or_failed_properties_cannot_be_hidden(self):
        self.assertEqual(health.relay_snapshot({},Mock(return_value=0),Mock(return_value=self.values))['status'],0)
        self.assertEqual(health.relay_snapshot({},Mock(side_effect=RuntimeError()),Mock(return_value=self.values))['status'],0)

class NativeApiProbeTests(unittest.TestCase):
    def setUp(self):
        self.digest='a'*64
        self.config={'conversation_api_enabled':True,'conversation_api_manifest_sha256':self.digest,
                     'conversation_api_environment':'prod','database_name':'loan_manager_prod',
                     'conversation_api_origin':'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app',
                     'conversation_api_audience':'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app'}
    def result(self,scope='oltp',**values):
        import json
        return Mock(returncode=0,stdout=json.dumps(dict(authenticated=True,scope=scope,count=1,targetVersion=self.digest,**values)))
    def test_disabled_never_uses_old_appsheet_switch(self):
        runner=Mock()
        self.assertEqual(health.native_api_status({'appsheet_enabled':True},'oltp',runner),4)
        runner.assert_not_called()
    def test_explicit_disabled_and_invalid_flag_are_distinct(self):
        for flag,expected in [(False,3),('true',0),(1,0),(None,0)]:
            runner=Mock()
            self.assertEqual(health.native_api_status(dict(self.config,conversation_api_enabled=flag),'oltp',runner),expected)
            runner.assert_not_called()
    def test_wrong_environment_or_binding_never_runs(self):
        for field,value in [('conversation_api_environment','dev'),('database_name','loan_manager_dev'),('conversation_api_origin','https://unreviewed.invalid'),('conversation_api_audience','other')]:
            runner=Mock()
            self.assertEqual(health.native_api_status(dict(self.config,**{field:value}),'oltp',runner),0)
            runner.assert_not_called()
    def test_both_native_scopes_have_fixed_read_only_command(self):
        for scope in ('oltp','olap'):
            runner=Mock(return_value=self.result(scope))
            self.assertEqual(health.native_api_status(self.config,scope,runner),1)
            runner.assert_called_once_with(['/opt/mw-integration-agent/.venv/bin/mw-integration-agent','native-api-probe','--scope',scope,'--config',health.CONFIG,'--catalogue','/etc/mw-integration-agent/service-catalogue.json'],70)
    def test_wrong_scope_manifest_and_unbounded_or_boolean_count_are_down(self):
        import json
        for value in [dict(authenticated=True,scope='olap',count=1,targetVersion=self.digest),dict(authenticated=True,scope='oltp',count=1,targetVersion='b'*64),dict(authenticated=True,scope='oltp',count=2,targetVersion=self.digest),dict(authenticated=True,scope='oltp',count=True,targetVersion=self.digest),dict(authenticated=False,scope='oltp',count=1,targetVersion=self.digest)]:
            self.assertEqual(health.native_api_status(self.config,'oltp',Mock(return_value=Mock(returncode=0,stdout=json.dumps(value)))),0)
    def test_missing_pin_does_not_invoke(self):
        runner=Mock()
        self.assertEqual(health.native_api_status({'conversation_api_enabled':True},'oltp',runner),0)
        runner.assert_not_called()
    def test_subprocess_failure_invalid_output_and_timeout_are_down(self):
        for runner in [Mock(return_value=Mock(returncode=1,stdout='')),Mock(return_value=Mock(returncode=0,stdout='not json')),Mock(side_effect=TimeoutError())]:
            self.assertEqual(health.native_api_status(self.config,'oltp',runner),0)
    def test_unknown_scope_refused_before_subprocess(self):
        runner=Mock()
        with self.assertRaises(ValueError):health.native_api_status(self.config,'other',runner)
        runner.assert_not_called()

class WebhookReadinessTests(unittest.TestCase):
    def test_ready_with_code_version_is_healthy_and_reports_version(self):
        fetch=Mock(return_value='{"ready": true, "code_version": "abc", "started_at": "t", "failed": []}')
        self.assertEqual(health.readiness(fetch),(1,'abc'))
        fetch.assert_called_once_with('http://127.0.0.1:8000/ready')
    def test_not_ready_unavailable_invalid_or_unversioned_is_down(self):
        import urllib.error
        for fetch in [Mock(side_effect=urllib.error.HTTPError('http://127.0.0.1:8000/ready',503,'x',{},None)),Mock(side_effect=TimeoutError()),
                      Mock(return_value='mw-instagram-webhook'),Mock(return_value='[]'),Mock(return_value='{"ready": false, "code_version": "abc"}'),
                      Mock(return_value='{"ready": "true", "code_version": "abc"}'),Mock(return_value='{"ready": true, "code_version": ""}'),
                      Mock(return_value='{"ready": true, "code_version": null}'),Mock(return_value='{"ready": true}')]:
            with self.subTest(fetch=fetch):self.assertEqual(health.readiness(fetch),(0,None))


class ProbeConnection:
    """One fake psycopg connection: records statements, answers SELECT 1 and the uptime read."""
    def __init__(self):
        self.statements=[]
    def execute(self,sql,params=None):
        self.statements.append(sql)
        row=(1,) if sql=='SELECT 1' else ('loan_manager_prod','mw_integration_agent','on',5,dt.datetime.now(dt.UTC))
        return Mock(fetchone=Mock(return_value=row))
    @contextmanager
    def transaction(self):
        yield
    def close(self):
        pass
    def __enter__(self):
        return self
    def __exit__(self,*exc):
        self.close()


def agent_package_available():
    source=pathlib.Path(__file__).parents[3]/'integration-agent'/'src'
    if source.is_dir() and str(source) not in sys.path:
        sys.path.append(str(source))
    try:
        import psycopg  # noqa: F401
        import mw_integration_agent.state  # noqa: F401
    except ImportError:
        return False
    return True


@unittest.skipUnless(agent_package_available(),'integration-agent package and psycopg required')
class DatabaseProbeTests(unittest.TestCase):
    """ALL-ARCH-03: each login follows its auth key; under IAM the first statement is SET ROLE."""
    IAM_USER='mw-integration-agent@clever-oasis-508610-n7.iam'
    CONFIG={'state_backend':'postgres','agent_database_host':'127.0.0.1','agent_database_port':5432,'agent_database_name':'mw_agent',
            'state_generation':'11111111-1111-4111-8111-111111111111','database_host':'127.0.0.1','database_port':5432,
            'database_name':'loan_manager_prod','database_user':'mw_integration_agent'}

    def probe(self,config,load_secret,extras=None):
        from mw_integration_agent import config as agent_config, state
        connections=[]
        def connect(**kwargs):
            connections.append((kwargs,ProbeConnection()));return connections[-1][1]
        with patch('psycopg.connect',side_effect=connect),patch.object(state,'load_secret',load_secret), \
             patch.object(agent_config,'load_secret',load_secret):
            result=health.database_probe(config,extras)
        return result,connections

    def test_r089_reads_share_the_read_only_reporting_connection(self):
        extras={}
        (status,_),connections=self.probe(self.CONFIG,Mock(return_value='synthetic'),extras)
        self.assertEqual(status,1)
        business=connections[1][1].statements
        self.assertIn('SELECT * FROM monitoring.pwa_ops_health_v1()',business)
        self.assertTrue(any('monitoring.pg_stat_statements' in s for s in business))
        self.assertIn('default_transaction_read_only=on',connections[1][0]['options'])
        # The fake answers the uptime row shape, so both reads fail closed instead of exporting it.
        self.assertEqual((extras['ops_health'],extras['pg_stat']),(None,{'status':0}))
        extras={};self.probe(dict(self.CONFIG,database_name='loan_manager_dev'),Mock(return_value='synthetic'),extras)
        self.assertEqual(extras,{})

    def test_iam_logins_set_worker_and_integration_roles_first(self):
        config=dict(self.CONFIG,agent_database_auth='iam',database_auth='iam',database_iam_user=self.IAM_USER)
        (status,sample),connections=self.probe(config,Mock(side_effect=AssertionError('no password file under IAM')))
        self.assertEqual((status,sample[0]['status']),(1,1))
        (central,central_conn),(business,business_conn)=connections
        self.assertEqual(central_conn.statements[0],'SET ROLE mw_agent_worker')
        self.assertEqual(business_conn.statements[0],'SET ROLE mw_integration_agent')
        for kwargs in (central,business):
            self.assertEqual((kwargs['user'],kwargs['port'],'password' in kwargs),(self.IAM_USER,5433,False))
            self.assertIn('default_transaction_read_only=on',kwargs['options'])

    def test_password_logins_are_the_roles_themselves(self):
        (status,sample),connections=self.probe(self.CONFIG,Mock(return_value='synthetic'))
        self.assertEqual((status,sample[0]['status']),(1,1))
        self.assertEqual([(k['user'],k['port']) for k,_ in connections],[('mw_agent_worker',5432),('mw_integration_agent',5432)])
        self.assertFalse([s for _,c in connections for s in c.statements if s.startswith('SET ROLE')])



# R089 (design section A) collector additions. Every external call is a fake; the only socket is a loopback test server.
NOW=1_800_000_000.0
ORIGINS={'pwa_api_reader_prod':'https://mw-credit-app-read-prod-737787224638.asia-southeast1.run.app',
         'pwa_api_command_prod':'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app',
         'pwa_api_reader_dev':'https://mw-credit-app-read-dev-737787224638.asia-southeast1.run.app',
         'pwa_api_command_dev':'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app'}


def iso(seconds_ago):
    return dt.datetime.fromtimestamp(NOW-seconds_ago,dt.timezone.utc).isoformat().replace('+00:00','Z')


class PwaApiHealthTests(unittest.TestCase):
    def test_health_200_is_up_without_credentials(self):
        fetcher=Mock(return_value=(200,'{"ok":true}'))
        for component in health.PWA_API_COMPONENTS:
            self.assertEqual(health.pwa_api_status(component,ORIGINS,fetcher),1)
        self.assertEqual([c.args for c in fetcher.call_args_list],[(ORIGINS[c]+'/health',) for c in health.PWA_API_COMPONENTS])
    def test_any_other_answer_or_failure_is_down(self):
        for fetcher in (Mock(return_value=(503,'')),Mock(return_value=(302,'')),Mock(side_effect=TimeoutError()),Mock(side_effect=OSError())):
            self.assertEqual(health.pwa_api_status('pwa_api_reader_prod',ORIGINS,fetcher),0)
    def test_missing_file_or_unreviewed_origin_is_unknown_and_never_fetched(self):
        for origins in (None,{},dict(ORIGINS,pwa_api_reader_prod='https://example.invalid'),
                        dict(ORIGINS,pwa_api_reader_prod=ORIGINS['pwa_api_reader_dev']),dict(ORIGINS,pwa_api_command_prod=ORIGINS['pwa_api_reader_prod'])):
            fetcher=Mock()
            self.assertIn(health.pwa_api_status('pwa_api_reader_prod',origins,fetcher) if origins is None or origins.get('pwa_api_reader_prod')!=ORIGINS['pwa_api_reader_prod']
                          else health.pwa_api_status('pwa_api_command_prod',origins,fetcher),(4,))
            fetcher.assert_not_called()
        with self.assertRaises(ValueError):health.pwa_api_status('pwa_api_other_prod',ORIGINS,Mock())
    def test_origins_file(self):
        import tempfile,json
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'origins.json'
            self.assertIsNone(health.load_origins(path))
            path.write_text('not json');self.assertIsNone(health.load_origins(path))
            path.write_text('[]');self.assertIsNone(health.load_origins(path))
            path.write_text(json.dumps(ORIGINS));self.assertEqual(health.load_origins(path),ORIGINS)


class BoundedFetchTests(unittest.TestCase):
    """Loopback server only: no redirect is followed and the whole call ends at the deadline."""
    def serve(self,handler):
        import http.server,threading
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        return 'http://127.0.0.1:%d'%server.server_address[1]
    def test_status_body_redirect_and_deadline(self):
        import http.server
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self,*a):pass
            def do_GET(self):
                if self.path=='/redirect':
                    self.send_response(302);self.send_header('Location','/ok');self.end_headers();return
                body=b'{"status":"ok","enabled":true}'
                self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        base=self.serve(Handler)
        self.assertEqual(health.bounded_fetch(base+'/ok'),(200,'{"status":"ok","enabled":true}'))
        self.assertEqual(health.bounded_fetch(base+'/redirect')[0],302)
        ticks=iter([0,0,100])
        with self.assertRaises(TimeoutError):health.bounded_fetch(base+'/ok',clock=lambda:next(ticks))
        with self.assertRaises(ValueError):health.bounded_fetch(base+'/ok',limit=4)


class RecognizerTests(unittest.TestCase):
    CONFIG={'receipt_recognition_listen_host':'10.148.0.2','receipt_recognition_listen_port':8790,'receipt_recognition_provider':'gemini'}
    def test_healthz_states(self):
        for answer,expected in [((200,'{"status":"ok","enabled":true}'),1),((200,'{"status":"ok","enabled":false}'),3),
                                ((200,'{"status":"ok"}'),0),((200,'{"status":"busy","enabled":true}'),0),((503,''),0),((200,'not json'),0)]:
            fetcher=Mock(return_value=answer)
            self.assertEqual(health.recognizer_health(self.CONFIG,fetcher),expected)
            fetcher.assert_called_once_with('http://10.148.0.2:8790/healthz')
        self.assertEqual(health.recognizer_health(self.CONFIG,Mock(side_effect=TimeoutError())),0)
    def test_unconfigured_listener_is_unknown(self):
        fetcher=Mock()
        self.assertEqual(health.recognizer_health({},fetcher),4);fetcher.assert_not_called()
    def test_provider_and_restart_age(self):
        unit={'ActiveState':'active','ActiveEnterTimestampMonotonic':'400000000'}
        self.assertEqual(health.recognizer_timing(self.CONFIG,unit,1000,{'extractions_24h':3}),{'provider':1,'restart_age_seconds':600,'extractions_24h':3})
        self.assertEqual(health.recognizer_timing(dict(self.CONFIG,receipt_recognition_provider='codex'),{'ActiveState':'failed'},1000,{}),{'provider':2,'restart_age_seconds':None})


class GoogleApiTests(unittest.TestCase):
    def fetcher(self,answers,timeouts=None):
        calls=[]
        def fetch(url,headers=None,timeout=None):
            calls.append((url,headers))
            if timeouts is not None:timeouts.append(timeout)
            return answers[len(calls)-1]
        return fetch,calls
    def test_cloud_sql_backup_age_status_type_retention(self):
        import json
        runs={'items':[{'status':'SUCCESSFUL','type':'AUTOMATED','windowStartTime':iso(90000),'endTime':iso(86400)},
                       {'status':'FAILED','type':'AUTOMATED','windowStartTime':iso(3600)}]}
        instance={'settings':{'backupConfiguration':{'transactionLogRetentionDays':7}}}
        fetch,calls=self.fetcher([(200,json.dumps(runs)),(200,json.dumps(instance))])
        self.assertEqual(health.cloud_sql_backup('synthetic-token',NOW,fetch),{'status':0,'age_seconds':86400,'type':1,'log_retention_days':7})
        self.assertEqual(calls[0],('https://sqladmin.googleapis.com/v1/projects/clever-oasis-508610-n7/instances/mw-credit-pg-20261017/backupRuns?maxResults=5',{'Authorization':'Bearer synthetic-token'}))
        fetch,_=self.fetcher([(200,json.dumps({'items':[{'status':'RUNNING','windowStartTime':iso(60)}]+runs['items']})),(200,'{}')])
        self.assertEqual(health.cloud_sql_backup('t',NOW,fetch),{'status':2,'age_seconds':86400,'type':1})
        fetch,_=self.fetcher([(200,'{}'),(200,'{}')])
        self.assertEqual(health.cloud_sql_backup('t',NOW,fetch),{})
        fetch,_=self.fetcher([(403,'')])
        with self.assertRaises(RuntimeError):health.cloud_sql_backup('t',NOW,fetch)
    def test_debian_snapshot_newest_ready(self):
        import json
        items={'items':[{'status':'READY','creationTimestamp':iso(72000)},{'status':'READY','creationTimestamp':iso(160000)},{'status':'CREATING','creationTimestamp':iso(60)}]}
        fetch,calls=self.fetcher([(200,json.dumps(items))])
        self.assertEqual(health.debian_snapshot('t',NOW,fetch),{'age_seconds':72000})
        self.assertIn('filter=sourceDisk%20eq%20.%2Avm-mw-credit-agent',calls[0][0])
        # The Compute API answers 400 to filter plus orderBy; the newest is picked locally.
        self.assertNotIn('orderBy',calls[0][0]);self.assertNotIn('pageToken',calls[0][0])
        self.assertEqual(calls[0][1],{'Authorization':'Bearer t'})
        fetch,_=self.fetcher([(200,'{}')]);self.assertEqual(health.debian_snapshot('t',NOW,fetch),{})
    def test_debian_snapshot_newest_ready_across_pages(self):
        import json
        pages=[{'items':[{'status':'READY','creationTimestamp':iso(160000)},{'status':'CREATING','creationTimestamp':iso(10)}],'nextPageToken':'p/2+'},
               {'items':[{'status':'READY','creationTimestamp':iso(7200)},{'status':'FAILED','creationTimestamp':iso(60)}],'nextPageToken':'p3'},
               {'items':[{'status':'READY','creationTimestamp':iso(90000)}]}]
        timeouts=[];clock=iter([0,0,3,7]).__next__
        fetch,calls=self.fetcher([(200,json.dumps(p)) for p in pages],timeouts)
        self.assertEqual(health.debian_snapshot('t',NOW,fetch,clock=clock),{'age_seconds':7200})
        self.assertEqual(len(calls),3)
        self.assertTrue(all('orderBy' not in url for url,_ in calls))
        self.assertIn('&pageToken=p%2F2%2B',calls[1][0]);self.assertIn('&pageToken=p3',calls[2][0])
        self.assertEqual(timeouts,[10,7,3])  # one shared 10 s deadline across pages
    def test_debian_snapshot_errors_are_visible_not_exported(self):
        import json
        fetch,calls=self.fetcher([(400,'')])
        out=health.debian_snapshot('t',NOW,fetch);self.assertEqual(out,{'error':'http_400'});self.assertEqual(len(calls),1)
        self.assertEqual(health.timing_series('debian_snapshot',out,{},'t'),[])
        self.assertEqual(health.debian_snapshot('t',NOW,Mock(side_effect=TimeoutError())),{'error':'TimeoutError'})
        fetch,_=self.fetcher([(200,'not json')]);self.assertEqual(health.debian_snapshot('t',NOW,fetch),{'error':'JSONDecodeError'})
        fetch,calls=self.fetcher([(200,json.dumps({'items':[],'nextPageToken':'x'}))]*health.SNAPSHOT_PAGES)
        self.assertEqual(health.debian_snapshot('t',NOW,fetch),{'error':'too_many_pages'});self.assertEqual(len(calls),health.SNAPSHOT_PAGES)
        fetch,calls=self.fetcher([(200,json.dumps({'items':[],'nextPageToken':'x'}))]*2)
        self.assertEqual(health.debian_snapshot('t',NOW,fetch,clock=iter([0,0,10]).__next__),{'error':'TimeoutError'});self.assertEqual(len(calls),1)


class AgentUnitTests(unittest.TestCase):
    def test_audit_retention_result_and_age(self):
        unit=dict(LoadState='loaded',Result='success',ExecMainStatus='0',ExecMainExitTimestampMonotonic='900000000')
        self.assertEqual(health.audit_retention(unit,1000,NOW),{'result':1,'age_seconds':100})
        self.assertEqual(health.audit_retention(dict(unit,Result='exit-code',ExecMainStatus='1'),1000,NOW)['result'],0)
        self.assertEqual(health.audit_retention({'LoadState':'not-found'},1000,NOW),{})
    def test_code_version_match(self):
        self.assertEqual(health.code_version_match({'code_version':'6ea1540'},'6ea1540'),1)
        self.assertEqual(health.code_version_match({'code_version':'7e108bc9'},'6ea1540'),0)
        self.assertIsNone(health.code_version_match({},'6ea1540'));self.assertIsNone(health.code_version_match({'code_version':'x'},None))
    def test_conversation_loop(self):
        fields=health.conversation_loop({'conversation_provider':'gemini'},{'last_completion':int(NOW)-50},1,{'ActiveState':'active'},{'LoadState':'loaded','ActiveState':'inactive'},NOW)
        self.assertEqual(fields,{'poll_state':1,'wake_path_active':1,'timer_ok':0,'provider':1,'poll_age_seconds':50})
        self.assertEqual(health.conversation_loop({},{'last_completion':0},4,None,None,NOW),{'poll_state':4,'wake_path_active':None,'timer_ok':None,'provider':2})


class FakeReportingConnection:
    def __init__(self,row=None,error=None):
        self.row,self.error,self.statements=row,error,[]
    @contextmanager
    def transaction(self):
        yield
    def execute(self,sql,params=None):
        self.statements.append(sql)
        if self.error:raise self.error
        return Mock(fetchone=Mock(return_value=self.row))


class PwaOpsTests(unittest.TestCase):
    def snapshot(self,**over):
        values=dict(pending=0,oldest_pending_seconds=None,delivered_24h=7,failed_24h=0,subscriptions=4,last_dispatch_age_seconds=60,
                    daily_completed_at=dt.datetime.fromtimestamp(NOW-38000,dt.timezone.utc),daily_state='completed',
                    analytics_completed_at=dt.datetime.fromtimestamp(NOW-2460,dt.timezone.utc),analytics_state='completed')
        values.update(over);return values
    def test_function_call_in_a_savepoint(self):
        conn=FakeReportingConnection(row=tuple(self.snapshot().values()))
        self.assertEqual(health.ops_health_snapshot(conn),self.snapshot())
        self.assertEqual(conn.statements,['SELECT * FROM monitoring.pwa_ops_health_v1()'])
        self.assertIsNone(health.ops_health_snapshot(FakeReportingConnection(error=RuntimeError('permission denied'))))
        self.assertIsNone(health.ops_health_snapshot(FakeReportingConnection(row=(1,2))))
    def test_fields_on_time_overdue_and_unreadable(self):
        notify,jobs=health.pwa_ops_fields(self.snapshot(),NOW)
        self.assertEqual(notify,{'pending':0,'delivered_24h':7,'failed_24h':0,'subscriptions':4,'oldest_pending_seconds':0,'last_dispatch_age_seconds':60})
        self.assertEqual(jobs,{'daily_charges_age_seconds':38000,'daily_charges_state':1,'recent_analytics_age_seconds':2460,'recent_analytics_state':1,'status':1})
        notify,jobs=health.pwa_ops_fields(self.snapshot(pending=2,oldest_pending_seconds=950,analytics_completed_at=dt.datetime.fromtimestamp(NOW-4600,dt.timezone.utc)),NOW)
        self.assertEqual((notify['oldest_pending_seconds'],jobs['recent_analytics_state'],jobs['status']),(950,2,2))
        _,jobs=health.pwa_ops_fields(self.snapshot(daily_completed_at=None),NOW)
        self.assertEqual((jobs['daily_charges_age_seconds'],jobs['daily_charges_state'],jobs['status']),(None,2,2))
        self.assertEqual(health.pwa_ops_fields(None,NOW),({},{'status':4}))
    def test_pg_stat_share_rate_and_not_granted(self):
        conn=FakeReportingConnection(row=('42',1200,600.0,1500.0))
        snap=health.pg_stat_snapshot(conn)
        self.assertEqual(snap,{'status':1,'queryid':'42','calls':1200,'share':40.0})
        self.assertNotIn('query',conn.statements[0].replace('queryid',''))
        fields,state=health.pg_stat_fields(snap,{'queryid':'42','calls':1080,'at':NOW-120},NOW)
        self.assertEqual(fields,{'status':1,'top1_share_percent':40,'top1_calls_per_min':60})
        self.assertEqual(state,{'queryid':'42','calls':1200,'at':NOW})
        fields,_=health.pg_stat_fields(snap,{'queryid':'7','calls':1,'at':NOW-120},NOW)
        self.assertNotIn('top1_calls_per_min',fields)
        denied=health.pg_stat_snapshot(FakeReportingConnection(error=RuntimeError('permission denied')))
        self.assertEqual(health.pg_stat_fields(denied,None,NOW),({'status':0},None))


class AgentSnapshotTests(unittest.TestCase):
    def rows(self):
        t=lambda s:dt.datetime.fromtimestamp(NOW-s,dt.timezone.utc)
        return {'recognizer':[(11,9,1,1)],'recognizer_call':[(t(30),12.6)],'turns':[(0,0,9,8,1)],
                'last_turn':[('m9','VERIFIED',720.4)],
                'model_turns':[('m8','gemini',t(4000),t(3950),'3'),('m9','codex',t(800),t(752),'4'),('m7',None,t(9000),None,None)],
                'grounding':[(0,)],'last_send':[(700.2,)]}
    def test_counts_last_turn_and_points(self):
        out=health.agent_snapshot({},{},lambda config,since:self.rows())
        self.assertEqual(out['recognizer'],{'extractions_24h':11,'valid_24h':9,'timeouts_24h':1,'unreadable_24h':1})
        self.assertEqual(out['recognizer_call'][1],{'seconds':13})
        self.assertEqual(out['conversation'],{'queued':0,'running':0,'turns_24h':9,'verified_24h':8,'failed_24h':1,'median_turn_seconds':49,
            'median_rounds':4,'last_turn_state':1,'last_turn_age_seconds':720,'last_turn_rounds':4,'last_turn_seconds':48,
            'grounding_rejections_24h':0,'last_send_age_seconds':700})
        ended,fields=out['conversation_turn']
        self.assertEqual((fields,round(NOW-ended.timestamp())),({'seconds':48,'rounds':4,'provider':2},752))
    def test_points_already_sent_are_not_repeated(self):
        rows=self.rows()
        seen={'conversation_turn':dt.datetime.fromtimestamp(NOW-752,dt.timezone.utc).isoformat()}
        self.assertIsNone(health.agent_snapshot({},seen,lambda config,since:rows)['conversation_turn'])
        reader=Mock(return_value=rows)
        health.agent_snapshot({},{'recognizer_call':'2026-10-22T03:00:00+00:00'},reader)
        self.assertEqual(reader.call_args.args[1]['recognizer_call'],dt.datetime(2026,10,22,3,tzinfo=dt.timezone.utc))
    def test_unreadable_agent_database_exports_nothing(self):
        self.assertEqual(health.agent_snapshot({},{},Mock(side_effect=RuntimeError())),
                         {'recognizer':{},'recognizer_call':None,'conversation':{},'conversation_turn':None})
    def test_turn_states(self):
        for status,expected in [('READY',1),('VERIFIED',1),('REVIEW',2),('FAILED',0),('UNKNOWN_WRITE',0),('INTERRUPTED',0),('ODD',4)]:
            rows=dict(self.rows(),last_turn=[('mx',status,10)])
            self.assertEqual(health.agent_snapshot({},{},lambda c,s:rows)['conversation']['last_turn_state'],expected)


class ExportTests(unittest.TestCase):
    RESOURCE={'type':'gce_instance','labels':{}}
    def test_missing_values_are_not_exported(self):
        series=health.timing_series('pwa_notify',{'pending':0,'oldest_pending_seconds':None,'failed_24h':2},self.RESOURCE,'t')
        self.assertEqual([(s['metric']['labels']['field'],s['points'][0]['value']['int64Value']) for s in series],[('pending','0'),('failed_24h','2')])
        self.assertTrue(all(s['metric']['type']==health.WORKER_METRIC and s['valueType']=='INT64' for s in series))
    def test_points_state_round_trip(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'last-points.json'
            self.assertEqual(health.load_points(path),{})
            health.save_points({'conversation_turn':'x'},path)
            self.assertEqual(health.load_points(path),{'conversation_turn':'x'})
            path.write_text('[]');self.assertEqual(health.load_points(path),{})


class CollectR089Tests(unittest.TestCase):
    """The whole addition with every external call faked."""
    def test_one_run(self):
        import json
        def fetcher(url,headers=None,timeout=None):
            if url.endswith('/health'):return (200,'{"ok":true}') if 'prod' in url else (503,'')
            if url.endswith('/healthz'):return (200,'{"status":"ok","enabled":true}')
            if 'backupRuns' in url:return (200,json.dumps({'items':[{'status':'SUCCESSFUL','type':'AUTOMATED','windowStartTime':iso(30000),'endTime':iso(25200)}]}))
            if 'sqladmin' in url:return (200,json.dumps({'settings':{'backupConfiguration':{'transactionLogRetentionDays':7}}}))
            if 'snapshots' in url:return (200,json.dumps({'items':[{'status':'READY','creationTimestamp':iso(72000)}]}))
            raise AssertionError('unexpected call '+url)
        units={'mw-receipt-recognition.service':{'ActiveState':'active','ActiveEnterTimestampMonotonic':'400000000'},
               'mw-conversation-wake.path':{'ActiveState':'active'},'mw-partner-conversation.timer':{'LoadState':'loaded','ActiveState':'active'},
               'mw-audit-retention.service':dict(LoadState='loaded',Result='success',ExecMainStatus='0',ExecMainExitTimestampMonotonic='900000000')}
        extras={'ops_health':PwaOpsTests().snapshot(),'pg_stat':{'status':1,'queryid':'1','calls':5,'share':12.4}}
        out=health.collect_r089({'receipt_recognition_listen_host':'10.148.0.2','code_version':'abc'},'token',1000,NOW,{'polling':1},
            {'last_completion':int(NOW)-40},extras,'abc',{},lambda:{'metabase_platform':{'status':1}},fetcher=fetcher,
            props=lambda name:units[name],origins_loader=lambda:ORIGINS,reader=lambda c,s:AgentSnapshotTests().rows())
        self.assertEqual(out['metabase'],{'metabase_platform':{'status':1}})
        self.assertEqual(out['health'],{'pwa_api_reader_prod':1,'pwa_api_command_prod':1,'pwa_api_reader_dev':0,'pwa_api_command_dev':0,'recognizer':1})
        timing={c:(f,t) for c,f,t in out['timing']}
        self.assertEqual(timing['cloud_sql_backup'][0],{'status':1,'age_seconds':25200,'type':1,'log_retention_days':7})
        self.assertEqual(timing['debian_snapshot'][0],{'age_seconds':72000})
        self.assertEqual(timing['audit_retention'][0],{'result':1,'age_seconds':100})
        self.assertEqual(timing['webhook_local'][0],{'code_version_match':1})
        self.assertEqual(timing['pg_stat'][0],{'status':1,'top1_share_percent':12})
        self.assertEqual((timing['pwa_jobs'][0]['status'],timing['recognizer'][0]['restart_age_seconds']),(1,600))
        self.assertEqual(timing['conversation'][0]['poll_age_seconds'],40)
        self.assertIsNotNone(timing['conversation_turn'][1]);self.assertIsNotNone(timing['recognizer_call'][1])
        self.assertEqual(set(out['points']),{'pg_stat','conversation_turn','recognizer_call'})
        self.assertNotIn('local',out)
    def test_failing_sources_degrade_to_no_report(self):
        out=health.collect_r089({},'token',1000,NOW,{},{'last_completion':0},None,None,{},Mock(side_effect=RuntimeError()),
            fetcher=Mock(side_effect=TimeoutError()),props=Mock(side_effect=RuntimeError()),origins_loader=lambda:None,reader=Mock(side_effect=RuntimeError()))
        self.assertEqual(out['metabase'],{})
        self.assertEqual(out['health'],{'pwa_api_reader_prod':4,'pwa_api_command_prod':4,'pwa_api_reader_dev':4,'pwa_api_command_dev':4,'recognizer':4})
        timing={c:f for c,f,_ in out['timing']}
        self.assertEqual((timing['pwa_jobs'],timing['pwa_notify'],timing['cloud_sql_backup'],timing['debian_snapshot']),({'status':4},{},{},{'error':'TimeoutError'}))
        self.assertNotIn('conversation_turn',timing)

if __name__=='__main__': unittest.main()
