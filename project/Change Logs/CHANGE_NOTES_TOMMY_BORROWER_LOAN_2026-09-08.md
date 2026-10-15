# Tommy borrower and dummy loan — 2026-09-08

Status: Production records created under explicit user authorization; API readback verified borrower and loan. User acceptance pending.

## Scope and purpose
Created ordinary borrower Tommy, communication name Tommy, Instagram Username welct0407, profile URL https://www.instagram.com/welct0407/, AI Collection Enabled Y. Late Penalty Enabled retained conservative default N; no explicit late-fee opt-in was requested. Instagram Verified At remains unset: recording a username does not prove an API conversation identity. Receiving bank follows the existing default.

Created loan rvwfZbkaM-4CIdXP3FbQk2 for borrower ctyq1RAYyu456aLHq3b086: September 7, 2026; principal 2,000; daily interest 200; interval 1; transfer fee 0; Active; Auto Charge Enabled Y. No remarks added. Existing first-day automation created a September 7 charge of 200, paid 200, remaining zero. Invoked existing Generate Today's Charge action on this loan only to prepare today's collection.

## Rollback point and implementation
Before mutation, exact-name lookup confirmed Tommy did not exist. Private ignored evidence in collection-agent/local/tommy-20260908 includes before.json, requests, returned rows and verified.json. App definitions/schema, master configuration, scheduler and program logic were not changed; app version rollback is therefore not applicable. Existing operational API mutation allowlists were not broadened: scoped one-off administrative scripts reside in ignored local storage.

## Checks and limitations
Read back production borrower flags, username, loan date, principal, rate, charge generation flag and first-day paid charge. No other borrower records were edited. Normal existing loan automation applies. No Instagram message was sent. This data creation does not establish general multi-borrower Instagram runtime routing; existing worker restrictions remain unchanged. Hourly master remains paused.

## Manual acceptance and rollback
Review Tommy in the production borrower/loan views and confirm AI and late-fee preferences. Validate Instagram routing separately before relying on automated replies. Financial records should not be physically deleted as routine rollback: disable AI collection and auto-charge flags if stopping the exercise, then use a separately authorized auditable correction/void workflow for the dummy loan and automated first-day receipt.

Final API verification: September 8 charge nB11ALmILw4lyhwSV5Gcl1 has interest due 200, paid 0, remaining 200. Loan accrued interest reset to 0 after generation. Both September 7 and September 8 charges reference the newly created loan.
