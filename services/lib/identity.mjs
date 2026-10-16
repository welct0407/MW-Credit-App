/** The one place that names the shared Google Cloud project, instance and owner sign-in. */
export const PROJECT_ID='clever-oasis-508610-n7';
export const PROJECT_NUMBER='737787224638';
export const REGION='asia-southeast1';
export const INSTANCE_CONNECTION_NAME=`${PROJECT_ID}:${REGION}:appsheet-pg-prod-20260914`;
export const OWNER_EMAIL='welct0407@mw-credit.com';
/** Cloud Run service URL for a service name in this project and region. */
export const runUrl=service=>`https://${service}-${PROJECT_NUMBER}.${REGION}.run.app`;
