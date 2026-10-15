"""Load the pinned dictionary parser without changing the shared Codex runtime."""
import os
import sys
from pathlib import Path

DEPENDENCIES = Path(os.environ.get(
    "MW_DICTIONARY_PYTHON_PACKAGES",
    str(Path.home() / "Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python"),
))
if DEPENDENCIES.is_dir():
    sys.path.insert(0, str(DEPENDENCIES))
try:
    import yaml
except ImportError as exc:
    raise RuntimeError("Install scripts/dictionary/requirements.txt as described in scripts/dictionary/README.md") from exc
if yaml.__version__ != "6.0.2":
    raise RuntimeError(f"Expected PyYAML 6.0.2, found {yaml.__version__}; see scripts/dictionary/README.md")
