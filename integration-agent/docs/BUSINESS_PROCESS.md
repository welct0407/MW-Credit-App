# Agent service processes

**Historical diagram:** the AppSheet API paths in this diagram and its generator describe the pre-retirement architecture. Current native runtime, monitoring and configuration are documented in [Partner conversations](PARTNER_CONVERSATIONS.md) and [Operations](OPERATIONS.md); do not use the diagram's legacy setup commands.


The authoritative editable diagram is [BUSINESS_PROCESS.drawio](BUSINESS_PROCESS.drawio). Its 18 linked pages start with an agent operating-flow overview (01), followed by the service index (02) and a detailed page for each service, including disabled and pending capabilities. Each detail page names its scripts, steps, decisions and exceptions. [BUSINESS_PROCESS.png](BUSINESS_PROCESS.png) is the overview; individual page images are in [process-pages](process-pages/). The drawio contains targeted changes; reconcile the historical generator before rebuilding it. To export the current overview:

```powershell
& 'C:\Program Files\draw.io\draw.io.exe' --export --format png --scale 1.2 --output docs\BUSINESS_PROCESS.png docs\BUSINESS_PROCESS.drawio
```

The visual style follows MW-Partner-Operations: blue rounded process boxes, yellow decision diamonds, labeled orthogonal branches, red stop paths and grey side notes. Each page retains an explicit LIVE, PENDING or DISABLED status. The service index uses green for live services, amber for decisions and grey for disabled services. A diagram page does not activate a capability.

22 September: the conversation detail page and overview/index include persistent signed Partner conversations, current business-data tools and Codex-selected general API operations. Receipt approval authority stays separate. GUI workflows remain unavailable; see [conversation operations](PARTNER_CONVERSATIONS.md).

Owner correction, 21 September: all Partner notifications start with Instagram and use email only as fallback. Receipt success requires verified payment readback and must not send to the borrower/group. The parameterized `receipt-prepare` command shares extraction and validation with the webhook worker; no person-specific scripts are maintained. New ordinary payments post automatically; overpayments require reviewer approval; loan closures stay manual. See PARTNER_REVIEW.md.

25 September: receipt/polling/automatic-payment pages reflect bounded attempts, item isolation, held-receipt alerts and UNKNOWN reconciliation. Existing PNGs are historical snapshots. Monitoring implementation is delegated through MONITORING_IMPLEMENTATION_HANDOVER.md.

25 September revision22: receipt validation, review and conversation pages now show direct-reply hold rejection and exclusive review ownership of every direct reply. History/deduplication retained, acknowledgement to deciding reviewer, no posting. PNG snapshots remain historical; use the editable diagram for current logic.
