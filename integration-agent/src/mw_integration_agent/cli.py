from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import __version__
from .config import ConfigurationError, load_json, validate_catalogue, validate_config
from .instagram import Instagram
from .journal import IngressJournal
from .server import poll_ready, serve


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mw-integration-agent")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check", help="validate disabled scaffold configuration")
    check.add_argument("--config", required=True)
    relay = sub.add_parser('audit-relay', help='relay committed audit to the central journal; never replay')
    relay.add_argument('--config',required=True)
    relay.add_argument('--catalogue',required=True)
    check.add_argument(
        "--catalogue",
        default=str(Path(__file__).resolve().parents[2] / "service-catalogue.json"),
    )
    sub.add_parser("status", help="print the repository runtime status")
    reconsider=sub.add_parser('receipt-reconsider',help='explicitly reconsider an unexecuted receipt; supersede prior pending review')
    reconsider.add_argument('--config',required=True)
    reconsider.add_argument('--catalogue',required=True)
    reconsider.add_argument('--job-id',required=True)
    poll=sub.add_parser('conversation-poll',help='read new conversation messages through official API')
    poll.add_argument('--config',required=True)
    poll.add_argument('--catalogue',required=True)
    poll.add_argument('--date',help='explicit owner-requested today-only group backfill; preserve polling cursors')
    webhook = sub.add_parser("serve-webhook", help="run receipt-only signed Instagram ingress")
    webhook.add_argument("--config", required=True)
    webhook.add_argument("--catalogue", required=True)
    recognition = sub.add_parser("serve-receipt-recognition", help="run the VPC-only receipt recognition API")
    recognition.add_argument("--config", required=True)
    recognition.add_argument("--catalogue", required=True)
    ready = sub.add_parser("receiver-ready", help="wait until the local receiver reports ready")
    ready.add_argument("--config", required=True)
    ready.add_argument("--wait", type=float, default=0, help="seconds to keep polling once per second")
    messages = sub.add_parser("messages", help="show captured Instagram messages")
    messages.add_argument("--config", required=True)
    messages.add_argument("--limit", type=int, default=10)
    messages.add_argument("--include-text", action="store_true")
    probe = sub.add_parser("instagram-probe", help="verify read-only Instagram API access")
    probe.add_argument("--config", required=True)
    probe.add_argument("--catalogue", required=True)
    send = sub.add_parser("send-instagram", help="send one explicitly requested Instagram message")
    send.add_argument("--config", required=True)
    send.add_argument("--catalogue", required=True)
    send.add_argument("--recipient", required=True)
    send.add_argument("--text", required=True)
    statement = sub.add_parser("cash-statement", help="prepare or explicitly deliver the latest completed daily cash statement")
    statement.add_argument("--config", required=True)
    statement.add_argument("--catalogue", required=True)
    statement.add_argument("--date", help="calendar date YYYY-MM-DD, midnight to midnight Bangkok")
    statement.add_argument("--send", action="store_true", help="deliver once to currently opted-in Partners")
    statement.add_argument("--scheduled", action="store_true", help="run the authorized daily scheduled delivery")
    retry = sub.add_parser("retry-cash-statement-email", help="retry definitely unsent fallback email")
    retry.add_argument("--config", required=True)
    retry.add_argument("--catalogue", required=True)
    receipt=sub.add_parser('receipt-cycle',help='process receipts under the configured payment/review policy and deliver Partner notices')
    receipt.add_argument('--config',required=True)
    receipt.add_argument('--catalogue',required=True)
    prepare=sub.add_parser('receipt-prepare',help='prepare one explicitly selected borrower receipt; no payment or notification')
    prepare.add_argument('--config',required=True)
    prepare.add_argument('--catalogue',required=True)
    prepare.add_argument('--borrower-id',required=True)
    prepare.add_argument('--date',required=True)
    prepare.add_argument('--message-id')
    return parser


# Long-running services, local checks and the monitoring/read probes run outside audit.job(): no
# service owner to fence and nothing to record (the probes touch no journal and leave no audit tree).
UNWRAPPED_COMMANDS = ('serve-webhook','serve-receipt-recognition','receiver-ready','status','check','instagram-probe','messages')


def main() -> int:
    args = build_parser().parse_args()
    if args.command in UNWRAPPED_COMMANDS:
        return execute(args)
    from .audit import job
    try:
        config=load_json(args.config)
        with job(config,args.command) as outcome:
            outcome['exit_code']=execute(args,outcome)
            return outcome['exit_code']
    except ConfigurationError as exc:
        print(json.dumps({'status':'error','error':str(exc)}))
        return 2


def execute(args, outcome=None) -> int:
    try:
        if args.command == 'audit-relay':
            from .outbox import relay
            config=load_json(args.config)
            validate_config(config)
            validate_catalogue(load_json(args.catalogue))
            # R091: the legacy reviewer-DML reconciliation went with the conversation journal (agent V11).
            result={'relay':relay(config)}
            # The relay writes under other services' operations, never a child of its own JOB:
            # a cycle that moved something materialises its JOB record through the outcome.
            effect={k:v for k,v in (('exported',result['relay']['exported']),) if v}
            if effect and outcome is not None:
                outcome['effect']=effect
            print(json.dumps(result))
            return 0
        if args.command=='receipt-reconsider':
            from .receipt_reconsider import run
            print(json.dumps(run(args.config,args.catalogue,args.job_id)))
            return 0
        if args.command=='conversation-poll':
            from .conversation_poll import run
            result=run(args.config,args.catalogue,args.date)
            print(json.dumps(result))
            return 2 if result.get('failed_conversations') else 0
        if args.command=='receipt-prepare':
            from .receipt_prepare import prepare
            print(json.dumps(prepare(args.config,args.catalogue,args.borrower_id,args.date,args.message_id)))
            return 0
        if args.command=='receipt-cycle':
            from .receipt_run import run
            from .receipt_wake import rerun
            result=rerun(run,args.config,args.catalogue)
            print(json.dumps(result))
            return 2 if result.get('failures') else 0
        if args.command == "cash-statement":
            from .statement_run import run
            if args.send and args.scheduled:
                raise ConfigurationError("--send and --scheduled are mutually exclusive")
            result = run(args.config,args.catalogue,args.date,args.send,args.scheduled)
            print(json.dumps(result,ensure_ascii=False))
            return 2 if any(p['status']=='BLOCKED' for p in result['recipients']) else 0
        if args.command == "retry-cash-statement-email":
            from .statement_run import retry_emails
            print(json.dumps(retry_emails(args.config,args.catalogue),ensure_ascii=False))
            return 0
        if args.command == "check":
            config = load_json(args.config)
            validate_config(config)
            validate_catalogue(load_json(args.catalogue))
            print(json.dumps({"status": "ok", "activation": {
                "state_backend": config.get('state_backend','sqlite'),
                "cash_statement_schedule": config["cash_statement_schedule_enabled"],
                "email_fallback": config["email_fallback_enabled"],
                "receipt_summary": config.get('receipt_summary_enabled',False),
                "receipt_extraction_provider": config.get('receipt_extraction_provider','codex'),
                "receipt_recognition": config.get('receipt_recognition_enabled',False),
                "generic_sending": config["sending_enabled"],
                "processing": config["processing_enabled"], "writes": config["writes_enabled"]}}))
            return 0
        if args.command == "status":
            print(json.dumps({"status": "transport-foundation", "business_activation": "disabled", "version": __version__}))
            return 0
        if args.command == "serve-webhook":
            config = load_json(args.config)
            catalogue = load_json(args.catalogue)
            validate_config(config)
            validate_catalogue(catalogue)
            if not catalogue["services"]["signed_webhook_ingress"]["enabled"]:
                raise ConfigurationError("signed_webhook_ingress is disabled")
            serve(args.config, args.catalogue)
            return 0
        if args.command == "serve-receipt-recognition":
            from .receipt_recognition_api import serve as serve_recognition
            serve_recognition(args.config, args.catalogue)
            return 0
        if args.command == "receiver-ready":
            try:
                config = load_json(args.config)
                ready, body = poll_ready(config["listen_host"], config["listen_port"], args.wait)
            except (ConfigurationError, KeyError, TypeError):
                ready, body = False, {"ready": False, "failed": ["config"]}
            print(json.dumps(body))
            return 0 if ready else 1
        if args.command == "messages":
            config = load_json(args.config)
            validate_config(config)
            if not 1 <= args.limit <= 100:
                raise ConfigurationError("limit must be from 1 to 100")
            journal = IngressJournal(Path(config["state_directory"]) / "instagram-ingress.db", config=config)
            try:
                rows = journal.latest(args.limit)
            finally:
                journal.close()
            if not args.include_text:
                for row in rows:
                    row["text_length"] = len(row.pop("text"))
            print(json.dumps({"messages": rows}, ensure_ascii=False))
            return 0
        if args.command == "instagram-probe":
            config = load_json(args.config)
            catalogue = load_json(args.catalogue)
            validate_config(config)
            validate_catalogue(catalogue)
            print(json.dumps(Instagram(config).probe(), ensure_ascii=False))
            return 0
        if args.command == "send-instagram":
            config = load_json(args.config)
            catalogue = load_json(args.catalogue)
            validate_config(config)
            validate_catalogue(catalogue)
            if not catalogue["services"]["instagram_delivery"]["enabled"]:
                raise ConfigurationError("instagram_delivery is disabled")
            message_id = Instagram(config).send(args.recipient, args.text)
            print(json.dumps({"status": "accepted", "message_id": message_id}))
            return 0
    except ConfigurationError as exc:
        print(json.dumps({"status": "error", "error": str(exc)}))
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
