# Looker Studio retirement — 27 September 2026

## Scope and identity

Owner instruction: decommission Data Studio / Looker Studio reports and data sources after migrating to Metabase. The selected Chrome profile and the Looker Studio account switcher both identified `welct0407@gmail.com` (Wel Teo). The **Owned by me** views were used. **Shared with me** had no reports or data sources; owned Explorer had no items.

## Reports moved to Trash

| Report | ID |
| --- | --- |
| Loan Reports - Mobile | `c62727aa-a0fc-4c2a-9295-b46ebe1f82fc` |
| Loan Reports - Mobile - Backup 2026-09-26 pre-auto-refresh | `15888f3d-e3d5-4a1d-b2b2-731e2dd2df7e` |
| Loan Reports - Mobile - Backup 2026-09-02 pre-page-8-profit-forecast | `1540fead-b4c1-46fa-96b6-3a959f7291dc` |
| Loan Reports - Mobile - PRE MIGRATION BACKUP - 2026-09-04 | `23df8b07-1ecc-4546-88c6-1c70e9bc79df` |
| Loan Reports - Mobile - Backup 2026-09-02 pre-borrower-value-stability-matrix | `abe7aa2e-e887-4066-883a-c7ddb985d5cf` |
| Loan Reports - Mobile - Backup 2026-08-29 pre-page-7-improvements | `de4ec0dc-556f-4337-b668-6e8b420d2de4` |
| Loan Reports - Mobile - Backup 2026-08-29 pre-page-7 | `319df387-b12d-4701-a6f8-54a3652486cc` |
| Loan Reports - Mobile - Backup 2026-08-29 pre-reporting-slices | `801830b8-eb4e-4137-b405-c746b4f3ec61` |
| Backup of Loan Reports - Mobile 29082026 | `f60edc49-c12f-4126-8f0e-419141095f92` |

## Data sources moved to Trash

| Data source | ID |
| --- | --- |
| Loan Business Insights: Partners | `3bc5364c-fd8f-4186-95eb-97b3d6df8235` |
| Loan Business Insights: Repayments | `46f9a5e0-7559-4386-a505-b5c09d2274db` |
| Loan Business Insights: Daily Analytics | `602771ad-1799-4452-9b7a-06684275b11d` |
| Loan Business Insights: Statistics | `8c5ca4be-8c2f-4609-affb-6974568737c0` |
| Loan Business Insights: Loans | `aae57ad4-062a-4c89-b3e9-d24fc081329e` |
| Loan Business Insights: Charges | `150b9de6-1cb9-4a9b-973d-17db1f9ed29f` |
| Loan Business Insights: Borrowers | `f567b96d-0d88-4652-a0fa-0c7e85b6a639` |

## Verification and recovery

The UI reported **Moved 1 item to the trash**, then **Moved 8 items to the trash** for reports and **Moved 7 items to the trash** for data sources. After clearing the stale selection, the owned lists showed no items. Trash listed all nine reports and all seven data sources. It also contained three reports and eight data sources from earlier activity; these were already in Trash and were not changed by this task.

Final owned-list screenshots: [reports](owned-reports-empty.png) and [data sources](owned-data-sources-empty.png).

Restore through Looker Studio Trash if rollback is needed. If restoring a report for use, restore its required data sources as well and recheck source credentials and report behavior. No permanent deletion was performed. No AppSheet slice, app configuration, SQL object, Metabase object or financial record was changed.
