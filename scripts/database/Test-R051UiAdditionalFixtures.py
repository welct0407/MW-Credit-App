"""Local-only V67 GUI fixture/date/key rehearsal; never uses DEV transport."""
import argparse
import hashlib
import json
from datetime import date
from pathlib import Path
import psycopg
import R051UiAdditionalFixtures as fixtures
import ReceiptCorrectionDev as transport


def run(port,data_directory):
    with psycopg.connect(host='127.0.0.1',port=port,dbname='postgres',user='postgres',connect_timeout=5) as c:
        if Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()!=data_directory.resolve():
            raise ValueError('Expected exact private local cluster')
        assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==('postgres','127.0.0.1')
        assert c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()==('67',1721477385)
        c.rollback()
        # Production guard correctly rejects this private postgres database.
        try:fixtures.verify_target(c)
        except ValueError as e:assert str(e)=='DEV identity mismatch'
        else:raise AssertionError('Private database accepted as DEV')
        c.rollback()
        fixtures.setup(c,readonly=True)
        for timestamp,expected in [('2026-10-05T16:59:59+00:00',date(2026,10,5)),('2026-10-05T17:00:00+00:00',date(2026,10,6))]:
            assert c.execute("SELECT (%s::timestamptz AT TIME ZONE current_setting('TimeZone'))::date",[timestamp]).fetchone()[0]==expected
        c.rollback()
        c.execute("SET LOCAL timezone='UTC'");before=transport.fingerprints(c);c.rollback()
        results=[]
        for batch in fixtures.BATCHES:
            try:
                fixtures.setup(c)
                pre=fixtures.preflight(c,batch)
                assert pre['version']==67 and pre['timezone']=='Asia/Bangkok'
                seeded=fixtures.seed(c,batch)
                for table,keys in pre['plan']['source_keys'].items():
                    assert sorted(fixtures.keys(seeded,table))==sorted(keys),(batch,table)
                assert not any(r['Auto Charge Enabled'] for r in seeded['Loans'])
                for table,field,plan_key in [('Loans','Loan Date','loan'),('Charges','Charge Date','charge'),('Payments','Payment Date','payment'),('Repayments','Payment Date','repayment')]:
                    if plan_key not in pre['plan']['dates']:continue
                    exact_key=fixtures.ids(batch)['charge'] if table=='Charges' else None
                    for row in seeded[table]:
                        if exact_key and row['Row ID']!=exact_key:continue
                        assert row[field]==pre['plan']['dates'][plan_key],(batch,table,field)
                if batch=='DAILY':
                    assert next(r for r in seeded['Charges'] if r['Row ID']==fixtures.ids(batch)['later'])['Charge Date']==pre['plan']['dates']['later_charge']
                if batch=='PARTNER-A':
                    assert not seeded['Cash Pool Contributions'] and not seeded['Settlements']
                    assert all(not row.get('Email') and not row.get('Login Email') and not row.get('IG Integration Enabled') for row in seeded['Partners'])
                fixtures.cleanup(c,batch,{table:fixtures.keys(seeded,table) for table in seeded})
                assert not any(fixtures.readback(c,batch).values())
                results.append({'batch':batch,'passed':True,'plan':pre['plan']})
            finally:c.rollback()
            c.execute("SET LOCAL timezone='UTC'");assert transport.fingerprints(c)==before;c.rollback()
        return {'passed':True,'scope':'LOCAL restored V67; six seed/readback/exact cleanup workflows rolled back; no DEV access',
                'bangkok_midnight_boundary_cases':2,'table_fingerprints_unchanged':len(before),'batches':results,
                'fixture_script_sha256':hashlib.sha256(Path(fixtures.__file__).read_bytes()).hexdigest()}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port',type=int,required=True)
    p.add_argument('--data-directory',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();result=run(a.port,a.data_directory)
    a.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='batches'},indent=2))
