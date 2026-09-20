# Synthetic daily cash statement samples

These are synthetic fixtures, not production statements. Images show the revised midnight-to-midnight M&W Credit statement with whole-baht amounts, HH:MM times and #D81B60 branding. They are regenerated on Debian and visually checked in both languages.

Final revision uses only the owner-supplied logo (no repeated brand text), pink layout accents, green incoming amounts and red outgoing amounts. Generated and visually checked at runtime commit `1dce43a`.

- `cash-statement-en.png`: English, four example transactions.
- `cash-statement-th.png`: Thai, same amounts and transactions.

The fixtures cover incoming payment, outgoing loan, expense, transfer, a backdated effective date, and the exact 00:00 / 23:59:59 boundaries. Expected opening 12,500; money in 1,650; money out 3,250; net −1,600; closing 10,900. Live statements stay private on the VM and were sent through Instagram, never committed.
