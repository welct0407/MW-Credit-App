"""Receipt-cycle wake file: capture touches it, mw-receipt-wake.path starts the cycle.
A wake failure never fails capture; the 20 s timer stays the fallback."""
import time
from pathlib import Path

from .review_resend import is_command

EXTRA_PASSES=2


def path(config):return Path(config['state_directory'])/'receipt-wake'


def wakes(message):
    """Work the receipt cycle acts on: an image, a reply (approval or hold dismissal) or a standalone command."""
    return not message.get('quarantine') and bool(
        any(a.get('url') for a in message.get('attachments') or []) or message.get('reply_to') or is_command(message))


def wake(config):
    try:
        with path(config).open('w') as stream:stream.write(str(time.time()))
    except (OSError,KeyError):return False
    return True


def woken(config,since):
    try:return path(config).stat().st_mtime>=since
    except (OSError,KeyError):return False


def due(load,config_path,since):
    try:return woken(load(config_path),since)
    except Exception:return False  # the finished run's result stands; the timer is the fallback


def rerun(run,config_path,catalogue_path):
    """systemd does not restart an active oneshot when the path changes mid-run, so a capture
    during a run is picked up by up to EXTRA_PASSES further passes of the same process."""
    from .config import load_json
    started=time.time();result=run(config_path,catalogue_path)
    for _ in range(EXTRA_PASSES):
        if result.get('status')=='already_running' or result.get('failures') or not due(load_json,config_path,started):break
        started=time.time();result=run(config_path,catalogue_path)
    return result
