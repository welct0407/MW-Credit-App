/** The one place that names the shared Google Cloud project, instance and owner sign-in. */
export const PROJECT_ID='clever-oasis-508610-n7';
export const PROJECT_NUMBER='737787224638';
export const REGION='asia-southeast1';
/** Shared Cloud SQL instance names: the current instance and its 2026-10-17 SSD successor
 * (explicit allowlist, nothing broader). Services and workers accept either configured
 * connection name so the repoint is a settings-only change; the first entry is the default. */
export const INSTANCE_NAMES=Object.freeze(['appsheet-pg-prod-20260914','mw-credit-pg-20261017']);
export const INSTANCE_CONNECTION_NAMES=Object.freeze(INSTANCE_NAMES.map(name=>`${PROJECT_ID}:${REGION}:${name}`));
export const INSTANCE_CONNECTION_NAME=INSTANCE_CONNECTION_NAMES[0];
export const isSharedInstanceConnection=value=>typeof value==='string'&&INSTANCE_CONNECTION_NAMES.includes(value);
export const OWNER_EMAIL='welct0407@mw-credit.com';
/** Cloud Run service URL for a service name in this project and region. */
export const runUrl=service=>`https://${service}-${PROJECT_NUMBER}.${REGION}.run.app`;
