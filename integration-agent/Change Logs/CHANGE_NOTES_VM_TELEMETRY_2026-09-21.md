# VM guest telemetry — 2026-09-21

## Scope and purpose

Restore guest-level Compute Engine telemetry for `vm-mw-credit-agent` so memory utilization can be observed over time before any machine downsizing decision.

Starting Git commit: `b6d0d4ce52f04d437f0bb7abf272dd1267da9a71`.

## Diagnosis

- Native Compute Engine CPU, network and disk-performance metrics were present, but guest memory and filesystem charts had no data.
- Ops Agent 2.71.0 was already installed, enabled and active through the existing `goog-ops-agent-policy` label and OS Config metadata.
- Monitoring and Logging APIs were already enabled, and the VM had the full `cloud-platform` access scope.
- Ops Agent startup diagnostics identified the missing configuration: the VM service account had Cloud SQL Client only and lacked Monitoring Metric Writer and Logs Writer.

## Changes

- Granted `roles/monitoring.metricWriter` to `mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com`.
- Granted `roles/logging.logWriter` to the same VM service account.
- Restarted the Ops Agent; its metrics collector and logging collector remained active.
- Updated runtime documentation with the policy, IAM and verification requirements.

## Verification

- Direct Cloud Monitoring API readback found five `agent.googleapis.com/memory/percent_used` time series and 15 points for this VM.
- The latest sampled `used` value was approximately 14%; this single early sample is connectivity evidence, not sizing evidence.
- After IAM propagation and a final restart, Ops Agent ports, network and API startup checks all reported `PASS`.
- Both the OpenTelemetry metrics collector and Fluent Bit logging collector reported active.

## Rollback

Remove the two project IAM bindings from the VM service account and restart the Ops Agent. Removing Monitoring Metric Writer stops new guest metrics; historical telemetry follows Cloud Monitoring retention.

Status: memory telemetry is collecting. Gather a representative multi-day or multi-week window, including scheduled jobs, before selecting a smaller machine type.
