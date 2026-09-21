# Agent service processes

The authoritative editable diagram is [BUSINESS_PROCESS.drawio](BUSINESS_PROCESS.drawio). Its 17 linked pages start with an agent operating-flow overview (01), followed by the service index (02) and a detailed page for each service, including disabled and pending capabilities. Each detail page names its scripts, steps, decisions and exceptions. [BUSINESS_PROCESS.png](BUSINESS_PROCESS.png) is the overview; individual page images are in [process-pages](process-pages/). Regenerate after a process change:

```powershell
python scripts/generate-business-process.py
& 'C:\Program Files\draw.io\draw.io.exe' --export --format png --scale 1.2 --output docs\BUSINESS_PROCESS.png docs\BUSINESS_PROCESS.drawio
```

The visual style follows MW-Partner-Operations: blue rounded process boxes, yellow decision diamonds, labeled orthogonal branches, red stop paths and grey side notes. Each page retains an explicit LIVE, PENDING or DISABLED status. The service index uses green for live services, amber for decisions and grey for disabled services. A diagram page does not activate a capability.

22 September: the conversation detail page and overview/index include persistent signed Partner conversations, current business-data tools and Codex-selected general API operations. Receipt approval authority stays separate. GUI workflows remain unavailable; see [conversation operations](PARTNER_CONVERSATIONS.md).

Owner correction, 21 September: all Partner notifications start with Instagram and use email only as fallback. Receipt success requires verified payment readback and must not send to the borrower/group. The parameterized `receipt-prepare` command shares extraction and validation with the webhook worker; no person-specific scripts are maintained. Partner review now gates ordinary payment posting; loan closes and overpayments are manual-only by owner decision. See PARTNER_REVIEW.md.
