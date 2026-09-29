from __future__ import annotations

import json
import re
from pathlib import Path, PurePosixPath
from typing import Any


BOOLEAN_FLAGS = (
    "processing_enabled",
    "sending_enabled",
    "writes_enabled",
    "daily_briefing_enabled",
    "cash_statement_schedule_enabled",
    "email_fallback_enabled",
    "receiver_enabled",
    "appsheet_enabled",
    "database_enabled",
)


class ConfigurationError(ValueError):
    pass


def load_json(path: str | Path) -> dict[str, Any]:
    target = Path(path)
    try:
        value = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigurationError(f"cannot read valid JSON: {target}") from exc
    if not isinstance(value, dict):
        raise ConfigurationError(f"top-level JSON value must be an object: {target}")
    return value


def validate_config(config: dict[str, Any]) -> None:
    if type(config.get('receipt_archive_enabled',False)) is not bool:
        raise ConfigurationError('receipt_archive_enabled must be boolean')
    if config.get('receipt_archive_enabled'):
        from datetime import datetime
        from .receipt_storage import BUCKET
        if config.get('receipt_bucket')!=BUCKET or config.get('receipt_environment') not in ('dev','prod'):
            raise ConfigurationError('UNAPPROVED_RECEIPT_STORAGE')
        try:
            if datetime.fromisoformat(config['receipt_archive_cutoff']).tzinfo is None:raise ValueError()
        except (KeyError,TypeError,ValueError):raise ConfigurationError('receipt_archive_cutoff required') from None
        if type(config.get('receipt_spool_limit_bytes',536870912)) is not int or config.get('receipt_spool_limit_bytes',536870912)<12_000_000:
            raise ConfigurationError('INVALID_RECEIPT_SPOOL_LIMIT')
    for flag,cutoff,identity in (
            ('receipt_auto_payment_enabled','receipt_auto_payment_cutoff','receipt_auto_actor_partner_id'),
            ('receipt_forwarding_enabled','receipt_forwarding_cutoff','receipt_forwarder_partner_id')):
        if type(config.get(flag,False)) is not bool:raise ConfigurationError(flag+' must be boolean')
        if config.get(flag):
            from datetime import datetime
            try:
                if datetime.fromisoformat(config[cutoff]).tzinfo is None:raise ValueError()
            except (KeyError,TypeError,ValueError):raise ConfigurationError(cutoff+' required') from None
            if not config.get(identity):raise ConfigurationError(identity+' required')
            if not config.get('partner_review_enabled'):raise ConfigurationError('receipt automation requires review flow')
    if config.get('receipt_auto_payment_enabled') and not config.get('partner_review_execution_enabled'):
        raise ConfigurationError('automatic payment requires execution enabled')
    if config.get('receipt_forwarding_enabled') and not config.get('receipt_group_account_username'):
        raise ConfigurationError('forwarding requires group account username')
    if config.get('state_backend', 'sqlite') not in ('sqlite','postgres'):
        raise ConfigurationError('unknown state backend')
    if config.get('state_backend') == 'postgres':
        from datetime import datetime
        from uuid import UUID
        if (config.get('agent_database_host') not in ('127.0.0.1','::1') or
                config.get('agent_database_port') != 5432 or config.get('agent_database_name') != 'mw_agent'):
            raise ConfigurationError('unapproved agent database')
        _validate_secret_path(config, 'agent_database_worker_password_file')
        _validate_secret_path(config, 'agent_database_relay_password_file')
        try:
            UUID(config['state_generation'])
            if datetime.fromisoformat(config['state_cutover_at']).tzinfo is None: raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise ConfigurationError('state generation and timezone cutover required') from None
    for flag in ('partner_conversations_enabled', 'conversation_writes_enabled', 'reviewer_dml_enabled', 'reviewer_delete_enabled'):
        if type(config.get(flag, False)) is not bool:
            raise ConfigurationError(flag + ' must be boolean')
    if config.get('reviewer_delete_enabled') and (config.get('state_backend')!='postgres' or not config.get('reviewer_dml_enabled')):
        raise ConfigurationError('DELETE requires PostgreSQL audit and reviewer DML')
    if config.get('conversation_writes_enabled') and not config.get('partner_conversations_enabled'):
        raise ConfigurationError('conversation writes require conversations')
    if config.get('partner_conversations_enabled'):
        from datetime import datetime
        try:
            if datetime.fromisoformat(config['partner_conversation_cutoff']).tzinfo is None:
                raise ValueError()
        except (KeyError, TypeError, ValueError) as exc:
            raise ConfigurationError('partner_conversation_cutoff must include timezone') from exc
        if not all(config.get(k) for k in ('receiver_enabled', 'database_enabled', 'appsheet_enabled')):
            raise ConfigurationError('conversations require receiver, database and AppSheet')
        if config.get('appsheet_app_id') != '93844270-6aa5-420b-a960-bcdf08abd357':
            raise ConfigurationError('conversations require the approved production OLTP app')
        if config.get('conversation_writes_enabled') and not config.get('appsheet_olap_app_id'):
            raise ConfigurationError('conversation edits require OLAP readback')
        from .conversation_schema import load_schema
        load_schema(config)
    if config.get('reviewer_dml_enabled'):
        from datetime import datetime
        if not config.get('partner_conversations_enabled') or not config.get('database_enabled'):
            raise ConfigurationError('reviewer DML requires conversations and database')
        if config.get('database_dml_user') != 'mw_reviewer_dml':
            raise ConfigurationError('reviewer DML requires dedicated role')
        _validate_secret_path(config, 'database_dml_password_file')
        try:
            if datetime.fromisoformat(config['reviewer_dml_cutoff']).tzinfo is None: raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise ConfigurationError('reviewer_dml_cutoff must include timezone') from None
    timeout = config.get('conversation_timeout_seconds', 600)
    if type(timeout) is not int or not 30 <= timeout <= 900:
        raise ConfigurationError('conversation_timeout_seconds must be 30..900')
    for flag in ('partner_review_enabled','partner_review_execution_enabled'):
        if type(config.get(flag,False)) is not bool:raise ConfigurationError(flag+' must be boolean')
    if config.get('partner_review_execution_enabled') and not config.get('partner_review_enabled'):
        raise ConfigurationError('review execution requires review flow')
    if config.get('partner_review_enabled'):
        from datetime import datetime
        try:
            if datetime.fromisoformat(config['partner_review_cutoff']).tzinfo is None:raise ValueError()
        except (KeyError,TypeError,ValueError) as exc:raise ConfigurationError('partner_review_cutoff required') from exc
    if type(config.get('conversation_poll_enabled',False)) is not bool:
        raise ConfigurationError('conversation_poll_enabled must be boolean')
    if config.get('conversation_poll_enabled'):
        from datetime import datetime
        try:
            if datetime.fromisoformat(config['conversation_poll_cutoff']).tzinfo is None:raise ValueError()
        except (KeyError,TypeError,ValueError) as exc:
            raise ConfigurationError('conversation_poll_cutoff must include timezone') from exc
    if type(config.get('receipt_summary_enabled', False)) is not bool:
        raise ConfigurationError('receipt_summary_enabled must be boolean')
    for notice_cutoff in ('partner_notice_cutoff','receipt_hold_notice_cutoff','receipt_hold_reply_cutoff','review_resend_cutoff'):
        if config.get(notice_cutoff):
            from datetime import datetime
            try:
                if datetime.fromisoformat(config[notice_cutoff]).tzinfo is None:raise ValueError()
            except (TypeError,ValueError) as exc:
                raise ConfigurationError(notice_cutoff+' must include timezone') from exc
    if config.get('receipt_summary_enabled'):
        from datetime import datetime
        try:
            cutoff = datetime.fromisoformat(config['receipt_activation_cutoff'])
            if cutoff.tzinfo is None:
                raise ValueError()
        except (KeyError, TypeError, ValueError) as exc:
            raise ConfigurationError('receipt_activation_cutoff must include timezone') from exc
        if not config.get('receiver_enabled') or not config.get('database_enabled'):
            raise ConfigurationError('receipt summaries require receiver and database')
    for flag in BOOLEAN_FLAGS:
        if not isinstance(config.get(flag), bool):
            raise ConfigurationError(f"{flag} must be boolean")

    for flag in ("processing_enabled", "writes_enabled", "daily_briefing_enabled"):
        if config.get(flag) is not False:
            raise ConfigurationError(f"unimplemented capability requires {flag}=false")

    for key in ("state_directory", "secrets_directory", "codex_executable", "codex_home"):
        value = config.get(key)
        if not isinstance(value, str) or not PurePosixPath(value).is_absolute():
            raise ConfigurationError(f"{key} must be an absolute POSIX path")

    if config.get("listen_host") not in {"127.0.0.1", "::1"}:
        raise ConfigurationError("scaffold listener must be loopback-only")
    port = config.get("listen_port")
    if not isinstance(port, int) or not 1 <= port <= 65535:
        raise ConfigurationError("listen_port must be an integer from 1 to 65535")

    if config.get("receiver_enabled") or config.get("sending_enabled"):
        if not re.fullmatch(r"\d+", str(config.get("instagram_account_id", ""))):
            raise ConfigurationError("instagram_account_id must contain digits")
        if not re.fullmatch(r"v\d+\.\d+", str(config.get("instagram_api_version", ""))):
            raise ConfigurationError("instagram_api_version is invalid")
        secret_root = PurePosixPath(config["secrets_directory"])
        for key in ("instagram_token_file", "meta_app_secret_file", "webhook_verify_token_file"):
            value = config.get(key)
            if not isinstance(value, str) or not PurePosixPath(value).is_absolute():
                raise ConfigurationError(f"{key} must be an absolute POSIX path")
            if ".." in PurePosixPath(value).parts:
                raise ConfigurationError(f"{key} must not contain parent traversal")
            try:
                PurePosixPath(value).relative_to(secret_root)
            except ValueError as exc:
                raise ConfigurationError(f"{key} must be under secrets_directory") from exc

    if config.get("appsheet_enabled"):
        if not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", str(config.get("appsheet_app_id", ""))):
            raise ConfigurationError("appsheet_app_id must be a lowercase UUID")
        if config.get("appsheet_api_base") != "https://www.appsheet.com":
            raise ConfigurationError("appsheet_api_base is not approved")
        _validate_secret_path(config, "appsheet_key_file")
        if config.get('appsheet_olap_app_id') or config.get('appsheet_olap_key_file'):
            if config.get('appsheet_olap_app_id') != 'e74dd368-654f-44d7-bccf-83cf361d1cdb':
                raise ConfigurationError('OLAP API must identify the approved production application')
            _validate_secret_path(config, 'appsheet_olap_key_file')

    if config.get("database_enabled"):
        if config.get("database_host") not in {"127.0.0.1", "::1"}:
            raise ConfigurationError("database_host must be loopback")
        if config.get("database_port") != 5432:
            raise ConfigurationError("database_port must be 5432")
        if config.get("database_name") != "loan_manager_prod":
            raise ConfigurationError("database_name must identify the approved production database")
        if config.get("database_user") != "mw_integration_agent":
            raise ConfigurationError("database_user must be the dedicated least-privilege role")
        _validate_secret_path(config, "database_password_file")

    if config.get("email_fallback_enabled") or config.get("cash_statement_schedule_enabled") or config.get('receipt_summary_enabled'):
        if not re.fullmatch(r"[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+", str(config.get("email_sender", ""))):
            raise ConfigurationError("email_sender is invalid")
        _validate_secret_path(config, "email_oauth_file")


def load_secret(config: dict[str, Any], key: str) -> str:
    path = Path(config[key]).resolve()
    try:
        path.relative_to(Path(config["secrets_directory"]).resolve())
        value = path.read_text(encoding="utf-8-sig").strip()
    except (KeyError, OSError, ValueError) as exc:
        raise ConfigurationError(f"credential unavailable: {key}") from exc
    if not value:
        raise ConfigurationError(f"credential is empty: {key}")
    return value


def _validate_secret_path(config: dict[str, Any], key: str) -> None:
    value = config.get(key)
    if not isinstance(value, str) or not PurePosixPath(value).is_absolute():
        raise ConfigurationError(f"{key} must be an absolute POSIX path")
    path = PurePosixPath(value)
    if ".." in path.parts:
        raise ConfigurationError(f"{key} must not contain parent traversal")
    try:
        path.relative_to(PurePosixPath(config["secrets_directory"]))
    except (KeyError, ValueError) as exc:
        raise ConfigurationError(f"{key} must be under secrets_directory") from exc


def validate_catalogue(catalogue: dict[str, Any]) -> None:
    if catalogue.get("default_policy") != "deny":
        raise ConfigurationError("service catalogue must default to deny")
    services = catalogue.get("services")
    if not isinstance(services, dict) or not services:
        raise ConfigurationError("service catalogue must define services")
    for name, service in services.items():
        if name not in {"signed_webhook_ingress", "partner_authentication", "operational_data_read",
                        "database_connectivity", "persistent_codex_conversation", "partner_oltp_gui",
                        "operational_data_api", "reviewer_database_dml", "instagram_delivery", "email_fallback", "daily_briefing",
                        "pattaya_weather", "daily_cash_statement", "receipt_summary", "conversation_poll", "partner_receipt_review", "receipt_evidence"}:
            raise ConfigurationError(f"unknown service: {name}")
        if not isinstance(service, dict):
            raise ConfigurationError(f"invalid service entry: {name}")
        if any(type(service.get(key)) is not bool for key in ("enabled", "implemented")):
            raise ConfigurationError(f"invalid service flags: {name}")
        if service.get("enabled") and not service.get("implemented"):
            raise ConfigurationError(f"enabled service is not implemented: {name}")
