# Application branding

Owner direction: 7 October 2026. Use AppSheet OLTP branding for the replacement app, including desktop OLAP screens.

| Presentation | AppSheet theme | Primary accent |
| --- | --- | --- |
| Development | White / light | #e8710a |
| Production | White / light | #d81b60 |

Recorded sources: AppSheet-Loan-Project Documents/Environment_Inventory.md canonical environment table; current development dictionary theme/brand selected values; outputs/r051-production/source-mapping-validation.json branding.OLTP. No fresh AppSheet theme audit or live change was performed for this preview revision. Supporting PWA surface colors are implementation choices, not claimed exact AppSheet palette values.

## Logo

apps/pwa/src/assets/loan-manager-logo.png is an unchanged copy of AppSheet-Loan-Project resources/Loan Manager App Logo.png. SHA256: 5808EE79D5B6E843C8ED648E8507678EA349297D1CC687A97021C5D396DD2A8D.

PROD uses this original pink asset unchanged. The owner's subsequent instruction requests a fully orange DEV variant: apps/pwa/src/assets/loan-manager-logo-dev-orange.png, SHA256 3E0A3A6234376BA263B3CF59D5C4EBD374607357B831972605BDE730E54DD0D2. The variant was created with the built-in image-editing tool; composition and lettering were visually reviewed, rather than claimed pixel-identical. No OLAP logo is used.

## Current visual review

The synthetic preview defaults to DEV colors independently of Vite's production build mode. The DEV/PROD selector and ?theme=prod query parameter affect CSS presentation only. They never select an API, identity, database, credential or deployment target. Runtime environment wiring is future infrastructure/application work; a PROD color preview is not a production deployment.

Owner refinement: cards share coordinated light theme tints so the environment color is visible beyond the header. DEV surface #fdf1e7, selected/hover #fbe8d8 and border #b86d32; PROD surface #fbe8ef, selected/hover #f9dbe6 and border #b9577f. Record separators and existing panel/detail borders use these darker theme-coordinated colors at 1px for clearer separation. Text backgrounds remain transparent and text stays dark. The earlier all-white card preference is superseded; no individual text highlight is introduced. The portfolio outstanding-principal summary is omitted; per-borrower and per-loan principal context remains.

## DEV logo edit record

Built-in image_gen edit; source is the original pink OLTP PNG above. The original is preserved. Generated output was copied into the bundled assets before wiring it to the DEV presentation.

Initial background-only prompt (superseded by the all-orange refinement below):

Edit target: the supplied existing square MW Credit OLTP logo. Create a DEV color variant by changing ONLY the saturated pink/magenta BACKGROUND field to warm orange close to #e8710a, preserving its subtle shading. Keep the existing foreground logo exactly: identical composition and geometry, the document/baht symbol, large 'M&W' letters, ampersand, Thai text 'สินเชื่อ', rising arrow and bars, their white/pink surfaces, outlines, embossing and shadows. Do not redraw or redesign the logo, change any lettering or symbols, crop, add borders, add text or move elements. Preserve foreground as faithfully as possible. Opaque square PNG, same full framing. Production original must remain unchanged; this is a separate orange-background variant.

Final refinement: the owner requested all remaining pink recolored to orange shades, including bevels, shadows, ampersand, plaque, arrow and chart bars. The source for this edit was the first DEV variant, and its file was replaced only after visual review. Original PROD remains unchanged.

Final prompt:

Edit target: this existing orange-background DEV logo. Change EVERY remaining pink/magenta/red surface and edge to an orange-family shade: the M&W letter bevels and shadows, entire ampersand, Thai plaque, arrow, chart bars, symbol outlines, highlights and all decorative accents. ZERO pink, magenta or red anywhere. Use a harmonious monochromatic orange palette close to #e8710a: pale peach/cream highlights, warm orange mids, deep burnt-orange/brown shadows. Preserve white letter faces/white symbol surfaces and unchanged legibility, composition, proportions, 3D embossing, all symbols, exact 'M&W' and exact Thai 'สินเชื่อ'. Do not redesign, move, crop or add anything. Background remains warm orange, with enough tonal contrast for the foreground. Opaque square PNG. Production logo is not being edited; this is only the DEV variant.

## Readable typography

Owner requested all text be comfortably readable. The visual checkpoint now targets a 16px base/body/control size with 1.5 line height and no meaningful visible text below 14px, including secondary labels, status, dates, navigation captions and footer. Headings and financial amounts remain larger. Inputs/actions use at least 44px targets; mobile navigation 48px. English/Thai labels wrap and cards grow rather than shrinking type to fit. This is a preview design target verified at representative viewport sizes, not a full accessibility certification.
