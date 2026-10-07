# Shared database contract

The existing Cloud SQL instance and DEV/PROD data are retained. This repository does not author or run a second Flyway migration history.

Canonical SQL owner: welct0407/AppSheet-Loan-Project. Before a feature requires SQL changes, pin its tested commit and complete migration/hash manifest here and coordinate its existing Open release. No SQL schema migration or financial data change is part of this infrastructure foundation.

The infrastructure readiness service only queries current_database(), current_user and a constant. Its IAM login has not been granted business-table editing rights. Feature-specific grants and command contracts are future reviewed work.
