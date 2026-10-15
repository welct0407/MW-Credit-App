# R038 - lifetime borrower interest return

26 September2026. Owner approved all lifetime interest / total original loan principal instead of interest / outstanding principal. Scope: model310 additive fields, question314 replacement metric/title, context315 and method note. Existing consumers/model fields preserved; no AppSheet or SQL schema change. [Contract, checks and rollback](../outputs/r038-lifetime-return/README.md).

Released: independent30-borrower parity and unchanged-model-fields tests passed; Orgrand160% confirmed in data and live chart. Date-slicer invariance and saved mappings/layout passed. API returned dashcards in a different order after save; verifier corrected to compare by immutable ID, with no layout change. Starting Git7750d649. Original unrelated untracked risk/R026 work preserved.

Recovery dashboard12. Exact dictionary, core references, handover and manifest updated. Unique final tagR038; R039 sole Open. No app/SQL migration or RC.
