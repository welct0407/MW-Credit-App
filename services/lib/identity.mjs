/** The one place that names the shared Google Cloud project, instance and owner sign-in. */
export const PROJECT_ID='clever-oasis-508610-n7';
export const PROJECT_NUMBER='737787224638';
export const REGION='asia-southeast1';
/** Shared Cloud SQL instance: the 2026-10-17 SSD instance (R067: its HDD predecessor is
 * deleted). Kept as an explicit allowlist so services, workers and promotion runners share
 * one fail-closed check; the first entry is the default. */
export const INSTANCE_NAMES=Object.freeze(['mw-credit-pg-20261017']);
export const INSTANCE_CONNECTION_NAMES=Object.freeze(INSTANCE_NAMES.map(name=>`${PROJECT_ID}:${REGION}:${name}`));
export const INSTANCE_CONNECTION_NAME=INSTANCE_CONNECTION_NAMES[0];
export const isSharedInstanceConnection=value=>typeof value==='string'&&INSTANCE_CONNECTION_NAMES.includes(value);
export const OWNER_EMAIL='welct0407@mw-credit.com';
/** Cloud Run service URL for a service name in this project and region. */
export const runUrl=service=>`https://${service}-${PROJECT_NUMBER}.${REGION}.run.app`;
