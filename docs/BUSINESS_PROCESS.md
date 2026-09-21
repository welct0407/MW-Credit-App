# Agent service processes

The authoritative editable diagram is [BUSINESS_PROCESS.drawio](BUSINESS_PROCESS.drawio). Its 14 linked pages contain an overview and a detailed page for each service, including disabled and pending capabilities. Each detail page names its scripts, steps, decisions and exceptions. [BUSINESS_PROCESS.png](BUSINESS_PROCESS.png) is the overview; individual page images are in [process-pages](process-pages/). Regenerate after a process change:

```powershell
python scripts/generate-business-process.py
& 'C:\Program Files\draw.io\draw.io.exe' --export --format png --scale 1.2 --output docs\BUSINESS_PROCESS.png docs\BUSINESS_PROCESS.drawio
```

The visual style follows MW-Partner-Operations: blue rounded process boxes, yellow decision diamonds, labeled orthogonal branches, red stop paths and grey side notes. Each page retains an explicit LIVE, PENDING or DISABLED status. The overview uses green for live services, amber for pending payment posting and grey for disabled services. A diagram page does not activate a capability.

Owner correction, 21 September: all Partner notifications start with Instagram and use email only as fallback. Receipt success requires verified payment readback and must not send to the borrower/group. The parameterized `receipt-prepare` command shares extraction and validation with the webhook worker; no person-specific scripts are maintained. The real loan-close test remains unposted while its reusable posting stage is pending.
