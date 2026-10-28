"""Compatibility entry point; the implementation is the repository root's scripts/dictionary/capture_postgresql.py (R103: the
monorepo root is the default, MW_CREDIT_APP_ROOT still overrides it)."""
import os
from pathlib import Path
import runpy
import sys
_target = Path(os.environ.get("MW_CREDIT_APP_ROOT", str(Path(__file__).resolve().parents[3]))) / 'scripts/dictionary/capture_postgresql.py'
if not _target.is_file():
    raise RuntimeError("Set MW_CREDIT_APP_ROOT to the canonical MW-Credit-App checkout")
sys.path.insert(0, str(_target.parent))
if __name__ == "__main__":
    runpy.run_path(str(_target), run_name="__main__")
else:
    globals().update({k: v for k, v in runpy.run_path(str(_target)).items() if k not in {"__name__", "__file__", "__package__", "__spec__"}})
