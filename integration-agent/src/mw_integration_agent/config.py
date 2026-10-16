from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from uuid import UUID


BOOLEAN_FLAGS = (
    "processing_enabled",
    "sending_enabled",
    "writes_enabled",
    "daily_briefing_enabled",
    "cash_statement_schedule_enabled",
    "email_fallback_enabled",
    "receiver_enabled",
    "database_enabled",
)

# Business database per environment and the reviewer DML role that may write to it
# (ALL-ARCH-02). The DEV role is not created until a later migration relaxes the
# session_user checks in V33; the DEV target is configurable but stays unusable.
DATABASES = {'prod': 'loan_manager_prod', 'dev': 'loan_manager_dev'}
DML_ROLES = {'prod': 'mw_reviewer_dml', 'dev': 'mw_reviewer_dml_dev'}
# Cloud SQL Auth Proxy listeners (ALL-ARCH-03): database_port/agent_database_port stay
# on the password listener (5432) for the roles that keep password files (reviewer
# DML, receipt projector); the IAM roles (worker, relay, integration agent) use the
# auto-iam-authn listener on iam_database_port (5433 only).
PASSWORD_PORT = 5432
IAM_PORT = 5433
AUTH_MODES = ('password', 'iam')
IAM_USER = r'[a-z][a-z0-9-]*@clever-oasis-508610-n7\.iam'


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


def aware_cutoff(config: dict[str, Any], key: str, message: str | None = None) -> datetime:
    """The configured ISO cutoff as a timezone-aware datetime; naive or missing values fail closed."""
    try:
        value = datetime.fromisoformat(config[key])
        if value.tzinfo is None:
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise ConfigurationError(message or key + ' must include timezone') from None
    return value


def cutoff_ts(config: dict[str, Any], key: str) -> float:
    """POSIX timestamp of a configured cutoff, for comparison with journal timestamps."""
    return aware_cutoff(config, key).timestamp()


def environment(config: dict[str, Any]) -> str:
    """'prod' or 'dev' from database_name; any other name is not an approved target."""
    for name, database in DATABASES.items():
        if config.get('database_name') == database:
            return name
    raise ConfigurationError('database_name must identify an approved business database')


def auth_mode(config: dict[str, Any], prefix: str) -> str:
    """'password' (default) or 'iam' for the connection family named by prefix ('database_' or 'agent_database_')."""
    mode = config.get(prefix + 'auth', 'password')
    if mode not in AUTH_MODES:
        raise ConfigurationError(prefix + 'auth must be password or iam')
    return mode


def iam_port(config: dict[str, Any]) -> int:
    """Local port of the proxy's auto-iam-authn listener; only the fixed second listener is approved."""
    if config.get('iam_database_port', IAM_PORT) != IAM_PORT:
        raise ConfigurationError(f'iam_database_port must be {IAM_PORT}')
    return IAM_PORT


def load_controls(config_path: str | Path, catalogue_path: str | Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """Validated runtime configuration and service catalogue, in that order."""
    config = load_json(config_path)
    validate_config(config)
    catalogue = load_json(catalogue_path)
    validate_catalogue(catalogue)
    return config, catalogue


def validate_config(config: dict[str, Any]) -> None:
    from .conversation_api import validate as validate_conversation_api
    validate_conversation_api(config)
    from .receipt_api import validate as validate_receipt_api
    validate_receipt_api(config)
    if type(config.get('receipt_archive_enabled',False)) is not bool:
        raise ConfigurationError('receipt_archive_enabled must be boolean')
    if config.get('receipt_archive_enabled'):
        from .receipt_storage import BUCKET
        if config.get('receipt_bucket')!=BUCKET or config.get('receipt_environment') not in ('dev','prod'):
            raise ConfigurationError('UNAPPROVED_RECEIPT_STORAGE')
        aware_cutoff(config, 'receipt_archive_cutoff', 'receipt_archive_cutoff required')
        if type(config.get('receipt_spool_limit_bytes',536870912)) is not int or config.get('receipt_spool_limit_bytes',536870912)<12_000_000:
            raise ConfigurationError('INVALID_RECEIPT_SPOOL_LIMIT')
    for flag,cutoff,identity in (
            ('receipt_auto_payment_enabled','receipt_auto_payment_cutoff','receipt_auto_actor_partner_id'),
            ('receipt_forwarding_enabled','receipt_forwarding_cutoff','receipt_forwarder_partner_id')):
        if type(config.get(flag,False)) is not bool:raise ConfigurationError(flag+' must be boolean')
        if config.get(flag):
            aware_cutoff(config, cutoff, cutoff + ' required')
            if not config.get(identity):raise ConfigurationError(identity+' required')
            if not config.get('partner_review_enabled'):raise ConfigurationError('receipt automation requires review flow')
    if config.get('receipt_auto_payment_enabled') and not config.get('partner_review_execution_enabled'):
        raise ConfigurationError('automatic payment requires execution enabled')
    if config.get('receipt_forwarding_enabled') and not config.get('receipt_group_account_username'):
        raise ConfigurationError('forwarding requires group account username')
    if config.get('state_backend', 'sqlite') not in ('sqlite','postgres'):
        raise ConfigurationError('unknown state backend')
    if config.get('state_backend') == 'postgres':
        mode = auth_mode(config, 'agent_database_')
        if (config.get('agent_database_host') not in ('127.0.0.1','::1') or
                config.get('agent_database_port') != PASSWORD_PORT or config.get('agent_database_name') != 'mw_agent'):
            raise ConfigurationError('unapproved agent database')
        if mode == 'iam':
            _validate_iam_user(config)
            iam_port(config)
        else:
            _validate_secret_path(config, 'agent_database_worker_password_file')
            _validate_secret_path(config, 'agent_database_relay_password_file')
        try:
            UUID(config['state_generation'])
        except (KeyError, TypeError, ValueError):
            raise ConfigurationError('state generation and timezone cutover required') from None
        aware_cutoff(config, 'state_cutover_at', 'state generation and timezone cutover required')
    for flag in ('partner_conversations_enabled', 'conversation_writes_enabled', 'reviewer_dml_enabled', 'reviewer_delete_enabled'):
        if type(config.get(flag, False)) is not bool:
            raise ConfigurationError(flag + ' must be boolean')
    if config.get('reviewer_delete_enabled') and (config.get('state_backend')!='postgres' or not config.get('reviewer_dml_enabled')):
        raise ConfigurationError('DELETE requires PostgreSQL audit and reviewer DML')
    if config.get('conversation_writes_enabled') and not config.get('partner_conversations_enabled'):
        raise ConfigurationError('conversation writes require conversations')
    if config.get('partner_conversations_enabled'):
        aware_cutoff(config, 'partner_conversation_cutoff')
        if not all(config.get(k) for k in ('receiver_enabled', 'database_enabled', 'conversation_api_enabled')):
            raise ConfigurationError('conversations require receiver, database and native API')
    if config.get('reviewer_dml_enabled'):
        if not config.get('partner_conversations_enabled') or not config.get('database_enabled'):
            raise ConfigurationError('reviewer DML requires conversations and database')
        if config.get('database_dml_user') != DML_ROLES[environment(config)]:
            raise ConfigurationError('reviewer DML requires dedicated role')
        _validate_secret_path(config, 'database_dml_password_file')
        aware_cutoff(config, 'reviewer_dml_cutoff')
    timeout = config.get('conversation_timeout_seconds', 600)
    if type(timeout) is not int or not 30 <= timeout <= 900:
        raise ConfigurationError('conversation_timeout_seconds must be 30..900')
    for flag in ('partner_review_enabled','partner_review_execution_enabled'):
        if type(config.get(flag,False)) is not bool:raise ConfigurationError(flag+' must be boolean')
    if config.get('partner_review_execution_enabled') and not config.get('partner_review_enabled'):
        raise ConfigurationError('review execution requires review flow')
    if config.get('partner_review_enabled'):
        aware_cutoff(config, 'partner_review_cutoff', 'partner_review_cutoff required')
    if type(config.get('conversation_poll_enabled',False)) is not bool:
        raise ConfigurationError('conversation_poll_enabled must be boolean')
    if config.get('conversation_poll_enabled'):
        aware_cutoff(config, 'conversation_poll_cutoff')
    if type(config.get('receipt_summary_enabled', False)) is not bool:
        raise ConfigurationError('receipt_summary_enabled must be boolean')
    for notice_cutoff in ('partner_notice_cutoff','receipt_hold_notice_cutoff','receipt_hold_reply_cutoff','review_resend_cutoff'):
        if config.get(notice_cutoff):
            aware_cutoff(config, notice_cutoff)
    if config.get('receipt_summary_enabled'):
        aware_cutoff(config, 'receipt_activation_cutoff')
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

    # Retain false as a compatible retirement marker; native runtime needs no legacy fields.
    if config.get("appsheet_enabled", False) is not False:
        raise ConfigurationError("AppSheet transport is retired; appsheet_enabled must be false or absent")

    if config.get("database_enabled"):
        if config.get("database_host") not in {"127.0.0.1", "::1"}:
            raise ConfigurationError("database_host must be loopback")
        mode = auth_mode(config, 'database_')
        if config.get("database_port") != PASSWORD_PORT:
            raise ConfigurationError("database_port must be 5432")
        environment(config)
        if config.get("database_user") != "mw_integration_agent":
            raise ConfigurationError("database_user must be the dedicated least-privilege role")
        if mode == 'iam':
            _validate_iam_user(config)
            iam_port(config)
        else:
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


def _validate_iam_user(config: dict[str, Any]) -> None:
    if not re.fullmatch(IAM_USER, str(config.get('database_iam_user', ''))):
        raise ConfigurationError('database_iam_user must be the VM service account IAM database user')


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
                        "pattaya_weather", "daily_cash_statement", "receipt_summary", "conversation_poll", "partner_receipt_review", "receipt_evidence", "shared_receipt_payment_api"}:
            raise ConfigurationError(f"unknown service: {name}")
        if not isinstance(service, dict):
            raise ConfigurationError(f"invalid service entry: {name}")
        if any(type(service.get(key)) is not bool for key in ("enabled", "implemented")):
            raise ConfigurationError(f"invalid service flags: {name}")
        if service.get("enabled") and not service.get("implemented"):
            raise ConfigurationError(f"enabled service is not implemented: {name}")
