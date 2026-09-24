# AppSheet current metadata

OLTP and OLAP each own `tables/`, `slices/`, `views/`, `actions/`, `format-rules/`, `automations/` and `settings/`. Start with [run coverage](../../../../outputs/dictionary-reconciliation-20260924/README.md), then read the affected object. Current production app identities are in [Environment Inventory](../../../Environment_Inventory.md).

Table files preserve exact AppDoc binding/schema/column properties and editor source/security/update settings. The 34 OLTP and 23 OLAP AppDoc tables include generated process schemas and `_Per User Settings`; the current editor has 18 and 19 business-source bindings respectively. Do not treat generated schemas as missing SQL tables.

View files preserve the full configuration string and captured editor fields. Generated view source bindings come from the editor's actual parent table/slice group; custom views use their `For this data` control. Dashboard members remain ordered. Actions are identified by table plus action name. Formatting rules retain their exact target/condition/style.

Each bot's automation file contains its event and process-step panels and bot options. `Tasks:` automation identities hold named reusable task fields, including notification templates and advanced input definitions. Component inventories in run evidence account for reusable events/processes/tasks without inventing a second ownership path for embedded definitions. Disabled bots are retained. These are saved configuration observations, not execution/delivery tests.

Settings files distinguish AppDoc app properties from editor groups. Theme selected values, sign-in/provider/options, table filters, sync/offline behavior and access roles are explicit. Personal app-user email identities remain in private evidence; published access roles and version policies use a placeholder. Signed logo access signatures are redacted, while resource identity/configuration remains documented. Secrets must never be restored into these files.

DEV differences live under [development](../../development/README.md) and must not overwrite PROD. `recorded-settings/` and workbook imports are historical sources, not current overrides. The exact blank PROD versus explicit DEV `en-US` table locale is an unresolved policy interpretation, recorded in [findings](../../../../outputs/dictionary-reconciliation-20260924/findings.md).
