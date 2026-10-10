# DEV PWA Hosting delivery and recovery

Canonical install origin is https://dev-lm.mw-credit.com; web.app remains online fallback. Use the managed-config live build, then `node scripts/deploy-hosting.mjs --live-dev --check` before delivery. The helper requires real worker/manifest/offline/icon files and supplies explicit MIME/no-store headers. Static files take precedence over the SPA rewrite. No secrets are loaded by --check.

Record the prior Hosting release and application/worker build before each delivery. The first PWA baseline is Hosting ccb0af261babf04b (pre-worker). Restoring that old Hosting version alone is not sufficient: /sw.js would rewrite to HTML and an installed worker could survive.

Normal rollback builds the reviewed earlier PWA source and deploys its valid /sw.js at the same URL. Exercise its waiting/explicit-update behavior before production use. For retreat to the pre-worker baseline, build the earlier source into a live-dev-marked artifact in an isolated checkout, retain a recovery copy of the current artifact, and deploy with the maintained helper `--live-dev --retire-pwa`. This explicit flag overlays scripts/pwa-retirement-worker.js into the upload without editing the artifact. The retirement worker activates immediately for recovery only, removes only mw-credit-dev-public-* caches and unregisters itself. It has no fetch handler, does not reload clients, and does not touch Firebase/localStorage/IndexedDB. Existing open pages can reload manually; new navigation uses the network.

Do not deploy retirement over a still-registering PWA source as a lasting rollback: use the paired pre-worker frontend artifact. Do not simply delete /sw.js. C must verify worker retirement/cache isolation on synthetic local builds before first delivery. No live rollback is required merely to test this mechanism.

Current live HTTP headers remain no-store. The worker separately caches only the public versioned shell/hashed JS/CSS/icons from its explicit allowlist. Installed root navigation reads the active public shell cache first; update checks run separately and a waiting build still requires explicit safe activation. Cross-origin API, authenticated requests and business/receipt responses are never cached by the worker. Authorized viewed records/drafts follow their existing owner/lease rules; cached shell delivery does not authorize offline financial posting.

## Existing command image build identity
For a changed command-service read adapter, build from the clean pinned source with:
`gcloud builds submit --project clever-oasis-508610-n7 --region asia-southeast1 --config cloudbuild-command.yaml --service-account projects/clever-oasis-508610-n7/serviceAccounts/mw-credit-app-build@clever-oasis-508610-n7.iam.gserviceaccount.com --gcs-source-staging-dir gs://mw-credit-app-builds-737787224638/source --async`.
Use the existing dedicated builder and source bucket; omitting these selects a default compute identity/bucket that lacks the required source access. Pin the successful digest, review the existing image-only Terraform plan, then deliver the matched configured frontend. This does not grant new IAM or authorize PROD.
