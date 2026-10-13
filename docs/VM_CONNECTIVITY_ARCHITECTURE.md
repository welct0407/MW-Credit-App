# Debian VM connectivity architecture

**Historical diagram:** the AppSheet API paths in this diagram and its generator describe the pre-retirement architecture. Current native runtime, monitoring and configuration are documented in [Partner conversations](PARTNER_CONVERSATIONS.md) and [Operations](OPERATIONS.md); do not use the diagram's legacy setup commands.


The authoritative editable diagram is [VM_CONNECTIVITY_ARCHITECTURE.drawio](VM_CONNECTIVITY_ARCHITECTURE.drawio). A rendered preview is available at [VM_CONNECTIVITY_ARCHITECTURE.png](VM_CONNECTIVITY_ARCHITECTURE.png).

It documents the current connectivity boundaries for `vm-mw-credit-agent`: Tailscale administration, IAP recovery, disabled public SSH/RDP, Cloudflare webhook ingress, agent runtime services, Cloud SQL Auth Proxy, AppSheet and messaging APIs, telemetry, GitHub deployment and disk snapshots.

Regenerate and render after a material infrastructure or connectivity change:

```powershell
python scripts/generate-vm-connectivity-architecture.py
& 'C:\Program Files\draw.io\draw.io.exe' --export --format png --scale 1.1 --output docs\VM_CONNECTIVITY_ARCHITECTURE.png docs\VM_CONNECTIVITY_ARCHITECTURE.drawio
```

The diagram describes connectivity; it does not authorize a new integration, public listener, data write or notification route.

R015 adds `mw_agent` for runtime journals/audit alongside `loan_manager_prod` on the existing Cloud SQL instance. Separate reporting, reviewer DML, worker and relay logins use the same loopback proxy. The VM retains Codex-owned session/auth files and frozen recovery copies. Existing network routes and instance settings are unchanged.
