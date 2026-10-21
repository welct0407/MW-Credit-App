# M&W Credit logo

Owner supplied `Loan Manager App Logo.png` on 20 September 2026:
https://drive.google.com/file/d/1Ch7-8YTHNix5vcDJBme2Bvfv7QkK7Cr5/view

Retrieved using the owner's authenticated Drive browser because the connector could not access the file. The source is preserved byte-for-byte as `mw-credit-logo.png` (1254 × 1254, RGB PNG, 1,438,635 bytes).

SHA-256: `5808ee79d5b6e843c8ed648e8507678ea349297d1cc687a97021c5d396dd2a8d`.

The logo ships inside the installed Python package on Debian; the renderer reads that local asset and scales a copy proportionally for the header. No download occurs during report generation. Replace only after an owner-authorized branding update; preserve the source and update this provenance/hash.

# Conversation assets

Shipped inside the package for the Claude Partner conversation (21 October 2026):

- `conversation-business-rules.md`: the owner-confirmed business-rules reference, part of the model's system prompt. Edit it here; `docs/CONVERSATION_BUSINESS_RULES.md` only points to it. A change starts a new history epoch for every Partner.
- `schema-digest.json`: generated digest of the business schema (84 relations, all columns), also part of the system prompt. Regenerate it with `scripts/build-schema-digest.py` after business migrations change tables or columns; a test fails when the committed file drifts from the generator. A change starts a new history epoch.
