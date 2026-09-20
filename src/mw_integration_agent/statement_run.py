from __future__ import annotations

import hashlib
import json
import os
from decimal import Decimal
from datetime import timedelta
from pathlib import Path

from .cash_statement import partners, period, snapshot
from .config import ConfigurationError, load_json, validate_catalogue, validate_config
from .instagram import Instagram
from .statement_delivery import DeliveryJournal, check_window, eligible, resolve_recipient, upload_image
from .statement_image import render


def require_services(catalogue, names):
    for name in names:
        if catalogue['services'].get(name,{}).get('enabled') is not True:
            raise ConfigurationError(name+' is disabled')


def run(config_path,catalogue_path,day=None,send=False,review_thai=False):
    # Linux runtime serializes generation and delivery, without holding the ingress database.
    import fcntl
    config,catalogue=load_json(config_path),load_json(catalogue_path)
    validate_config(config)
    validate_catalogue(catalogue)
    if review_thai and not day:
        raise ConfigurationError('Thai review requires an explicit --date')
    require_services(catalogue,['daily_cash_statement','database_connectivity','partner_authentication'])
    if send:
        require_services(catalogue,['instagram_delivery'])
        if not config['sending_enabled']:
            raise ConfigurationError('sending_enabled is false')
    os.umask(0o077)
    state=Path(config['state_directory'])
    state.mkdir(parents=True,exist_ok=True)
    lock=(state/'cash-statement.lock').open('a')
    try:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError as exc:
        lock.close()
        raise ConfigurationError('A cash statement run is already active') from exc
    journal=DeliveryJournal(state/'cash-statement-delivery.db')
    try:
        start,end=period(day,preview=review_thai)
        planned_end=start+timedelta(days=1)
        # Preserve the previously sent 06:00 snapshots and their audit evidence.
        folder=state/'cash-statements'/('review-thai' if review_thai else 'calendar-day')/start.date().isoformat()
        folder.mkdir(parents=True,exist_ok=True)
        saved=folder/'snapshot.json'
        reused=saved.exists()
        if reused:
            report=json.loads(saved.read_text(),parse_float=Decimal)
            if report['start']!=start.isoformat() or (not review_thai and report['end']!=end.isoformat()) or report['basis']!='ledger-posting-time':
                raise ConfigurationError('Saved report period does not match')
        else:
            report=snapshot(config,start,end)
            if review_thai:
                report.update(planned_end=planned_end.isoformat(),preview=end<planned_end,review_language='ไทย')
            temp=folder/'snapshot.tmp'
            temp.write_text(json.dumps(report,ensure_ascii=False,default=str),encoding='utf-8')
            temp.replace(saved)
        rows=partners(config)
        if review_thai and sum(p['enabled'] is True for p in rows)!=1:
            raise ConfigurationError('Owner review requires exactly one opted-in Partner; ambiguous recipient scope')
        results=[]
        # Always prepare both languages for owner review and subsequent preference changes.
        images={}
        for account in report['accounts']:
            account_key=hashlib.sha256(account['id'].encode()).hexdigest()[:20]
            for language,suffix in [('English','en'),('ไทย','th')]:
                images[(account['id'],language)]=render(report,account,language,folder/account_key/suffix)
        api=Instagram(config)
        for candidate in rows:
            if candidate['enabled'] is not True:
                continue
            language='ไทย' if review_thai else candidate['language']
            record={'partner_key':hashlib.sha256(candidate['id'].encode()).hexdigest()[:12],
                    'language':language,'accepted':0,'already_accepted':0,'status':'PREPARED'}
            try:
                partner=eligible(rows,candidate['id'])
                if send:
                    recipient=resolve_recipient(api,partner)
                    check_window(state,recipient)
                    for account in report['accounts']:
                        for number,path in enumerate(images[(account['id'],language)],1):
                            key=json.dumps([report['start'],report['end'],partner['id'],account['id'],number])
                            if review_thai:
                                key='thai-review:'+key
                            status=journal.status(key)
                            if status=='ACCEPTED':
                                record['already_accepted']+=1
                                continue
                            if status:
                                raise ConfigurationError('Prior send outcome unknown; read-only reconciliation required')
                            # Re-read kill switches, master opt-in/language and actual account binding for every image.
                            fresh=load_json(config_path)
                            validate_config(fresh)
                            live_catalogue=load_json(catalogue_path)
                            validate_catalogue(live_catalogue)
                            require_services(live_catalogue,['daily_cash_statement','database_connectivity',
                                                            'partner_authentication','instagram_delivery'])
                            if not fresh['sending_enabled']:
                                raise ConfigurationError('sending_enabled is false')
                            current=eligible(partners(fresh),partner['id'])
                            if current!=partner:
                                raise ConfigurationError('Partner master changed; prepare again before delivery')
                            live_api=Instagram(fresh)
                            if resolve_recipient(live_api,current)!=recipient:
                                raise ConfigurationError('Partner recipient changed')
                            check_window(state,recipient)
                            attachment=upload_image(fresh,path)
                            # Upload is not a send. Recheck live authorization after this network operation.
                            final=load_json(config_path)
                            validate_config(final)
                            final_catalogue=load_json(catalogue_path)
                            validate_catalogue(final_catalogue)
                            require_services(final_catalogue,['daily_cash_statement','database_connectivity',
                                                             'partner_authentication','instagram_delivery'])
                            if not final['sending_enabled'] or eligible(partners(final),partner['id'])!=partner:
                                raise ConfigurationError('Delivery authorization changed after upload')
                            check_window(state,recipient)
                            journal.send_once(key,recipient,language,hashlib.sha256(path.read_bytes()).hexdigest(),
                                              attachment,live_api)
                            record['accepted']+=1
                    record['status']='ACCEPTED'
            except ConfigurationError as exc:
                record.update(status='BLOCKED',reason=str(exc))
            results.append(record)
        result={'period_start':report['start'],'period_end':report['end'],'accounts':len(report['accounts']),
                'snapshot_reused':reused,'directory':str(folder),'recipients':results,'scheduled':False,
                'review_thai':review_thai,'preview':report.get('preview',False)}
        (folder/'last-run.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        return result
    finally:
        journal.close()
        lock.close()
