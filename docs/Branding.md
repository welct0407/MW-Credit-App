# PWA branding

| Environment | Theme | Primary accent |
| --- | --- | --- |
| DEV | Light | #e8710a |
| PROD | Light | #d81b60 |

Current styling is owned by apps/pwa/src/style.css. Live assets are selected in apps/pwa/src/live-main.tsx: loan-manager-logo-dev-orange.png for DEV and loan-manager-logo-prod-pink.png for PROD. The synthetic preview keeps its separate presentation selector.

Environment branding never selects a database, API identity or credential. Deploy the correct environment build; do not treat a color preview as production proof. Review only affected screens/icons when changing branding. No AppSheet theme audit or editor step.