"""Read-only R010 cash effects, grouped by the existing ledger timestamp (Bangkok)."""
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from .audit import audited
from .config import ConfigurationError, load_secret

BANGKOK = ZoneInfo('Asia/Bangkok')


def period(day: str | None = None, now: datetime | None = None):
    now = now or datetime.now(BANGKOK)
    now = now.astimezone(BANGKOK)
    if day:
        start = datetime.combine(datetime.strptime(day, '%Y-%m-%d').date(), time.min, BANGKOK)
    else:
        end = datetime.combine(now.date(), time.min, BANGKOK)
        start = end - timedelta(days=1)
    end = start + timedelta(days=1)
    if end > now:
        raise ConfigurationError('Only completed 00:00–00:00 calendar days may be generated')
    return start, end


@audited('business_read',route='postgres',action='READ')
def read_query(config, sql):
    if not config.get('database_enabled'):
        raise ConfigurationError('database_enabled is false')
    env = dict(os.environ, PGPASSWORD=load_secret(config, 'database_password_file'), PGCONNECT_TIMEOUT='10')
    command = ['psql', '-X', '-h', config['database_host'], '-p', str(config['database_port']),
               '-U', config['database_user'], '-d', config['database_name'], '-Atq', '-v', 'ON_ERROR_STOP=1']
    try:
        result = subprocess.run(command, input='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
            "SET LOCAL statement_timeout='30s';\n" + sql + '\nROLLBACK;',
            env=env, text=True, encoding='utf-8', capture_output=True, timeout=40, check=True)
        return json.loads(result.stdout, parse_float=Decimal)
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        raise ConfigurationError('Read-only cash statement query failed') from exc


def partners(config):
    # Read disabled rows too: duplicate identity bindings deny delivery even if one is off.
    return read_query(config, '''SELECT coalesce(json_agg(t),'[]'::json) FROM (
      SELECT "Row ID" AS id,"Instagram Username" AS username,
      "Language Preference" AS language,"IG Integration Enabled" AS enabled,
      coalesce("Email",'') AS email
      FROM public."Partners" ORDER BY "Row ID") t;''')


def snapshot(config, start, end):
    # Only internally parsed datetime values are interpolated. No user SQL or identifiers.
    a, b = (x.astimezone(BANGKOK).replace(tzinfo=None).isoformat() for x in (start, end))
    value = read_query(config, f'''
WITH effects AS (
 SELECT e.*,coalesce(br."Description",br."Borrower Name",'') AS borrower_en,
 coalesce(br."Borrower Name",br."Description",'') AS borrower_th,
 coalesce(other."Account Label",'') AS other_account,
 coalesce(p."Partner Name",'') AS partner_name
 FROM public.cash_statement_account_effects e
 LEFT JOIN public."Borrowers" br ON br."Row ID"=e."Ref Borrower"
 LEFT JOIN public."Cash Accounts" other ON other."Row ID"=e."Ref Other Cash Account"
 LEFT JOIN public."Partners" p ON p."Row ID"=e."Ref Partner"
 WHERE e."Sort Timestamp" < timestamp '{b}'
), accounts AS (
 SELECT a."Row ID" AS id,a."Account Label" AS label,a."Bank Name" AS bank,
 right(regexp_replace(coalesce(a."Account Number",''),'[^0-9]','','g'),4) AS last4,
 c."Ref Cash Account" IS NOT NULL AS initialized,
 c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out"
 +coalesce((SELECT sum(e."Signed Amount") FROM effects e
 WHERE e."Ref Cash Account"=a."Row ID" AND e."Sort Timestamp" < timestamp '{a}'),0) AS opening,
 coalesce((SELECT json_agg(x ORDER BY x.posted_at,x.ledger_id COLLATE "C",x.direction COLLATE "C") FROM (
 SELECT e.ledger_id,e.direction,e."Sort Timestamp" AS posted_at,
 e."Statement Date" AS effective_date,e."Signed Amount" AS amount,
 e."Transaction Type Code" AS type,e."Counterparty Kind" AS kind,
 e."Counterparty Text" AS counterparty,e.borrower_en,e.borrower_th,e.other_account,e.partner_name
 FROM effects e WHERE e."Ref Cash Account"=a."Row ID"
 AND e."Sort Timestamp">=timestamp '{a}') x),'[]'::json) AS transactions
 FROM public."Cash Accounts" a LEFT JOIN public.r008_cash_account_cutover c
 ON c."Ref Cash Account"=a."Row ID"
)
SELECT json_build_object('database',current_database(),'role',current_user,
 'generated_at',CURRENT_TIMESTAMP,'accounts',(SELECT json_agg(accounts ORDER BY label,id) FROM accounts));
''')
    if value['database'] != 'loan_manager_prod' or value['role'] != 'mw_integration_agent':
        raise ConfigurationError('Unexpected database identity')
    value.update(start=start.isoformat(), end=end.isoformat(), basis='ledger-posting-time')
    for account in value['accounts'] or []:
        summarize(account)
    return value


def summarize(account):
    opening = account['opening']
    if not account['initialized'] or opening is None:
        raise ConfigurationError('Account opening balance is not initialized; report blocked')
    balance = Decimal(str(opening))
    if not balance.is_finite():
        raise ConfigurationError('Invalid opening balance')
    incoming = outgoing = Decimal(0)
    last = None
    for row in account['transactions']:
        key = (row['posted_at'], row['ledger_id'], row['direction'])
        if last is not None and key <= last:
            raise ConfigurationError('Duplicate or unordered cash effects')
        last = key
        amount = Decimal(str(row['amount']))
        if not amount.is_finite() or not balance.is_finite():
            raise ConfigurationError('Invalid cash amount')
        incoming += max(amount, 0)
        outgoing += max(-amount, 0)
        balance += amount
        row['balance'] = balance
    account.update(money_in=incoming, money_out=outgoing, net=incoming-outgoing,
                   closing=balance, count=len(account['transactions']))
    return account
