"""Capture wake files: a capture touches one, a systemd path unit starts the worker.
receipt-wake -> mw-receipt-wake.path -> mw-receipt-summary.service (R082 B1). The R086 conversation wake went
with the Instagram Partner conversation (R091). A wake failure never fails capture; the worker's timer stays the fallback."""
import time
from pathlib import Path

from .review_resend import is_command

EXTRA_PASSES=2
RECEIPT='receipt-wake'


def path(config,name=RECEIPT):return Path(config['state_directory'])/name


def wakes(message):
    """Work the receipt cycle acts on: an image, a reply (approval or hold dismissal) or a standalone command."""
    return not message.get('quarantine') and bool(
        any(a.get('url') for a in message.get('attachments') or []) or message.get('reply_to') or is_command(message))


def wake(config,name=RECEIPT):
    try:
        with path(config,name).open('w') as stream:stream.write(str(time.time()))
    except (OSError,KeyError):return False
    return True


def woken(config,since,name=RECEIPT):
    try:return path(config,name).stat().st_mtime>=since
    except (OSError,KeyError):return False


def due(load,config_path,since,name=RECEIPT):
    try:return woken(load(config_path),since,name)
    except Exception:return False  # the finished run's result stands; the timer is the fallback


def rerun(run,config_path,catalogue_path,name=RECEIPT,again=None):
    """systemd does not restart an active oneshot when the path changes mid-run, so a capture
    during a run is picked up by up to EXTRA_PASSES further passes of the same process; again(result)
    asks for a further pass too (same cap). No message is lost either way: each pass rereads every
    unhandled captured message, the touch follows the committed capture, and the worker's timer runs
    it again after any missed wake."""
    from .config import load_json
    started=time.time();result=run(config_path,catalogue_path)
    for _ in range(EXTRA_PASSES):
        if result.get('status')=='already_running' or result.get('failures'):break
        if not (again is not None and again(result)) and not due(load_json,config_path,started,name):break
        started=time.time();result=run(config_path,catalogue_path)
    return result
