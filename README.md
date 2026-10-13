# MW Credit App

Production PWA, native APIs, notification/job workers, shared SQL migrations and infrastructure for MW Credit.

- [PROD](https://lm.mw-credit.com) · [DEV](https://dev-lm.mw-credit.com)
- [Development and delivery](docs/Development.md)
- [Database procedure](database/README.md)
- [Read service](docs/Development_Read_Service.md)
- [Branding](docs/Branding.md)
- [Project references](https://github.com/welct0407/AppSheet-Loan-Project/blob/master/Documents/README.md)

Operational and management workflows run in the PWA. Native APIs also serve the Debian integration agent. AppSheet is retired. Preserve current SQL and private receipt compatibility identifiers.

Use synthetic mode for isolated UI development; a preview theme does not select a runtime target. Live builds use explicit environment configuration. Follow AGENTS.md for scoped checks, credentials and production authority.