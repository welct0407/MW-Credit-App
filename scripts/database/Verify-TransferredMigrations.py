"""Verify immutable migration bytes imported from the prior owner."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
manifest = json.loads((root / "outputs/database-transfer-20261007/source-manifest.json").read_text())
migrations = [item for item in manifest["files"] if item["path"].startswith("database/migrations/")]
assert len(migrations) == 77, "Unexpected transfer baseline"
for item in migrations:
    path = root / item["path"]
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
        raise SystemExit("Transferred migration differs: " + item["path"])
print("All 77 transferred migrations retain their original SHA256.")
