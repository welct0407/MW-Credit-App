"""Strict YAML and shared dictionary invariants. No network or application access."""
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path

from runtime import yaml

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / "Documents/Data Dictionary"
IDENTITY_FIELDS = ("system", "component", "kind", "name", "scope")


class Loader(getattr(yaml, "CSafeLoader", yaml.SafeLoader)):
    pass


# JSON scalar types only. In particular, Yes/No and dates never coerce.
Loader.yaml_implicit_resolvers = {}
for tag, pattern, starts in [
    ("bool", r"^(?:true|false)$", "tf"),
    ("null", r"^null$", "n"),
    ("int", r"^-?(?:0|[1-9][0-9]*)$", "-0123456789"),
    ("float", r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+(?:[eE][+-]?[0-9]+)?|[eE][+-]?[0-9]+)$", "-0123456789"),
]:
    Loader.add_implicit_resolver("tag:yaml.org,2002:" + tag, re.compile(pattern), list(starts))


def mapping(loader, node):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=True)
        if not isinstance(key, str) or key == "<<":
            raise ValueError("Mapping keys must be strings; YAML merge keys are prohibited")
        if key in result:
            raise ValueError(f"Duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node, deep=True)
    return result


Loader.add_constructor("tag:yaml.org,2002:map", mapping)


class Dumper(yaml.SafeDumper):
    def ignore_aliases(self, data):
        return True


def string(dumper, value):
    return dumper.represent_scalar("tag:yaml.org,2002:str", value, style="|" if "\n" in value else '"')


Dumper.add_representer(str, string)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def equal(a, b):
    return canonical(a) == canonical(b)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load_text(text):
    for token in yaml.scan(text, Loader=Loader):
        if isinstance(token, (yaml.tokens.AliasToken, yaml.tokens.AnchorToken, yaml.tokens.TagToken)):
            raise ValueError("YAML aliases, anchors and explicit tags are prohibited")
    result = yaml.load(text, Loader=Loader)
    canonical(result)  # Reject non-JSON types and nonfinite numbers.
    return result


def load(path):
    return load_text(Path(path).read_text(encoding="utf-8"))


def dump(value):
    text = yaml.dump(value, Dumper=Dumper, allow_unicode=True, sort_keys=False, width=120, line_break="\n")
    if not equal(load_text(text), value):
        raise ValueError("YAML serialization changed a typed value")
    return text


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, str):
        data = data.encode("utf-8")
    fd, temp = tempfile.mkstemp(prefix=".dictionary-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def write_yaml(path, value):
    atomic_write(path, dump(value))


def write_json(path, value):
    atomic_write(path, json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def inside(root, relative):
    root = Path(root).resolve()
    path = (root / relative).resolve()
    if path == root or not path.is_relative_to(root):
        raise ValueError("Path must stay inside the dictionary")
    return path


def escape(token):
    return str(token).replace("~", "~0").replace("/", "~1")


def tokens(pointer):
    if pointer == "":
        return []
    if not isinstance(pointer, str) or not pointer.startswith("/"):
        raise ValueError("Expected a JSON Pointer")
    if re.search(r"~(?![01])", pointer):
        raise ValueError("Invalid JSON Pointer escape")
    return [s.replace("~1", "/").replace("~0", "~") for s in pointer[1:].split("/")]


def at(document, pointer):
    value = document
    for key in tokens(pointer):
        if isinstance(value, list):
            if not re.fullmatch(r"0|[1-9][0-9]*", key):
                raise ValueError("Invalid list index")
            value = value[int(key)]
        else:
            value = value[key]
    return value


def lookup_entries(doc):
    content = doc["content"]
    result = []
    for section in ("columns", "constraints", "fields"):
        for name in content.get(section, {}):
            result.append({"subject": name, "pointer": f"/content/{section}/{escape(name)}"})
    for key, record in content.get("records", {}).items():
        subject = " | ".join(str(record[k]) for k in (
            "Object", "Table", "Table / view", "Schema / table", "Setting / bot", "Name", "Reference"
        ) if record.get(k) is not None)
        if subject:
            result.append({"subject": subject, "pointer": "/content/records/" + escape(key)})
    return result


def document_paths(root):
    return sorted(p for prefix in ("systems", "imports", "development")
                  for p in (Path(root) / prefix).rglob("*.yaml"))


def make_index(root, overrides=None):
    overrides = overrides or {}
    entries = []
    for path in document_paths(root):
        rel = path.relative_to(root).as_posix()
        doc = overrides.get(rel) or load(path)
        entries.append({"file": rel, **doc["identity"], "status": doc["verification"]["status"],
                        "lookup": lookup_entries(doc)})
    return {"format": 1, "generated_by": "scripts/dictionary/dictionary.py index", "entries": entries}


def validate_document(doc, registry):
    if not isinstance(doc, dict) or type(doc.get("format")) is not int or doc["format"] != 1:
        raise ValueError("Expected dictionary format 1")
    allowed = {"format", "identity", "verification", "content", "evidence"}
    if set(doc) - allowed:
        raise ValueError("Unknown document fields")
    identity = doc.get("identity", {})
    if set(identity) != set(IDENTITY_FIELDS) or any(not isinstance(identity[k], str) or not identity[k] for k in IDENTITY_FIELDS):
        raise ValueError("Identity requires nonempty system/component/kind/name/scope strings")
    system = registry["systems"].get(identity["system"])
    if not system or identity["kind"] not in system["kinds"]:
        raise ValueError("Unregistered system or kind")
    if system["status"] == "planned":
        raise ValueError("Register the system as active before adding definitions")
    verification = doc.get("verification", {})
    if verification.get("status") not in ("imported-unreconciled", "documented"):
        raise ValueError("Invalid verification status")
    if not isinstance(verification.get("source"), str) or not verification["source"]:
        raise ValueError("Source evidence is required")
    content = doc.get("content")
    if not isinstance(content, dict):
        raise ValueError("content must be a mapping")
    for section in ("columns", "constraints", "fields", "records"):
        if section in content and (not isinstance(content[section], dict) or
                                   any(not isinstance(v, dict) for v in content[section].values())):
            raise ValueError(f"{section} must map names to records")
    if identity["system"] == "appsheet" and identity["kind"] == "table":
        for column in content.get("columns", {}).values():
            if "rules" in column and not isinstance(column["rules"], dict):
                raise ValueError("Column rules must be a property mapping")
    if identity["kind"] == "slice" and "members" in content:
        members = content["members"]
        if not isinstance(members, list) or any(not isinstance(m, dict) for m in members):
            raise ValueError("Slice members must be an ordered list of records")
        ordinals = [m.get("Ordinal") for m in members]
        if any(type(n) is not int or n < 1 for n in ordinals) or len(set(ordinals)) != len(ordinals):
            raise ValueError("Slice ordinals must be unique positive integers")
    for pointer, evidence in doc.get("evidence", {}).items():
        tokens(pointer)
        if not pointer.startswith("/content/"):
            raise ValueError("Evidence must target content")
        if not isinstance(evidence, dict) or any(not isinstance(evidence.get(k), str) or not evidence[k].strip() for k in ("reference", "reason")):
            raise ValueError("Evidence needs a reference and reason")
        if evidence.get("state", "value") not in ("value", "absent"):
            raise ValueError("Evidence state must be value or absent")
        try:
            at(doc, pointer)
            present = True
        except (KeyError, IndexError):
            present = False
        if present != (evidence.get("state", "value") == "value"):
            raise ValueError("Evidence pointer/state does not match content")
    canonical(doc)


def validate(root, check_index=True, overrides=None):
    root = Path(root)
    errors = []
    registry = load(root / "catalog.yaml")
    if registry.get("format") != 1 or not isinstance(registry.get("systems"), dict):
        raise ValueError("Invalid catalog")
    identities = set()
    paths = document_paths(root)
    case_paths = set()
    for path in paths:
        rel = path.relative_to(root).as_posix()
        try:
            if rel.casefold() in case_paths:
                raise ValueError("Case-insensitive filename collision")
            case_paths.add(rel.casefold())
            doc = (overrides or {}).get(rel) or load(path)
            validate_document(doc, registry)
            identity = tuple(doc["identity"][k] for k in IDENTITY_FIELDS)
            if identity in identities:
                raise ValueError("Duplicate object identity")
            identities.add(identity)
        except (ValueError, KeyError, TypeError, yaml.YAMLError) as exc:
            errors.append({"file": rel, "error": str(exc)})
    if not errors and check_index:
        saved = json.loads((root / "index.json").read_text(encoding="utf-8"))
        if not equal(saved, make_index(root, overrides)):
            errors.append({"file": "index.json", "error": "Stale index; run dictionary.py index"})
    migration = registry.get("migration")
    if migration:
        workbook = (root / migration["workbook"]).resolve()
        if not workbook.is_file() or digest(workbook.read_bytes()) != migration["sha256"]:
            errors.append({"file": migration["workbook"], "error": "Frozen migration workbook changed or missing"})
    unresolved = load(root / "unresolved.yaml")
    items = unresolved.get("items", [])
    return {"documents": len(paths), "errors": errors, "reconciliation": "deferred by owner",
            "recorded_limitations": sum(item.get("status") not in ("resolved", "informational") for item in items),
            "resolved_items": sum(item.get("status") == "resolved" for item in items),
            "informational_items": sum(item.get("status") == "informational" for item in items)}
