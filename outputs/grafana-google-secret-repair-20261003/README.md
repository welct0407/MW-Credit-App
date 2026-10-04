# Contained Google-secret version repair — 3 October 2026

**Ready for fresh secure Connect; authentication success is not yet established.**

The user confirmed secure secret entry at 08:19 UTC. Metadata identified exactly
one new enabled version after 08:13 UTC: `mw-grafana-google-client-secret:2`,
created **08:18:48.072037 UTC**. The agent read metadata only, never the payload,
and did not create or rotate Google credentials. [Version metadata](secret-version-metadata.json).

Ready revision **`mw-grafana-events-00006-qm4` serves 100% traffic**. The Google
mount uses version **2**; the other four dedicated secret mounts remain version
**1**. Google client ID, private owner pins, `OWNER_ENABLED=true`, runtime identity,
canonical URLs, limits and reviewed diagnostic image are unchanged. Owner subject
and email are redacted. Callbacks deny all subscriptions, Scheduler remains
absent, and Grafana routing/IAM/network were not changed.

The supported CLI initially produced candidate `00005-nt4` with an unused old
Google volume reference. Traffic stayed on `00004-cff`. Only that unused reference
was removed; candidate `00006-qm4` was verified to have exactly five references
and five mounted paths before the switch. All other four volume names/paths and
the full non-mount runtime spec compare unchanged. The Google volume's generated
name changed; its existing file path and secret identity were preserved.

- [Prior active config and image](before.json)
- [Staged verification](staged.json), [final ready/traffic/mount readback](after.json)
- [Exact repair summary](repair-summary.json)
- [13/13 relevant HTTPS checks](https-acceptance.json), with normal TLS, no redirect
  following, no retained/sent cookies and no Google consent or token creation.

Rollback revision `mw-grafana-events-00004-cff` is retained Ready with the same
image and prior Google mount version 1. For scoped configuration rollback:

```sh
/workspace/.setup/cloud-gcloud gcloud -- run services update-traffic mw-grafana-events --region=asia-southeast1 --to-revisions=mw-grafana-events-00004-cff=100
```

The parent can now initiate a **fresh** Connect flow through the existing private
cloud plugin. Prior OAuth state was consumed before the failed exchange and must
not be replayed. Google token exchange, ID-token verification, host connection
and authenticated MCP acceptance remain pending that attempt. Diagnostic-only
constant phase/error labels remain available if needed. No event activation is
part of this repair. R050 remains Open and PR 3 remains draft.
