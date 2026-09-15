# Production promotion of monitored jobs and phase 7

Status: authorized and in progress on 16 September 2026. Production rollback points are OLTP 3.000094, OLAP 1.100062 and Flyway V10.

## Pre-change evidence

- Owner authorization: “move these changes into production.”
- Production schema exactly matched the accepted V10 normalized hash `242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba`.
- Private backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/monitored-jobs-production-20260916/production-before.dump`; SHA256 `9c193e5ee7161d793a604e4a51cac8a2bdbdf5a29ffa2e9466bca76286b37224`.
- Backup listing has 146 entries. A local isolated restore passed for all 14 business tables and the normalized schema. Cloud SQL pg_cron extension metadata was excluded because the workstation PostgreSQL distribution does not provide pg_cron.
- No AppSheet or production database write had been made when these rollback points were captured.

Implementation, checks, final versions and recovery instructions will be added after promotion.
