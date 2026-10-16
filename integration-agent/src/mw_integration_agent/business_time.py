"""The one business timezone (ALL-STD-01): Asia/Bangkok, imported everywhere it is needed."""
from datetime import datetime
from zoneinfo import ZoneInfo

BANGKOK = ZoneInfo('Asia/Bangkok')


def today():
    return datetime.now(BANGKOK).date()
