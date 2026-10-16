"""Explicit owner-selected historical archive; no extraction, posting or notices.

Run on the VM as mwagent. Private plan/images stay under state_directory.
Plan is fixed to jobs predating archive activation. Apply rechecks saved pixel hashes.
"""
import argparse
import hashlib
import json
import os
import fcntl
from collections import Counter
from datetime import datetime
from pathlib import Path

from mw_integration_agent.config import load_json
from mw_integration_agent.instagram import Instagram
from mw_integration_agent.receipt_archive import Archive, source
from mw_integration_agent.receipt_image import download_original, canonical_image
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.receipt_projection import reconcile


def run(mode):
    os.umask(0o077)
    config = load_json('/etc/mw-integration-agent/config.json')
    assert config['database_name'] == 'loan_manager_prod'
    assert config['receipt_environment'] == 'prod' and config['receipt_archive_enabled']
    root = Path(config['state_directory'])
    folder = root / 'receipt-backfill-20260927'
    folder.mkdir(exist_ok=True, mode=0o700)
    journal = ReceiptJournal(root / 'receipt-processing.db', config=config)
    try:
        with (root / 'receipt-worker.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if mode == 'plan':
                assert not (folder / 'plan.json').exists(), 'Plan already exists'
                cutoff = datetime.fromisoformat(config['receipt_archive_cutoff']).timestamp()
                jobs = journal.db.execute('SELECT * FROM receipt_jobs WHERE created_at<? ORDER BY created_at', (cutoff,)).fetchall()
                plan = []
                api = Instagram(config)
                for item in jobs:
                    job = dict(item)
                    entry = {'job_id': job['id'], 'status': 'unavailable'}
                    try:
                        message = api.request(job['message_id'], {'fields': 'id,created_time,from,attachments'})
                        assert message['id'] == job['message_id']
                        assert message['from']['id'] == job['sender_id']
                        attachments = message.get('attachments', {}).get('data', [])
                        selected = [(i, a) for i, a in enumerate(attachments) if hashlib.sha256((job['message_id']+':'+str(i)).encode()).hexdigest() == job['id']]
                        if not selected or not selected[0][1].get('image_data', {}).get('url'):
                            entry['status'] = 'no_image'
                        else:
                            index, attachment = selected[0]
                            raw = download_original(attachment['image_data']['url'])
                            _, pixel = canonical_image(raw)
                            if job['image_hash'] and pixel != job['image_hash']:
                                entry['status'] = 'pixel_conflict'
                            else:
                                (folder / (job['id']+'.raw')).write_bytes(raw)
                                entry.update(status='ready', sha256=hashlib.sha256(raw).hexdigest(), pixel=pixel,
                                    source=job['source'] or source('owner-historical-backfill',job['message_id'],index,job['sender_id'],
                                        datetime.fromisoformat(message['created_time'].replace('Z','+00:00')).timestamp(),job['created_at'],attachment=attachment.get('id')))
                    except Exception as exc:
                        entry['error_type'] = type(exc).__name__
                    plan.append(entry)
                (folder / 'plan.json').write_text(json.dumps(plan))
                print(json.dumps({'phase':'plan','counts':dict(Counter(p['status'] for p in plan))}), flush=True)
            else:
                plan = json.loads((folder / 'plan.json').read_text())
                archive = Archive(config, journal)
                counts = Counter()
                for entry in plan:
                    if entry['status'] != 'ready':
                        continue
                    job = dict(journal.db.execute('SELECT * FROM receipt_jobs WHERE id=?', (entry['job_id'],)).fetchone())
                    raw = (folder / (job['id']+'.raw')).read_bytes()
                    assert hashlib.sha256(raw).hexdigest() == entry['sha256']
                    assert not job['image_hash'] or canonical_image(raw)[1] == job['image_hash']
                    if not job['source']:
                        with journal.db:
                            journal.db.execute('UPDATE receipt_jobs SET source=? WHERE id=? AND source IS NULL', (entry['source'],job['id']))
                        job['source'] = entry['source']
                    assert job['source'] == entry['source']
                    try:
                        archive.capture(job, fetch=lambda _url, raw=raw: raw)
                        counts['archived'] += 1
                    except Exception as exc:
                        counts['archive_failed'] += 1
                        entry['apply_error_type'] = type(exc).__name__
                if mode == 'apply':
                    projection = [reconcile(config,journal) for _ in range(5)]
                else:
                    projection = []
                result = {'phase':mode,'counts':dict(counts),'projection':projection}
                (folder / 'result.json').write_text(json.dumps(result))
                print(json.dumps(result),flush=True)
    finally:
        journal.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode',choices=('plan','apply'))
    run(parser.parse_args().mode)
