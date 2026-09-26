# R043 — Borrower navigation

Delivered on 26 September 2026 under the owner's three numbered requests. Starting commit: `291da0105df4b698defd10dacd0d4b0f2c2652e7`. Implementation checkpoint: `7dd4468`; final evidence tag: `R043`.

## Result

| Position | Page | Stable Metabase tab ID |
| --- | --- | --- |
| 6 | Borrowers | 104 |
| 7 | Borrower Health Review | 31 |
| 8 | Borrower Detail | 105 |
| 9 | Risks | 8 |
| 10 | Collection Monitor | 19 |
| 11 | Forecast & Partners | 11 |

Original Borrower Insight tab 10, its 16 dashboard placements and two exclusive filters were removed. Its saved questions remain available for recovery. Dashboard 3 now has 11 tabs and 223 placements. All Portfolio pies, amount bars, ratio bars and Detail content remain.

## Link behavior

- Portfolio comparison names open Detail with the same borrower and exact selected activity dates.
- Portfolio charts and all ten Health Review tables use the immutable borrower key and start Detail with the previous 30 completed Bangkok days. Keys remain hidden in the health tables.
- Custom matrix names, including the unplotted list, open Detail in a new browser tab. The existing Metabase iframe sandbox prevents parent navigation; its security settings remain unchanged. Links use `noopener`.
- Five existing Collection Monitor links formerly targeting Insight were redirected to Detail: placements 636, 638, 640, 642 and 645.
- Aggregate **Others** has no individual borrower key and cannot select an individual detail record.

## Verification

All eleven changed queries ran successfully. Removing the new hidden key reproduced every previous column and value. Saved-state checks verified all 23 linked placements, tab order, filter retirement, hidden keys and preservation of unaffected placements. No dashboard placement links still target retired tab 10.

Chrome Wel verified a Health Review table name, a Portfolio comparison name with preserved dates, a matrix name opening a new browser tab, and a redirected Collection Monitor name. Each selected the correct borrower in tab 8. Static file hashes matched the deployment and the chart service remained active without restart. UTF-8 labels were preserved. Exact definitions and core project records were updated; dictionary validation passed.

See [saved definitions](saved.json), [configuration verification](verification.json), [browser evidence](browser-verification.json), [release manifest](release-manifest.json) and the [single promotion checklist](promotion-checklist.md).

## Recovery and scope

Recovery dashboard **20** preserves the previous layout. Because dashboard copies share questions, restore changed question definitions from private `before.json` as well when needed. Private storage: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r043-borrower-navigation`. Static originals are also retained on the VM at `/opt/mw-report-charts/recovery-r043`. Reconcile later edits before restoring any baseline.

AppSheet, SQL schema V46, financial data, credentials and permissions are unchanged. The custom chart changed only `chart.js` and `index.html`. R044 is the sole Open development release. Financial rows, screenshots, statistical fingerprints and the iframe bearer URL are excluded from Git.

The frozen package hashes remain in the manifest. Necessary post-freeze corrections were the matrix popup target after observing the iframe restriction and the five inbound Collection Monitor links discovered during retirement checks. Final deployed hashes are recorded separately.
