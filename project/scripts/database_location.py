"""Temporary cross-repository database location for retained legacy helpers."""
import os
from pathlib import Path
DATABASE_REPO_ROOT = Path(os.environ.get("MW_CREDIT_APP_ROOT", str(Path(__file__).resolve().parents[1].parent / "MW-Credit-App"))).resolve()
