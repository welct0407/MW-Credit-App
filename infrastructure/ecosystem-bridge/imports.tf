import {
  to = google_cloud_run_v2_service.bridge
  id = "projects/clever-oasis-508610-n7/locations/asia-southeast1/services/mw-grafana-events"
}
import {
  to = google_cloud_scheduler_job.dispatch
  id = "projects/clever-oasis-508610-n7/locations/asia-southeast1/jobs/mw-grafana-dispatch"
}
import {
  to = google_artifact_registry_repository.monitoring
  id = "projects/clever-oasis-508610-n7/locations/asia-southeast1/repositories/mw-monitoring"
}
import {
  to = google_firestore_database.bridge
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events"
}
import {
  to = google_service_account.mw_grafana_events
  id = "projects/clever-oasis-508610-n7/serviceAccounts/mw-grafana-events@clever-oasis-508610-n7.iam.gserviceaccount.com"
}
import {
  to = google_service_account.mw_grafana_dispatch
  id = "projects/clever-oasis-508610-n7/serviceAccounts/mw-grafana-dispatch@clever-oasis-508610-n7.iam.gserviceaccount.com"
}
import {
  to = google_secret_manager_secret.mw_grafana_cookie_keys
  id = "projects/clever-oasis-508610-n7/secrets/mw-grafana-cookie-keys"
}
import {
  to = google_secret_manager_secret.mw_grafana_google_client_secret
  id = "projects/clever-oasis-508610-n7/secrets/mw-grafana-google-client-secret"
}
import {
  to = google_secret_manager_secret.mw_grafana_hmac
  id = "projects/clever-oasis-508610-n7/secrets/mw-grafana-hmac"
}
import {
  to = google_secret_manager_secret.mw_grafana_oauth_jwks
  id = "projects/clever-oasis-508610-n7/secrets/mw-grafana-oauth-jwks"
}
import {
  to = google_secret_manager_secret.mw_grafana_state_key
  id = "projects/clever-oasis-508610-n7/secrets/mw-grafana-state-key"
}
import {
  to = google_firestore_index.index_1
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/oauth/indexes/CICAgJim14AK"
}
import {
  to = google_firestore_index.index_2
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/deliveries/indexes/CICAgOjXh4EK"
}
import {
  to = google_firestore_index.index_3
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/oauth/indexes/CICAgJiUpoMK"
}
import {
  to = google_firestore_index.index_4
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/deliveries/indexes/CICAgOi39IkK"
}
import {
  to = google_firestore_field.deliveries_ttl
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/deliveries/fields/deleteAfter"
}
import {
  to = google_firestore_field.events_ttl
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/events/fields/deleteAfter"
}
import {
  to = google_firestore_field.googleStates_ttl
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/googleStates/fields/deleteAfter"
}
import {
  to = google_firestore_field.oauth_ttl
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/oauth/fields/deleteAfter"
}
import {
  to = google_firestore_field.revokedGrants_ttl
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/revokedGrants/fields/deleteAfter"
}
import {
  to = google_firestore_field.subscriptions_ttl
  id = "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/subscriptions/fields/deleteAfter"
}
