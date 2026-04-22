# Reference Fixer Renumbering Rules

This document defines how the fixer renumbers references without manual developer cleanup.

## Canonical Model

- `referencesAll`, `footnotesAll`, and `abbreviationsAll` are master ordered lists.
- Page arrays and superscripts are projections of those lists.
- In memory, entries are tracked by stable IDs.
- At save time, stable IDs are projected back into Veeva positional numbers.

## Operations

### Remove from this page, keep elsewhere

- Remove the usage edge for the current slide or popup only.
- Keep the master entry if any other usage remains.
- Regenerate only affected page mappings and superscript labels.

### Remove from everywhere

- Remove the master entry from the appropriate master list.
- Remove all usage edges pointing to it.
- Compact later indices of the same kind.
- Regenerate all affected page mappings and every linked superscript suggestion.

### Add

- Add the new master entry at the end of the relevant master list in v1.
- Attach it only to the selected scope.
- Regenerate affected local labels.

### Replace

- Local replace changes usage scope first.
- Global replace changes master text only after the user chooses a global option.

## Superscript Rendering

- Parse `data-reftarget` in authored order.
- Preserve mixed target groups of references and footnotes.
- Render numeric references by local display order within the superscript.
- Compress contiguous numeric labels into ranges like `1-3`.
- Keep footnotes as `foot_#` targets and render symbols from text prefix when available.
- Drop duplicate targets and surface a warning.

## Shared Popup Handling

- Shared popup superscripts are treated as one usage source with multiple affected invoking slides.
- Global operations must show all affected slides in impact preview.
- Local popup operations stay limited to that popup suggestion in v1.

## Ambiguity

If a PDF note says only “remove this” and multiple scopes are plausible, the fixer should show:

- remove from current page
- remove from current popup
- remove globally

No automatic mutation should happen until the developer picks one.
