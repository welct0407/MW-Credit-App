"""Update the bounded lump-sum release sections; preserve unrelated documentation."""
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
prod = '--production' in sys.argv
version = next((x.split('=', 1)[1] for x in sys.argv if x.startswith('--version=')), '3.000071')
status = f'Production OLTP **{version}**, Dev OLTP **1.000019**, both databases **Flyway V4**.' if prod else 'Dev OLTP **1.000019 / Flyway V4** verified; production **3.000071 / V1**, authorized cutover pending.'
section = f'''### Lump-sum release — 15 September 2026

{status} OLAP versions remain production **1.100051** and development **1.000027**. The [release report](../outputs/lumpsum-promotion-20260915/REPORT.md) supersedes the historical V3 design and notification limitation.

PostgreSQL prepares positive allocations and matching repayments atomically, newest eligible charge first with immutable-key ties and interest before principal. Existing AppSheet actions finalize the receipt and close paid loans, producing the existing notification events. Processing remains visible if finalization fails; prepared receipts cannot allocate twice and block another lump-sum receipt until reconciled. SQL validates the final Posted transition. Seven indexes, three functions and four triggers reuse existing tables and columns; no queue or new business field exists. New ls2: children retain negative Allocation Order in Charge Row Number Snapshot. Historical rows retain their prior interpretation.

The receipt event and group both use `[Status] = "Processing"`. Three allocation actions skip Lump Sum; two reconcile assignments select Posted/NOW() for Lump Sum and preserve original other-method expressions. [Exact action expressions](../outputs/lumpsum-promotion-20260915/action-expressions.json) are promotion evidence. Both apps read the same ledger, sources remain isolated (production database-2, Dev database-3), and no schema regeneration, Ref, slice or business-column change is required.

Production notification events, templates and recipient expressions are retained. The owner explicitly authorized the three Dev push bots with `LIST("welct0407@mw-credit.com")` as their sole recipient expression. Other Dev scheduled/export bots remain disabled. Dev Payment Received and Loan Closed runs completed in AppSheet; device receipt is not independently confirmed. New-GUI Dev receipt allocation, finalization, closure and OLAP readback passed. V4 SQL regression and concurrency passed. Earlier V3 speed measurements remain historical; no new V4/production speed percentage is claimed. Offline multi-device recovery, scheduled exports and Looker remain unverified.

Rollback points: Dev OLTP **1.000014**, production OLTP **3.000071**, OLAP unchanged. Production logical backup was restored successfully with all 14 business tables matching. Reconcile prepared receipts before fallback; use a higher migration to disable the processor and restore original action expressions, retaining ledger history and guards. App rollback alone does not undo SQL changes.

'''
def write(name, text):
    (root / name).write_text(text, encoding='utf-8')
def replace_section(text, start, end, replacement):
    a=text.index(start); b=text.index(end,a)
    return text[:a]+replacement+text[b:]
p='Documents/AppSheet_Data_Model_Overview.md'; text=(root/p).read_text(encoding='utf-8')
start='### Lump-sum release' if '### Lump-sum release' in text else '### Development lump-sum replacement'
write(p,replace_section(text,start,'## Production table catalog',section))
p='Documents/Development_Changes.md'; text=(root/p).read_text(encoding='utf-8')
text=text.replace('development OLTP **1.000014**','development OLTP **1.000019**').replace('Production OLTP retains its earlier **3.000070** capture.',f'Production OLTP is **{version}**.')
text=text.replace('| SQL schema | Flyway baseline 1 | Flyway V3 | Intentional V2/V3 lump-sum functions, triggers and indexes; exact hashes in the review evidence |',f'| SQL schema | {"Flyway V4" if prod else "Flyway V1"} | Flyway V4 | Exact migration hashes in the release manifest |')
text=text.replace('| Lump-sum receipt processing | Five AppSheet stages | Atomic SQL allocation/posting/closure; AppSheet conditions exclude Lump Sum | Implemented and tested in Dev; owner review pending |',f'| Lump-sum receipt processing | {"Same as Dev" if prod else "Five AppSheet stages"} | SQL preparation; existing AppSheet finalization/closure | {"Promoted" if prod else "Verified; authorized promotion pending"} |')
start='### Lump-sum release' if '### Lump-sum release' in text else '## Lump-sum development candidate'
text=replace_section(text,start,'## Assessment prototype design',section)
text=text.replace('Nonessential or confusing bots, especially notifications, must remain disabled.','Nonessential or confusing bots remain disabled, except the owner-authorized three Dev push bots routed exclusively to the owner account as documented above.')
write(p,text)
p='Documents/Environment_Inventory.md'; text=(root/p).read_text(encoding='utf-8')
text=text.replace('| 1.000014 | database-3 |','| 1.000019 | database-3 |')
if prod:text=text.replace('| 3.000071 | database-2 |',f'| {version} | database-2 |')
text=text.replace('| Flyway | Successful explicit baseline 1 | V2/V3 successfully migrated and validated | Lump-sum development evidence, 15 Sep; production baseline retains prior capture |',f'| Flyway | {"V4 migrated and validated" if prod else "Baseline V1"} | V4 migrated and validated | Lump-sum release report, 15 September |')
start='### Lump-sum release' if '### Lump-sum release' in text else '## Development update — lump-sum workflow'
write(p,replace_section(text,start,'## Verification coverage',section))
p='Change Logs/CHANGE_NOTES_DB_LUMPSUM_2026-09-15.md'; text=(root/p).read_text(encoding='utf-8')
marker='## V4 release status (supersedes historical sections)'
if marker in text:text=text[:text.index(marker)]
text+='\n'+marker+'\n\n'+section+'\nMaintained V4 artifacts: immutable V4 migration, Test-LumpSumAppFinalization.sql, updated concurrency test, release action expressions, report and dictionary/doc builders. Complete local V1–V4 regression, validation and concurrency passed. Dev appdoc version 1.000019 confirms saved configuration. Production promotion was explicitly authorized; this authorization also preserves existing production notification features. The queue proposal was discarded without a Dev/production table. Detailed backup, notification run IDs, test receipts and measurement limitations are in the release report. Model overview, canonical dictionary, development/environment registers and this log are updated together. Historical sections below/above describe earlier stages only.\n'
write(p,text)
p='outputs/lumpsum-db-20260915/REPORT.md'; text=(root/p).read_text(encoding='utf-8')
note='> Superseded for release design by [V4 promotion report](../lumpsum-promotion-20260915/REPORT.md). Measurements below are historical V3 results. V4 retains existing AppSheet notification events; the benchmark loan was subsequently fully paid.\n\n'
if not text.startswith('> Superseded'):write(p,note+text)
