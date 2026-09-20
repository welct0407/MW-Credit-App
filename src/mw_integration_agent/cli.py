from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import __version__
from .appsheet import AppSheet
from .config import ConfigurationError, load_json, validate_catalogue, validate_config
from .instagram import Instagram
from .journal import IngressJournal
from .server import serve


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mw-integration-agent")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check", help="validate disabled scaffold configuration")
    check.add_argument("--config", required=True)
    check.add_argument(
        "--catalogue",
        default=str(Path(__file__).resolve().parents[2] / "service-catalogue.json"),
    )
    sub.add_parser("status", help="print the repository runtime status")
    webhook = sub.add_parser("serve-webhook", help="run receipt-only signed Instagram ingress")
    webhook.add_argument("--config", required=True)
    webhook.add_argument("--catalogue", required=True)
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
    appsheet = sub.add_parser("appsheet-probe", help="verify bounded read-only AppSheet API access")
    appsheet.add_argument("--config", required=True)
    appsheet.add_argument("--catalogue", required=True)
    statement = sub.add_parser("cash-statement", help="prepare or explicitly deliver the latest completed daily cash statement")
    statement.add_argument("--config", required=True)
    statement.add_argument("--catalogue", required=True)
    statement.add_argument("--date", help="calendar date YYYY-MM-DD, midnight to midnight Bangkok")
    statement.add_argument("--send", action="store_true", help="deliver once to currently opted-in Partners")
    statement.add_argument("--scheduled", action="store_true", help="run the authorized daily scheduled delivery")
    retry = sub.add_parser("retry-cash-statement-email", help="retry definitely unsent fallback email")
    retry.add_argument("--config", required=True)
    retry.add_argument("--catalogue", required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
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
            validate_config(load_json(args.config))
            validate_catalogue(load_json(args.catalogue))
            print(json.dumps({"status": "ok", "activation": "disabled"}))
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
            serve(args.config)
            return 0
        if args.command == "messages":
            config = load_json(args.config)
            validate_config(config)
            if not 1 <= args.limit <= 100:
                raise ConfigurationError("limit must be from 1 to 100")
            journal = IngressJournal(Path(config["state_directory"]) / "instagram-ingress.db")
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
        if args.command == "appsheet-probe":
            config = load_json(args.config)
            catalogue = load_json(args.catalogue)
            validate_config(config)
            validate_catalogue(catalogue)
            if not catalogue["services"]["operational_data_read"]["enabled"]:
                raise ConfigurationError("operational_data_read is disabled")
            if not config.get("appsheet_enabled"):
                raise ConfigurationError("appsheet_enabled is false")
            print(json.dumps(AppSheet(config).probe()))
            return 0
    except ConfigurationError as exc:
        print(json.dumps({"status": "error", "error": str(exc)}))
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
