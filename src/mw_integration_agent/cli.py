from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import __version__
from .config import ConfigurationError, load_json, validate_catalogue, validate_config


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
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "check":
            validate_config(load_json(args.config))
            validate_catalogue(load_json(args.catalogue))
            print(json.dumps({"status": "ok", "activation": "disabled"}))
            return 0
        if args.command == "status":
            print(json.dumps({"status": "scaffold", "activation": "disabled", "version": __version__}))
            return 0
    except ConfigurationError as exc:
        print(json.dumps({"status": "error", "error": str(exc)}))
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
