"""Selective reads, guarded edits and validation for the ecosystem dictionary."""
import argparse
import copy
import json
import os
import sys
from pathlib import Path

from common import (ROOT, at, atomic_write, digest, dump, equal, escape, inside, load,
                    make_index, tokens, validate, write_json)


def read_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result
    return json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=unique)


def search(root, query, system=None):
    index = read_json(Path(root) / "index.json")
    query = query.casefold()
    hits = []
    for entry in index["entries"]:
        if system and entry["system"] != system:
            continue
        matches = [r for r in entry["lookup"] if query in r["subject"].casefold()]
        if query in entry["name"].casefold() or matches:
            hits.append({k: v for k, v in entry.items() if k != "lookup"} | {"matches": matches})
    return hits


def read(root, relative, pointer=""):
    path = inside(root, relative)
    doc = load(path)
    related = []
    for entry in search(root, doc["identity"]["name"]):
        if entry["system"] == "workbook-evidence" and entry["file"] != relative:
            related.append({"file": entry["file"], "total_matches": len(entry["matches"]), "matches": entry["matches"][:5]})
    return {"file": relative, "sha256": digest(path.read_bytes()), "identity": doc["identity"],
            "verification": doc["verification"], "pointer": pointer, "value": at(doc, pointer),
            "related_imported_evidence": related[:10], "related_files_total": len(related),
            "related_evidence_note": "Name matches for navigation only; no precedence, reconciliation or DEV overlay applied."}


def state(mapping, key):
    return {"state": "value", "value": mapping[key]} if key in mapping else {"state": "absent"}


def check_state(value):
    if not isinstance(value, dict) or (value.get("state") == "absent" and set(value) != {"state"}) or (
        value.get("state") == "value" and set(value) != {"state", "value"}
    ) or value.get("state") not in ("value", "absent"):
        raise ValueError("Use explicit value (including null) or absent states")


def plan_update(root, patch):
    if set(patch) != {"file", "expected_sha256", "evidence", "reason", "changes"}:
        raise ValueError("Patch requires file, expected_sha256, evidence, reason, changes")
    for key in ("file", "expected_sha256", "evidence", "reason"):
        if not isinstance(patch[key], str) or not patch[key].strip():
            raise ValueError(f"Nonempty {key} required")
    path = inside(root, patch["file"])
    if path.suffix != ".yaml" or path.parts[len(Path(root).resolve().parts)] not in ("systems", "imports", "development"):
        raise ValueError("Updates must target an object YAML file")
    original = path.read_bytes()
    if digest(original) != patch["expected_sha256"]:
        raise ValueError("Stale file hash; read the current object before updating")
    doc = load(path)
    result = copy.deepcopy(doc)
    changes = patch["changes"]
    if not isinstance(changes, list) or not changes:
        raise ValueError("At least one change is required")
    pointers = []
    for change in changes:
        if set(change) != {"pointer", "expected", "target"}:
            raise ValueError("Each change requires pointer, expected and target")
        pointer = change["pointer"]
        if not isinstance(pointer, str) or not pointer.startswith("/content/"):
            raise ValueError("Only content entries can be patched")
        parts = tokens(pointer)
        if any(parts[:len(p)] == p or p[:len(parts)] == parts for p in pointers):
            raise ValueError("Duplicate or overlapping patch targets")
        pointers.append(parts)
        parent_pointer = "/" + "/".join(escape(p) for p in parts[:-1])
        parent = at(result, parent_pointer)
        if not isinstance(parent, dict):
            raise ValueError("Patch a mapping entry; replace an ordered list as a whole")
        check_state(change["expected"])
        check_state(change["target"])
        if not equal(state(parent, parts[-1]), change["expected"]):
            raise ValueError(f"Old-value guard failed: {pointer}")
        if equal(change["expected"], change["target"]):
            raise ValueError("No-op patch")
        if change["target"]["state"] == "absent":
            del parent[parts[-1]]
        else:
            parent[parts[-1]] = copy.deepcopy(change["target"]["value"])
        result.setdefault("evidence", {})[pointer] = {"reference": patch["evidence"], "reason": patch["reason"],
                                                     "state": change["target"]["state"]}
    report = validate(root, check_index=False, overrides={patch["file"]: result})
    if report["errors"]:
        raise ValueError("Candidate validation failed: " + json.dumps(report["errors"]))
    encoded = dump(result).encode("utf-8")
    return path, original, encoded, {"file": patch["file"], "before_sha256": digest(original),
                                    "after_sha256": digest(encoded), "changes": changes,
                                    "evidence": patch["evidence"], "reason": patch["reason"]}


def update(root, patch, apply=False):
    path, original, encoded, report = plan_update(root, patch)
    report["applied"] = False
    if not apply:
        return report
    lock = path.with_suffix(".yaml.lock")
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    try:
        os.close(descriptor)
        if path.read_bytes() != original:
            raise ValueError("Source changed during planning; nothing written")
        atomic_write(path, encoded)
        report["applied"] = True
        try:
            write_json(Path(root) / "index.json", make_index(root))
        except Exception as exc:
            raise RuntimeError("Object saved, but index refresh failed; run dictionary.py index. " + str(exc)) from exc
        if path.read_bytes() != encoded:
            raise RuntimeError("Saved object readback differs; inspect concurrent work")
    finally:
        lock.unlink()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    commands = parser.add_subparsers(dest="command", required=True)
    find = commands.add_parser("find")
    find.add_argument("query")
    find.add_argument("--system")
    find.add_argument("--limit", type=int, default=30)
    find.add_argument("--matches", type=int, default=5)
    get = commands.add_parser("read")
    get.add_argument("file")
    get.add_argument("--pointer", default="")
    commands.add_parser("validate")
    commands.add_parser("index")
    edit = commands.add_parser("update")
    edit.add_argument("patch", type=Path)
    edit.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    args.root = args.root.resolve()
    if args.command == "find":
        hits = search(args.root, args.query, args.system)
        limited = []
        for hit in hits[:max(1, args.limit)]:
            limited.append(hit | {"total_matches": len(hit["matches"]), "matches": hit["matches"][:max(0, args.matches)]})
        result = {"total": len(hits), "results": limited}
    elif args.command == "read":
        result = read(args.root, args.file, args.pointer)
    elif args.command == "validate":
        result = validate(args.root)
    elif args.command == "index":
        result = validate(args.root, check_index=False)
        if not result["errors"]:
            write_json(args.root / "index.json", make_index(args.root))
            result["index_updated"] = True
    else:
        result = update(args.root, read_json(args.patch), args.apply)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result.get("errors"):
        raise SystemExit(1)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        main()
    except (ValueError, KeyError, IndexError, OSError, RuntimeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
