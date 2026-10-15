# Owner-only Cloud Shell application-key seeding

This is a user-executed secret step, separate from deployment in Codex Cloud. The
standalone [cloud-shell-seed.py](cloud-shell-seed.py) adapts the reviewed formats
and guards from `seed-secrets.py` and `owner-bootstrap.py` at source pin
`4b582cb1d0fde993ec7d735da116d218aa8798b8`. It has no companion files, package
dependencies, repository authentication, downloads, login fallback or installation.
It never reads any secret payload or asks for the Google client secret.

## Minimal handoff

1. Obtain the exact reviewed `cloud-shell-seed.py` file from this task's deliverable.
   Open official Google Cloud Shell as **welct0407@mw-credit.com**. Complete its
   standard browser authorization if required; do not change accounts or IAM to
   bypass a script failure. Use **More → Upload** to upload this one non-secret
   source file into the home directory. No Git clone or CLI credentials are needed.
   [Official file-upload instructions](https://docs.cloud.google.com/shell/docs/uploading-and-downloading-files).
2. In the owner's terminal, run:

   ```sh
   python3 ~/cloud-shell-seed.py
   ```

3. Read the displayed fixed account/project and missing-container list. To authorize
   only the listed application-secret additions, type **SEED FOUR APP KEYS** at the
   terminal prompt. Any other response exits before generation or uploads.
4. Share only the printed `projects/737787224638/secrets/.../versions/N` names.
   Never retrieve, display, copy or transmit the values through an agent.

Optional `python3 ~/cloud-shell-seed.py --check` performs only tool/metadata checks,
without requiring confirmation or generating keys. It is unnecessary before the
normal command because that command performs the same checks before its prompt.
Do not run the script with tracing, debuggers or output wrappers that inspect process
memory/stdin, and do not run another secret writer concurrently.

## Exact scope and guards

The script verifies an actual active human account of `welct0407@mw-credit.com`
(without an account flag that could override the observed selection), no environment
credential override or configured impersonation, ACTIVE project
`clever-oasis-508610-n7` / `737787224638`, and a direct unconditional `roles/owner`
binding for that human. It checks Python, gcloud and Node's built-in crypto API before
mutation; no package installation or key generation occurs in the tool probe.

All five existing containers must have the exact bootstrap `bridge` label
`grafana-mcp-bootstrap-v1`. All their version metadata is read before mutation.
`mw-grafana-google-client-secret/versions/1` must be ENABLED; its payload is never
read, and no Google secret version is added or altered.

For each of the other four containers, **any existing version**, including disabled
or destroyed versions, causes preservation rather than generation. Only a container
with zero versions can receive a new version:

| Container | Reviewed generated format |
| --- | --- |
| `mw-grafana-hmac` | JSON array containing one `token_urlsafe(48)` value |
| `mw-grafana-state-key` | Canonical base64 of 32 random bytes |
| `mw-grafana-cookie-keys` | JSON array containing one `token_urlsafe(48)` value |
| `mw-grafana-oauth-jwks` | Private RSA-2048 signing JWKS, random kid, RS256 |

Values are generated in memory and submitted only through Secret Manager stdin.
There are no value files, value command arguments or emitted value diagnostics.
Child SDK HTTP/file logging is disabled for these invocations without changing the
owner's saved configuration. Subprocess failures/timeouts suppress captured output.
Stdout contains only verified version resource names; stderr contains the consent
notice, fixed safe status/error messages and no SDK output or values.

## Race and partial-failure handling

Identity is checked again after confirmation. All five version sets/states are
compared with the preflight snapshot before generation, after generation and between
uploads. A created version must be ENABLED version 1, followed by readback of exactly
that single version. A metadata change or unexpected upload result stops the script.

Secret Manager's [addVersion API](https://docs.cloud.google.com/secret-manager/docs/reference/rest/v1/projects.secrets/addVersion)
has no empty-container/compare-and-set precondition. These guards detect observed
races; they cannot prevent a concurrent write in the final read/upload gap. Do not
run concurrent seeders. The script makes no retry loop and no destructive recovery;
an SDK timeout/failure may leave a successfully created version whose acknowledgment
was lost. Inspect **version metadata only** in Console before a deliberate rerun.
Retain every version. A rerun preserves any existing version and will not regenerate
that container. A raced/non-1 version or disabled/destroyed-only container needs owner
review before runtime use; preservation is not a readiness claim.

No Cloud Run deployment, IAM, DNS, network, OAuth grant, Scheduler or Grafana change
is performed. Seeding does not establish full runtime readiness. Verified owner
Google subject, host OAuth client/redirect/callback hosts, pinned ENABLED version
numbers and a reviewed application digest remain separate prerequisites.

## Offline verification

`python3 -B deploy/test_cloud_shell_seed.py` uses only mocked subprocesses and mocked
randomness/Node outputs. It never runs real key generation or GCP commands. These
tests are included in the existing Linux/Windows bridge CI workflow. See
[task evidence](../../../../outputs/grafana-cloud-shell-seeding-20261003/README.md).
