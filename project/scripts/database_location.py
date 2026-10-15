"""Database source location for retained legacy helpers: the repository root (parent of project/)."""
import os
from pathlib import Path
DATABASE_REPO_ROOT = Path(os.environ.get("MW_CREDIT_APP_ROOT", str(Path(__file__).resolve().parents[2]))).resolve()
