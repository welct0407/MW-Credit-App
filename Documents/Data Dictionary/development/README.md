# Future verified development differences

No active DEV overlay was inferred during migration. Existing workbook differences remain under [imported evidence](../imports/excel-20260923/README.md), with their original labels and values.

For a later authorized, verified change, use `development/<system>/<release>/<object>.yaml` for product deltas and `development/<system>/environment/<object>.yaml` for intentional environment differences. Follow the [common envelope](../FORMAT.md), register the relevant object kind, set a distinct scope such as `development:Rnnn`, and record exact target identity, before/after values, evidence and release ownership inside content.

Reference the production object's identity and use explicit value/absent/unknown states. Do not copy an entire production inventory to represent one change. Promotion updates the accepted production definition and closes its verified delta in the same documented batch. The release log and [Development Changes](../../Development_Changes.md) retain status ownership. The dictionary helper does not automatically merge or apply overlays.
