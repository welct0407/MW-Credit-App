from __future__ import annotations

import json
from pathlib import Path, PurePosixPath
from typing import Any


REQUIRED_DISABLED_FLAGS = (
    "processing_enabled",
    "sending_enabled",
    "writes_enabled",
    "daily_briefing_enabled",
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
    for flag in REQUIRED_DISABLED_FLAGS:
        if config.get(flag) is not False:
            raise ConfigurationError(f"scaffold requires {flag}=false")

    for key in ("state_directory", "secrets_directory", "codex_executable", "codex_home"):
        value = config.get(key)
        if not isinstance(value, str) or not PurePosixPath(value).is_absolute():
            raise ConfigurationError(f"{key} must be an absolute POSIX path")

    if config.get("listen_host") not in {"127.0.0.1", "::1"}:
        raise ConfigurationError("scaffold listener must be loopback-only")
    port = config.get("listen_port")
    if not isinstance(port, int) or not 1 <= port <= 65535:
        raise ConfigurationError("listen_port must be an integer from 1 to 65535")


def validate_catalogue(catalogue: dict[str, Any]) -> None:
    if catalogue.get("default_policy") != "deny":
        raise ConfigurationError("service catalogue must default to deny")
    services = catalogue.get("services")
    if not isinstance(services, dict) or not services:
        raise ConfigurationError("service catalogue must define services")
    for name, service in services.items():
        if not isinstance(service, dict):
            raise ConfigurationError(f"invalid service entry: {name}")
        if service.get("enabled") and not service.get("implemented"):
            raise ConfigurationError(f"enabled service is not implemented: {name}")
