# R089 Grafana revamp: log-based metrics for the DEV reader and command
# services (design section New telemetry C). Logging metrics are project-wide
# and DEV and PROD share one project, so each stack owns its own
# environment-suffixed names and matches only its own services. R093 adds the
# chat service turn metrics.
locals {
  log_metric_env      = "dev"
  log_metric_services = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=~\"^mw-credit-app-(read|command)-dev$\""
  log_metric_command  = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mw-credit-app-command-dev\""
  log_metric_chat     = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mw-credit-app-chat-dev\" AND jsonPayload.event=\"chat_turn\""
}

# Reads the existing read_request/command_request completion records (jsonPayload.code).
resource "google_logging_metric" "api_result_codes" {
  project     = local.project
  name        = "mw_api_result_codes_${local.log_metric_env}"
  description = "R089: DEV reader/command API session and body-timeout result codes (counts only)."
  filter      = "${local.log_metric_services} AND jsonPayload.event=~\"^(read_request|command_request)$\" AND jsonPayload.code=~\"^(session_invalid|session_check_unavailable|body_timeout)$\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key        = "code"
      value_type = "STRING"
    }
  }
  label_extractors = {
    code = "EXTRACT(jsonPayload.code)"
  }
}

# Depends on the warning field (first warning or "none") Byte adds to the command_request
# record of operation receipt_recognition.
resource "google_logging_metric" "recognition_outcome" {
  project     = local.project
  name        = "mw_recognition_outcome_${local.log_metric_env}"
  description = "R089: DEV receipt recognition outcomes by warning (counts only)."
  filter      = "${local.log_metric_command} AND jsonPayload.event=\"command_request\" AND jsonPayload.operation=\"receipt_recognition\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key        = "warning"
      value_type = "STRING"
    }
  }
  label_extractors = {
    warning = "EXTRACT(jsonPayload.warning)"
  }
}

# Request-log latency of the recognition route; no code change needed.
resource "google_logging_metric" "recognition_route_latency" {
  project         = local.project
  name            = "mw_recognition_route_latency_${local.log_metric_env}"
  description     = "R089: DEV command /receipts/{id}/recognition request latency in seconds."
  filter          = "${local.log_metric_command} AND logName=~\"run.googleapis.com%2Frequests$\" AND httpRequest.requestUrl=~\"/receipts/[^/]+/recognition$\""
  value_extractor = "REGEXP_EXTRACT(httpRequest.latency, \"^([0-9.]+)s$\")"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "s"
  }
  bucket_options {
    exponential_buckets {
      num_finite_buckets = 20
      growth_factor      = 1.5
      scale              = 0.25
    }
  }
}

# Fallback for the design's cloudscheduler.googleapis.com/job/attempt_count, which
# this project does not publish (no descriptor, 22 Oct 2026 read). Counts the
# scheduler's AttemptFinished log entries per job; status is empty on success.
resource "google_logging_metric" "scheduler_attempts" {
  project     = local.project
  name        = "mw_scheduler_attempts_${local.log_metric_env}"
  description = "R089: DEV Cloud Scheduler attempt outcomes for the mw-credit-app-dev-* jobs (counts only)."
  filter      = "resource.type=\"cloud_scheduler_job\" AND resource.labels.job_id=~\"^mw-credit-app-dev-\" AND jsonPayload.@type=\"type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key        = "status"
      value_type = "STRING"
    }
    labels {
      key        = "http_status"
      value_type = "STRING"
    }
  }
  label_extractors = {
    status      = "EXTRACT(jsonPayload.status)"
    http_status = "EXTRACT(httpRequest.status)"
  }
}

# R093: the chat service's chat_turn completion record (one per turn; code is "ok"
# or the failure code, model the answering model). Counts and distributions only.
resource "google_logging_metric" "chat_turns" {
  project     = local.project
  name        = "mw_chat_turns_${local.log_metric_env}"
  description = "R093: DEV chat turns by result code and model (counts only)."
  filter      = local.log_metric_chat
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key        = "code"
      value_type = "STRING"
    }
    labels {
      key        = "model"
      value_type = "STRING"
    }
  }
  label_extractors = {
    code  = "EXTRACT(jsonPayload.code)"
    model = "EXTRACT(jsonPayload.model)"
  }
}

resource "google_logging_metric" "chat_turn_latency" {
  project         = local.project
  name            = "mw_chat_turn_latency_${local.log_metric_env}"
  description     = "R093: DEV chat turn latency in milliseconds (jsonPayload.latencyMs)."
  filter          = local.log_metric_chat
  value_extractor = "EXTRACT(jsonPayload.latencyMs)"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"
  }
  bucket_options {
    exponential_buckets {
      num_finite_buckets = 20
      growth_factor      = 1.5
      scale              = 1000
    }
  }
}

resource "google_logging_metric" "chat_turn_rounds" {
  project         = local.project
  name            = "mw_chat_turn_rounds_${local.log_metric_env}"
  description     = "R093: DEV model rounds per chat turn (jsonPayload.rounds)."
  filter          = local.log_metric_chat
  value_extractor = "EXTRACT(jsonPayload.rounds)"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "1"
  }
  bucket_options {
    linear_buckets {
      num_finite_buckets = 17
      width              = 1
      offset             = 0
    }
  }
}
