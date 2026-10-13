# Database ownership

MW-Credit-App is the sole source owner for shared SQL migrations, runners, tests and CI. AppSheet-Loan-Project owns project coordination, current business references and dictionary.

Use [the canonical procedure](https://github.com/welct0407/MW-Credit-App/blob/codex/r057-infrastructure-adoption/database/README.md) and exact MW-Credit-App commit/manifests for database delivery. Preserve the existing Flyway histories and immutable migrations.

Retained tooling locates the canonical checkout through scripts/database_location.py or scripts/database-location.mjs. Set MW_CREDIT_APP_ROOT when it is not adjacent. There is no second migration set here. Remaining implementation-code moves are deferred; this ownership rule does not authorize moving credentials, data, services or repositories.