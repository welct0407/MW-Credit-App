# Shared database ownership

MW-Credit-App owns migrations, runners, tests and database CI. AppSheet-Loan-Project owns project coordination/business references and dictionary. MW-Integration-Agent owns the separate agent runtime.

Use [database procedure](README.md) and exact tested MW-Credit-App commits/manifests. Maintain the existing Flyway history, immutable increasing migrations and scoped authority/backup guards. Never relabel old manifests or create competing history.

Retained project tooling resolves this checkout with MW_CREDIT_APP_ROOT when nonadjacent. MW_DB_TOOL_ROOT selects a supported existing tool installation. Existing private paths/resource names containing AppSheet may remain compatibility identifiers; they do not change source ownership or authorize moving credentials.

Code ownership changes do not authorize database changes, service activation or financial writes. Remaining implementation-code moves are separate owner-directed work.