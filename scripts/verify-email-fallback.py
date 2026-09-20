#!/usr/bin/env python3
"""Read-only Graph identity and Partner fallback readiness check; sends no email."""
import argparse
import json
import urllib.request

from mw_integration_agent.cash_statement import partners
from mw_integration_agent.config import load_json, validate_config
from mw_integration_agent.graph_email import GraphEmail, valid_email


parser=argparse.ArgumentParser()
parser.add_argument('--config',required=True)
args=parser.parse_args()
config=load_json(args.config); validate_config(config)
graph=GraphEmail(config); token=graph.token()
request=urllib.request.Request('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
    headers={'Authorization':'Bearer '+token})
with urllib.request.urlopen(request,timeout=20) as response:
    value=json.load(response)
actual=(value.get('mail') or value.get('userPrincipalName') or '').lower()
enabled=[p for p in partners(config) if p['enabled'] is True]
print(json.dumps({'graph_authenticated':bool(actual),
                  'sender_match':actual==config['email_sender'].lower(),
                  'enabled_partners':len(enabled),
                  'supported_languages':all(p['language'] in ('English','ไทย') for p in enabled),
                  'fallback_email_ready':all(valid_email(p['email']) for p in enabled)}))
