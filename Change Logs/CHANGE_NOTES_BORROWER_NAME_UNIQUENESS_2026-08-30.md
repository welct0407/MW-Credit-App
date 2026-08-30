# Borrower name uniqueness change notes — 2026-08-30

## Scope

- AppSheet app: `Loan Manager ผู้จัดการสินเชื่อ`
- App ID: `93844270-6aa5-420b-a960-bcdf08abd357`
- Component: `Borrowers[Borrower Name]`
- Purpose: block duplicate borrower names after trimming whitespace and normalizing letter case.

## Rollback point

- AppSheet version before editing: `2.200073`
- AppSheet version after editing: `2.200074`
- Restore path: Manage > Versions > select version `2.200073` > Restore.

## Planned change

- Run a read-only audit for existing normalized duplicate borrower names.
- Add a row-excluding `Valid_If` to `Borrower Name`.
- Add a bilingual duplicate-name error message.
- Preserve `Row ID` as the immutable key and make no database/schema changes.

## Pre-change duplicate audit

- Borrower rows reviewed: `13`
- Distinct normalized names: `13`
- Blank names: `0`
- Duplicate normalized-name groups: `0`
- No borrower names or other personal data were copied into these change notes.

## Implemented change

- Added this `Valid_If` expression to `Borrowers[Borrower Name]`:

  ```appsheet
  COUNT(
    SELECT(
      Borrowers[Row ID],
      AND(
        [Row ID] <> [_THISROW].[Row ID],
        LOWER(TRIM([Borrower Name])) = LOWER(TRIM([_THISROW].[Borrower Name]))
      )
    )
  ) = 0
  ```

- Added this invalid-value message:

  ```text
  ชื่อผู้กู้นี้มีอยู่แล้ว กรุณาเลือกผู้กู้เดิมหรือใช้ชื่อที่แตกต่าง / This borrower name already exists. Select the existing borrower or use a different name.
  ```

- Preserved `Row ID` as the key and made no database/schema changes.

## Verification performed

- AppSheet's expression assistant accepted both expressions without errors.
- Saved and reloaded the editor, then re-read the persisted `Valid_If` and invalid-value message.
- Confirmed the editor reports `No issues found` and no unsaved configuration remains.
- Confirmed the saved app version is `2.200074`.
- Opened an add form, entered an existing borrower name, and canceled without submitting. The current client deferred the blocking validation until submission, so no production row was created or modified.

## Manual testing required

- Sync a client to version `2.200074`.
- Attempt to save a borrower using an existing name exactly; confirm the bilingual duplicate message blocks the save.
- Repeat with different letter case and with leading/trailing spaces; confirm both are blocked.
- Edit an existing borrower without changing the name; confirm the row saves normally because the validation excludes itself by `Row ID`.
- Create a borrower with a genuinely new name; confirm it saves normally.

## Rollback

- In Manage > Versions, restore AppSheet version `2.200073`.

## Change status

- Implementation and available editor verification complete; awaiting user manual acceptance testing.
