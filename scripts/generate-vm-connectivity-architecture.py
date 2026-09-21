"""Generate the editable Debian VM connectivity architecture diagram."""

from pathlib import Path
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "VM_CONNECTIVITY_ARCHITECTURE.drawio"

mxfile = ET.Element(
    "mxfile", host="app.diagrams.net", type="device", version="24.7.17"
)
diagram = ET.SubElement(mxfile, "diagram", id="vm-connectivity", name="VM connectivity")
model = ET.SubElement(
    diagram,
    "mxGraphModel",
    grid="1",
    gridSize="10",
    page="1",
    pageScale="1",
    pageWidth="1800",
    pageHeight="1250",
    background="#ffffff",
)
root = ET.SubElement(model, "root")
ET.SubElement(root, "mxCell", id="0")
ET.SubElement(root, "mxCell", id="1", parent="0")


def vertex(key, label, x, y, width, height, style):
    cell = ET.SubElement(
        root,
        "mxCell",
        id=key,
        value=label,
        style=style,
        vertex="1",
        parent="1",
    )
    ET.SubElement(
        cell,
        "mxGeometry",
        x=str(x),
        y=str(y),
        width=str(width),
        height=str(height),
        **{"as": "geometry"},
    )


def edge(
    key,
    source,
    target,
    label,
    color="#475569",
    dashed=False,
    points=None,
    ports="",
):
    style = (
        "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;"
        "jettySize=auto;html=0;endArrow=block;endFill=1;"
        f"strokeColor={color};strokeWidth=2;fontColor=#334155;fontSize=13;"
        "labelBackgroundColor=#ffffff;"
    )
    if dashed:
        style += "dashed=1;dashPattern=6 4;"
    style += ports
    cell = ET.SubElement(
        root,
        "mxCell",
        id=key,
        value=label,
        style=style,
        edge="1",
        parent="1",
        source=source,
        target=target,
    )
    geometry = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
    if points:
        array = ET.SubElement(geometry, "Array", **{"as": "points"})
        for point_x, point_y in points:
            ET.SubElement(array, "mxPoint", x=str(point_x), y=str(point_y))


container = (
    "rounded=1;arcSize=8;whiteSpace=wrap;html=0;fillColor=#f8fafc;"
    "strokeColor=#64748b;strokeWidth=2;fontColor=#172b4d;fontSize=18;"
    "fontStyle=1;align=left;verticalAlign=top;spacingTop=12;spacingLeft=14;"
)
gcp_container = container.replace("#f8fafc", "#eef6ff").replace("#64748b", "#4285f4")
vm_container = container.replace("#f8fafc", "#ffffff").replace("#64748b", "#6c8ebf")
external = (
    "rounded=1;arcSize=12;whiteSpace=wrap;html=0;fillColor=#fff2cc;"
    "strokeColor=#d6b656;strokeWidth=2;fontColor=#172b4d;fontSize=15;"
    "align=center;verticalAlign=middle;spacing=10;"
)
service = (
    "rounded=1;arcSize=12;whiteSpace=wrap;html=0;fillColor=#dae8fc;"
    "strokeColor=#6c8ebf;strokeWidth=2;fontColor=#172b4d;fontSize=15;"
    "align=center;verticalAlign=middle;spacing=10;"
)
live = service.replace("#dae8fc", "#d5e8d4").replace("#6c8ebf", "#82b366")
note = (
    "rounded=1;arcSize=8;whiteSpace=wrap;html=0;fillColor=#f5f5f5;"
    "strokeColor=#999999;fontColor=#334155;fontSize=13;"
    "align=left;verticalAlign=middle;spacing=10;"
)
blocked = (
    "rounded=1;arcSize=8;whiteSpace=wrap;html=0;fillColor=#f8cecc;"
    "strokeColor=#b85450;strokeWidth=2;fontColor=#7f1d1d;fontSize=14;"
    "fontStyle=1;align=center;verticalAlign=middle;spacing=8;"
)
title = (
    "rounded=1;arcSize=8;whiteSpace=wrap;html=0;fillColor=#172b4d;"
    "strokeColor=#172b4d;fontColor=#ffffff;fontSize=24;fontStyle=1;"
    "align=center;verticalAlign=middle;spacing=10;"
)

vertex(
    "title",
    "MW INTEGRATION AGENT | Debian 13 VM connectivity architecture",
    30,
    20,
    1730,
    60,
    title,
)
vertex(
    "subtitle",
    "Normal administration is private through Tailscale. GCP IAP is the recovery path. Public SSH/RDP are disabled.",
    210,
    90,
    1370,
    45,
    note.replace("align=left", "align=center"),
)

vertex("external-boundary", "EXTERNAL ACTORS AND EDGES", 30, 160, 330, 990, container)
vertex("gcp-boundary", "GCP PROJECT · clever-oasis-508610-n7", 390, 160, 920, 990, gcp_container)
vertex("services-boundary", "MANAGED AND EXTERNAL SERVICES", 1340, 160, 420, 990, container)

vertex(
    "admin",
    "Windows administration VM\nvm-01 · Tailscale 100.105.34.28\nPowerShell · OpenSSH · gcloud",
    70,
    220,
    250,
    105,
    live,
)
vertex(
    "meta-inbound",
    "Meta / Instagram\nWebhook sender",
    70,
    405,
    250,
    80,
    external,
)
vertex(
    "cloudflare",
    "Cloudflare edge and Tunnel\nhooks.mw-credit.com/instagram",
    70,
    545,
    250,
    95,
    external,
)
vertex(
    "github",
    "GitHub\nMW-Integration-Agent repository",
    70,
    710,
    250,
    80,
    external,
)
vertex(
    "tailscale-control",
    "Tailscale control plane and DERP\nOutbound HTTPS 443\nDirect peer UDP when available",
    70,
    820,
    250,
    85,
    external,
)
vertex(
    "internet",
    "Untrusted public Internet\nTCP 22 and 3389",
    70,
    955,
    250,
    75,
    external,
)

vertex(
    "firewall",
    "VPC FIREWALL · default network\nALLOW TCP 22 from IAP 35.235.240.0/20 to dedicated service account\nDISABLED default worldwide SSH and RDP rules",
    430,
    210,
    840,
    100,
    live,
)
vertex(
    "public-block",
    "BLOCKED\nNo direct public SSH/RDP",
    430,
    330,
    220,
    70,
    blocked,
)
vertex(
    "iap",
    "Google IAP TCP forwarding\nRecovery SSH only",
    770,
    330,
    230,
    70,
    external,
)
vertex(
    "address-note",
    "NIC nic0\nPrivate 10.148.0.2\nStatic public 136.85.96.197\nPublic IP retained; no public app listener",
    1040,
    325,
    230,
    85,
    note,
)

vertex(
    "vm-boundary",
    "COMPUTE ENGINE · vm-mw-credit-agent · Debian 13 · Asia/Bangkok · e2-small",
    430,
    430,
    840,
    650,
    vm_container,
)
vertex(
    "tailscale",
    "tailscaled 1.102.4\n100.71.171.91\nNo exit node / subnet routes / Tailscale SSH",
    470,
    495,
    230,
    105,
    live,
)
vertex(
    "sshd",
    "OpenSSH sshd\nPublic-key only\nRoot and password login disabled",
    735,
    495,
    230,
    105,
    live,
)
vertex(
    "cloudflared",
    "cloudflared\nOutbound tunnel\nOrigin 127.0.0.1:8000",
    1000,
    495,
    230,
    105,
    live,
)
vertex(
    "agent",
    "MW Integration Agent runtime\nSigned webhook · receipt validation · Partner review\nConversation polling · daily cash statement · bounded delivery",
    470,
    640,
    760,
    105,
    service,
)
vertex(
    "proxy",
    "Cloud SQL Auth Proxy 2.25.4\n127.0.0.1:5432\nDedicated read-only database role",
    470,
    790,
    350,
    95,
    live,
)
vertex(
    "observability",
    "Ops Agent + OS Config agent\nGuest metrics · logs · OS inventory",
    880,
    790,
    350,
    95,
    live,
)
vertex(
    "source",
    "Source checkout /opt/mw-integration-agent-src\nInstalled app /opt/mw-integration-agent\nRead-only GitHub deploy key",
    470,
    930,
    350,
    95,
    note,
)
vertex(
    "disk",
    "Persistent disk + private runtime state\nSnapshot policy default-schedule-1\nSecrets stay outside Git and metadata",
    880,
    930,
    350,
    95,
    note,
)

vertex(
    "cloudsql",
    "Cloud SQL\nappsheet-pg-prod-20260914\nloan_manager_prod",
    1385,
    665,
    330,
    90,
    external,
)
vertex(
    "appsheet",
    "AppSheet PROD OLTP + OLAP APIs\nHTTPS 443 · bounded Find reads\nScoped approved write path",
    1385,
    235,
    330,
    95,
    external,
)
vertex(
    "meta-api",
    "Meta Graph API\nHTTPS 443\nInstagram reads and authorized delivery",
    1385,
    380,
    330,
    90,
    external,
)
vertex(
    "msgraph",
    "Microsoft Graph · HTTPS 443\nPartner email fallback",
    1385,
    520,
    330,
    80,
    external,
)
vertex(
    "google-apis",
    "Google control plane APIs\nMonitoring · Logging · OS Config\nCloud SQL connector IAM",
    1385,
    805,
    330,
    95,
    external,
)
vertex(
    "package-sources",
    "Outbound software sources\nDebian · Tailscale · GitHub\nHTTPS only through default egress",
    1385,
    950,
    330,
    90,
    external,
)
vertex(
    "legend",
    "LEGEND\nGreen = active security/runtime control\nBlue = agent component\nYellow = external system\nRed = explicitly blocked public path\nDashed = management or recovery",
    1385,
    1035,
    330,
    95,
    note,
)

edge(
    "e-admin-tail",
    "admin",
    "tailscale",
    "",
    "#82b366",
    points=[(380, 272), (380, 465), (585, 465)],
    ports="exitX=1;exitY=0.5;entryX=0.5;entryY=0;",
)
edge("e-tail-ssh", "tailscale", "sshd", "", "#82b366")
edge(
    "e-tail-control",
    "tailscale",
    "tailscale-control",
    "",
    "#82b366",
    True,
    points=[(380, 548), (380, 862)],
    ports="exitX=0;exitY=0.5;entryX=1;entryY=0.5;",
)
edge("e-iap-fw", "iap", "firewall", "", "#d6b656", True)
edge("e-fw-ssh", "firewall", "sshd", "", "#d6b656", True)
edge(
    "e-public-block",
    "internet",
    "public-block",
    "",
    "#b85450",
    points=[(350, 992), (350, 365)],
    ports="exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
)
edge("e-meta-cf", "meta-inbound", "cloudflare", "HTTPS webhook", "#6c8ebf")
edge(
    "e-cf-tunnel",
    "cloudflared",
    "cloudflare",
    "",
    "#6c8ebf",
    points=[(1245, 420), (380, 420), (380, 592)],
    ports="exitX=0.5;exitY=0;entryX=1;entryY=0.5;",
)
edge("e-tunnel-agent", "cloudflared", "agent", "", "#82b366")
edge("e-agent-proxy", "agent", "proxy", "", "#82b366")
edge(
    "e-proxy-sql",
    "proxy",
    "cloudsql",
    "",
    "#82b366",
    points=[(1325, 837), (1325, 710)],
    ports="exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
)
edge(
    "e-agent-appsheet",
    "agent",
    "appsheet",
    "",
    "#6c8ebf",
    points=[(1325, 660), (1325, 282)],
    ports="exitX=1;exitY=0.2;entryX=0;entryY=0.5;",
)
edge(
    "e-agent-meta",
    "agent",
    "meta-api",
    "",
    "#6c8ebf",
    points=[(1325, 692), (1325, 425)],
    ports="exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
)
edge(
    "e-agent-ms",
    "agent",
    "msgraph",
    "",
    "#6c8ebf",
    points=[(1325, 724), (1325, 560)],
    ports="exitX=1;exitY=0.8;entryX=0;entryY=0.5;",
)
edge(
    "e-obs-google",
    "observability",
    "google-apis",
    "",
    "#82b366",
    ports="exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
)
edge(
    "e-github-source",
    "github",
    "source",
    "",
    "#6c8ebf",
    points=[(380, 750), (380, 977)],
    ports="exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
)
edge(
    "e-source-agent",
    "source",
    "agent",
    "",
    "#64748b",
    True,
    points=[(850, 977), (850, 760)],
    ports="exitX=1;exitY=0.5;entryX=0.5;entryY=1;",
)
edge(
    "e-agent-disk",
    "agent",
    "disk",
    "",
    "#64748b",
    points=[(1250, 745), (1250, 977)],
    ports="exitX=1;exitY=1;entryX=1;entryY=0.5;",
)

ET.indent(mxfile, space="  ")
ET.ElementTree(mxfile).write(OUTPUT, encoding="utf-8", xml_declaration=True)
print(OUTPUT)
