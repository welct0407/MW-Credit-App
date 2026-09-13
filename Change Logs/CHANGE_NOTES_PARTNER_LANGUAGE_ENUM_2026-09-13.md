# Partner language enum — 13 September 2026

Status: implemented and checked; owner manual acceptance pending.

## Scope and purpose

Owner requested exactly two language options written in their own languages: `English` and `ไทย`. Changed Partners[Language Preference] in both OLTP and OLAP from Text to Enum, base Text, Dropdown. Allow other values and Auto-complete other values are both off. The field remains optional with a blank initial value. OLAP owns partner management. Native database storage stays Text; this is an app-level restriction, with no new column or data migration.

## Rollback and versions

Before editing, recorded current-editor versions OLTP **3.000050** and OLAP **1.100031**. Final saved versions are OLTP **3.000052** and OLAP **1.100033**. Git baseline: `50cef4c3f7ac952d2fa94b2e3a47a8945ba2bb2d`.

To undo configuration, restore the respective before-version through Manage > Versions after checking for intervening work, or reverse only this field to Text. No partner row rollback is needed: the test selection was discarded. The dictionary before-image is outside Git at `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\partner-borrower-setup-20260913\AppSheet_Data_Dictionary.before-language-enum.xlsx`. App version restoration does not restore database data.

## Impact and documentation

Both apps consume the shared field; both definitions were changed consistently. Existing partner preferences, integration flags, permissions, keys and financial rules were not edited. No notifications, agent activation, financial records or Looker Studio changes. Downstream reports remain secondary; no report definition or data grain changed.

Updated Documents/AppSheet_Data_Model_Overview.md and Documents/AppSheet_Data_Dictionary.xlsx together, plus the proposed project AGENTS.md and DESIGN_SUMMARY.md with exact language-value mapping. Maintained builder: scripts/update-partner-borrower-dictionary.mjs, language-enum mode. Sanitized configuration evidence and dictionary render are in outputs/partner-borrower-setup-20260913/language-enum-review.json and language-enum-Columns.png.

## Checks and owner review

- Saved column dialogs in both current editors read back English and ไทย, Dropdown selected, and both other-value controls off. Both editors report No issues found.
- Current OLAP desktop Partners edit form exposes exactly the two options; selected ไทย successfully, then cancelled and discarded the test. No partner row was saved.
- Current OLTP desktop overview and Collection dashboard load. This is a scoped smoke check, not a full financial regression or role-permission test.
- Dictionary comparison confirms exactly nine intended cell-value changes, all 12 sheets and tables preserved, and the two existing Excel formulas preserved. Recalculation/error scan found no formula errors; rendered changed rows checked for legibility.
- Owner review: sync OLAP, open Partners > Edit, verify the two choices, and save the desired language for each partner. Confirm it persists after sync. Leave integration off until separately approving implementation/activation. Save-and-sync of a real preference remains owner testing.

Repository publication follows the standing scoped commit/push rule; repository publication does not imply manual acceptance or agent rollout approval.
