"""Cloud-only operator entry point; default is offline plan validation.

Apply requires explicit authorization for THIS production correction. Permanent
fix deployment permission is not financial-write permission. Private request,
SQL and diagnostics stay outside Git. No replay follows a duplicate or timeout.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid

ACCESS = '/workspace/.setup/cloud-access'
PIN = '/workspace/.setup/cloud-access-host.pub'
FIELDS = {'kind','operation_id','database','payment','receipt','moves','reason','code_version',
          'actor_id','actor_login','authorization_reference'}


def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)


def validate(value):
    if (not isinstance(value,dict) or set(value)!=FIELDS or value['kind']!='interest-reallocation-v2'
            or value['database']!='loan_manager_prod' or str(uuid.UUID(value['operation_id']))!=value['operation_id']
            or not isinstance(value['receipt'],dict) or not isinstance(value['moves'],list)
            or not 1<=len(value['moves'])<=20
            or any(not isinstance(value[k],str) or not value[k].strip() for k in
                   ('payment','reason','code_version','actor_id','actor_login','authorization_reference'))
            or len(canonical(value).encode())>10*1024*1024):
        raise ValueError('Invalid canonical operator request')


def remote(stage,value,runner):
    # A finite IAP command through the independently pinned, existing helper.
    # The private payload is constructed at runtime; never print argv/diagnostics.
    code = ('import json\nfrom pathlib import Path\n'
            'from mw_integration_agent.operator_execution import '+stage+'\n'
            'config=json.loads(Path("/etc/mw-integration-agent/config.json").read_text())\n'
            'value=json.loads('+repr(canonical(value))+')\n'
            'print(json.dumps('+stage+'(config,value)))\n')
    result=runner([ACCESS,'--host-key-file',PIN,'--confirm-ssh-user','codex-cloud','ssh','--',
                   'sudo','-n','-u','mwagent','/opt/mw-integration-agent/.venv/bin/python','-c',code],
                  capture_output=True,text=True)
    if result.returncode:
        raise RuntimeError('Operator '+stage+' failed; reconcile existing evidence before any new dispatch')
    return json.loads(result.stdout)


def execute(value,approval_reference,runner=subprocess.run):
    import hashlib
    validate(value)
    if not approval_reference or approval_reference!=value['authorization_reference']:
        raise ValueError('Matching explicit owner approval reference required')
    prepared=remote('prepare',value,runner)
    digest=hashlib.sha256(canonical(value).encode()).hexdigest()
    if (prepared.get('prepared') is not True or prepared.get('operation_id')!=value['operation_id']
            or prepared.get('plan_sha256')!=digest or prepared.get('business_writes')!=0):
        raise RuntimeError('Durable intent readback differs; business dispatch prohibited')
    with tempfile.TemporaryDirectory(prefix='audited-interest-') as private:
        Path(private).chmod(0o700)
        path=Path(private)/'operation.sql'
        literal="'"+canonical(value).replace("'","''")+"'"
        sql=("BEGIN ISOLATION LEVEL SERIALIZABLE;\n"
             "SET LOCAL standard_conforming_strings=on;\nSET LOCAL statement_timeout='15s';\n"
             "SET LOCAL lock_timeout='3s';\nSET LOCAL idle_in_transaction_session_timeout='30s';\n"
             "SELECT public.reallocate_payment_interest_audited('"+value['operation_id']+"'::uuid,"+literal+"::text);\nCOMMIT;\n")
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as stream:stream.write(sql)
        # Preserve unknown outcomes; neither a transport error nor absent source
        # marker is permission to submit this financial request a second time.
        try:
            result=runner([ACCESS,'--host-key-file',PIN,'--confirm-ssh-user','codex-cloud','sql','prod',
                           '--admin','--approve-prod-admin','--file',str(path)],capture_output=True,text=True)
        except Exception:
            result=None
        observed=remote('observe',value,runner)
    if (observed.get('operation_id')!=value['operation_id']
            or observed.get('state') not in ('COMMITTED','UNKNOWN')
            or observed.get('replay_permitted') is not False):
        raise RuntimeError('Invalid outcome evidence; reconcile before any new dispatch')
    return dict(observed, business_writes="unknown" if observed['state']=='UNKNOWN' else "committed",
                dispatch_attempted=True, transport_succeeded=bool(result and result.returncode==0))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--request',required=True)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--approve-production-write',action='store_true')
    parser.add_argument('--approval-reference')
    args=parser.parse_args()
    value=json.loads(Path(args.request).read_text())
    validate(value)
    if args.apply:
        if not args.approve_production_write:parser.error('Explicit scoped production-write approval required')
        print(json.dumps(execute(value,args.approval_reference)))
    else:
        import hashlib
        print(json.dumps({'mode':'plan','plan_sha256':hashlib.sha256(canonical(value).encode()).hexdigest(),
                          'business_writes':0,'connected':False}))
