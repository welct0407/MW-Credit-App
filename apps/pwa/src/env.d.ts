/// <reference types="vite/client" />
/** Short Git commit of the build source (vite.config.ts define); 'unknown' outside a Git checkout. */
declare const __SOURCE_COMMIT__:string;
/** Release number (vite.config.ts define from MW_RELEASE_NUMBER): /^R\d{3}$/, or 'dev' outside live-prod when unset. */
declare const __RELEASE_NUMBER__:string;
/** SPKI PEM for the encrypted troubleshooting file (vite.config.ts define, apps/pwa/troubleshooting-public-key.pem). */
declare const __TROUBLESHOOTING_PUBLIC_KEY__:string;
