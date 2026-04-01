# Preview CSS Inspector Flow

This document is the source of truth for the current Style Inspector + preview CSS edit flow.

It exists because this area is easy to break with "small" changes:

- matched CSS rules come from multiple sources
- preview CSS is edited optimistically before disk persistence
- the iframe can temporarily contain both linked stylesheets and runtime-injected styles
- CDP activity must help with override state, but must not corrupt the matched rule list

If you change this flow in the future, read this document first.

## Goal

When a user edits a matched CSS declaration from the Style Inspector:

1. The exact matched rule block in `local.css` must be updated.
2. The preview iframe must update immediately.
3. Reselecting the same element or another element must keep correct matched rules.
4. The inspector must continue to show which declarations are active vs overridden.
5. The system must behave like Chrome DevTools as closely as practical.

## Non-Negotiable Invariants

These rules should stay true:

- `local.css` is the source of truth for matched-rule edits.
- A matched-rule edit must patch the exact selector block that was clicked.
- Grouped selectors and standalone selectors are not interchangeable.
- A live preview update must not fall back to inline `style=""` for matched stylesheet edits.
- The preview must not keep both a base stylesheet and a stale override stylesheet for the same source after a successful live update.
- CDP may project activity onto the current matched rules, but must not replace the matched rule list with a polluted/duplicated one.
- Panel rendering must not invent truth. The matched-rule state must already be correct before it reaches the panel.

## Main Data Flow

### 1. Selection

User selects an element in preview.

Main entry points:

- [usePreviewFrameMessages.ts](c:/Users/SumanBiswas/Downloads/nocode_new/app/hooks/preview/usePreviewFrameMessages.ts)
- injected preview runtime collectors inside [appHelpers.tsx](c:/Users/SumanBiswas/Downloads/nocode_new/app/helpers/appHelpers.tsx)

What happens:

- iframe posts `PREVIEW_SELECT`
- app gathers:
  - `payloadMatchedCssRules` from iframe message
  - `liveMatchedCssRules` from `collectMatchedCssRulesFromElement(liveElement)`
- current winner logic prefers the stronger live path when available
- app writes `previewSelectedMatchedCssRules`

Important:

- if the live collector is wrong, the panel will be wrong
- if `PREVIEW_SELECT` drops a rule count after an edit, start debugging here first

### 2. Inspector Activity / Override State

Main entry points:

- [previewCssHelpers.ts](c:/Users/SumanBiswas/Downloads/nocode_new/app/helpers/previewCssHelpers.ts)

Key functions:

- `annotateMatchedCssRuleActivity(...)`
- `collectMatchedCssRulesFromElement(...)`
- `collectLiveMatchedCssRuleRefsFromElement(...)`
- `derivePreviewMatchedCssRulesFromCdp(...)`
- `cssRuleSourcesMatch(...)`
- `normalizeSelectorSignature(...)`

Important:

- activity is computed per-property, not per-block
- a whole block should only look inactive if the cascade really says so
- grouped selectors should still behave per actual matched rule, like Chrome

### 3. Editing a Matched CSS Declaration

Main entry point:

- [usePreviewCssMutation.ts](c:/Users/SumanBiswas/Downloads/nocode_new/app/hooks/preview/usePreviewCssMutation.ts)

Key functions:

- `handlePreviewMatchedRulePropertyAdd(...)`
- `queuePreviewLocalCssPatch(...)`
- `applyPreviewMatchedRuleOptimisticState(...)`
- `buildPreviewMatchedRulePatchedSource(...)`
- `persistPreviewMatchedRuleToSourceFile(...)`
- `updatePreviewLiveStylesheetContent(...)`
- `resolvePreviewMatchedRuleSourcePath(...)`

What must happen:

1. Optimistic matched-rule state updates immediately.
2. Exact source text for the matched rule is patched.
3. Live preview stylesheet is updated from the patched source text.
4. Source file persistence follows.

Important:

- this flow should patch the exact rule block, not a guessed selector cousin
- do not route matched-rule edits through generic inline-style preview

### 4. CDP Integration

Main entry point:

- [usePreviewInspectorRuntime.ts](c:/Users/SumanBiswas/Downloads/nocode_new/app/hooks/preview/usePreviewInspectorRuntime.ts)

Key functions:

- `projectCdpRuleActivityOntoCurrent(...)`
- `mergeRecentEditedRuleActivity(...)`

Current rule:

- CDP is allowed to contribute activity/override information
- CDP is not allowed to replace the matched rule list with a different polluted set

This matters because earlier breakages came from CDP turning a correct 6-rule set into a wrong 8-rule set.

## Critical Implementation Details

### Exact Rule Identity

Matched-rule edits rely on:

- `selector`
- `source`
- `sourcePath`
- `occurrenceIndex`

These must travel intact from selection -> inspector -> mutation -> live update -> persistence.

Do not weaken this identity to "same basename" or "same class name".

### Selector Matching

These are different rules and must remain different:

```css
.RightWtxt { ... }
```

```css
.LeftRedtxt, .RightWtxt, .leftbottomtxt { ... }
```

```css
.hello_div .RightWtxt { ... }
```

Never patch one because another merely contains the same class name.

### Cross-Realm DOM/CSSOM Safety

The preview lives in an iframe.

Parent-window checks like these are unsafe:

- `instanceof Element`
- `instanceof HTMLElement`
- `instanceof CSSStyleRule`

for iframe-owned objects.

Use the realm-safe helpers in [previewCssHelpers.ts](c:/Users/SumanBiswas/Downloads/nocode_new/app/helpers/previewCssHelpers.ts):

- `isElementLike(...)`
- `isStyleHostLike(...)`
- `isCssStyleRuleLike(...)`
- `hasNestedCssRules(...)`

If these checks regress, the live collector can silently fail and the inspector will fall back to weaker paths.

### Canonical Live Stylesheet Model

This is the most important runtime rule discovered during debugging:

For one logical CSS source such as `local.css`, the preview should end up with one canonical live stylesheet representation after an edit.

Current intended behavior in [usePreviewCssMutation.ts](c:/Users/SumanBiswas/Downloads/nocode_new/app/hooks/preview/usePreviewCssMutation.ts):

- if editing a linked stylesheet like `local.css`
- create or update one canonical inline `style[data-source="..."]`
- disable the corresponding preview `<link rel="stylesheet">`
- remove matching `data-nx-live-source` override nodes

Why:

- if the iframe keeps both a base stylesheet and a leftover override for the same source, reselection can produce the wrong matched rule set
- that was the root cause of the "everything becomes faded/crossed after reselection" bug

## Functions Most Related To This Area

### `app/helpers/previewCssHelpers.ts`

- `annotateMatchedCssRuleActivity(...)`
- `collectMatchedCssRulesFromElement(...)`
- `collectLiveMatchedCssRuleRefsFromElement(...)`
- `dedupeExactMatchedCssRules(...)`
- `dedupeExactRuleDeclarations(...)`
- `findCssRuleRange(...)`
- `cssRuleSourcesMatch(...)`
- `normalizeSelectorSignature(...)`
- realm-safe helpers:
  - `isElementLike(...)`
  - `isStyleHostLike(...)`
  - `isCssStyleRuleLike(...)`
  - `hasNestedCssRules(...)`

### `app/hooks/preview/usePreviewCssMutation.ts`

- `resolvePreviewMatchedRuleSourcePath(...)`
- `ensurePreviewMatchedRuleSourceLoaded(...)`
- `buildPreviewMatchedRulePatchedSource(...)`
- `persistPreviewMatchedRuleToSourceFile(...)`
- `applyPreviewMatchedRuleToLiveStylesheet(...)`
- `updatePreviewLiveStylesheetContent(...)`
- `queuePreviewLocalCssPatch(...)`
- `handlePreviewMatchedRulePropertyAdd(...)`

### `app/hooks/preview/usePreviewFrameMessages.ts`

- `PREVIEW_SELECT` handling
- winner choice between payload/live matched rules
- `debugMatchedRuleWrite(...)`

### `app/hooks/preview/usePreviewInspectorRuntime.ts`

- `projectCdpRuleActivityOntoCurrent(...)`
- CDP refresh logic for computed styles and matched-rule activity

### `app/helpers/appHelpers.tsx`

Injected preview runtime collectors:

- `collectMatchedCssRulesForElement(...)`

There are multiple generated-script copies in this file. Keep them behaviorally aligned.

### `components/StyleInspectorPanel.tsx`

This file should render state faithfully.

Avoid using it as the primary fix location for data corruption bugs. If the panel looks wrong, first verify whether `previewSelectedMatchedCssRules` is already wrong upstream.

## Known Failure Modes

### 1. Wrong exact rule patched

Symptom:

- editing `.Rightbottomtxt1 { top: ... }` updates the grouped selector block instead

Cause:

- selector matching was too broad

Guard:

- `findCssRuleRange(...)` must match the exact normalized rule header text and exact occurrence

### 2. Inline style fallback corrupts override state

Symptom:

- after edit, `local.css` declaration becomes crossed because inline `style=""` wins

Cause:

- matched-rule edit fell back to `PREVIEW_APPLY_STYLE`

Guard:

- matched stylesheet edits should stay in stylesheet land, not inline-style land

### 3. Whole block fades after reselection

Symptom:

- first edit works
- reselect same or another element
- whole `local.css` block becomes faded/crossed

Root cause discovered:

- preview ended up with competing stylesheet realities for the same `local.css` source
- live collector then returned the wrong matched rule set on reselection

Guard:

- one canonical live stylesheet representation per source after edit

### 4. CDP pollutes matched rule list

Symptom:

- correct matched rule set replaced by extra duplicate/stale rules

Guard:

- CDP should project activity onto current rules, not replace the rule list blindly

### 5. Cross-realm `instanceof` failures

Symptom:

- collector silently misses rules
- selection/reselection behavior becomes inconsistent

Guard:

- do not use raw `instanceof` checks for iframe-owned nodes/rules

## Debugging Checklist

If this flow breaks again, check these in order.

### A. Reselect rule count

Look for:

- `[PreviewCSSDebug] PREVIEW_SELECT matched rule sources`
- `[PreviewCSSDebug] matched-rule-write`

Question:

- does rule count change unexpectedly after edit or reselection?

If yes:

- bug is likely in live collector or stylesheet canonicalization

### B. Live stylesheet update result

Look for:

- `[PreviewCSSDebug] updatePreviewLiveStylesheetContent`

Important fields:

- `matchingDataSourceStyles`
- `remainingLiveOverrideStyles`

Healthy direction:

- once canonical inline `data-source` exists, stale override count should not remain for the same source

### C. Exact source patching

Look for:

- `[PreviewCSSDebug] buildPreviewMatchedRulePatchedSource`

Important fields:

- `resolvedSourcePath`
- `sourceTextFound`
- `ruleRangeFound`
- `ruleHeader`

If this fails, the bug is in rule identity or source loading.

### D. CDP merge

Look for:

- `CDP:project-activity-onto-current`

If the rule list shape changes here, CDP merge logic has regressed.

## Change Rules For Future Work

Before changing this area:

1. Trace the whole path first.
2. Confirm whether the bug is in:
   - rule collection
   - rule identity
   - live stylesheet state
   - CDP activity projection
   - or rendering only
3. Fix the earliest corrupting layer.
4. Avoid panel-level masking unless the bug is truly presentational.

Do not:

- add broad selector guessing
- collapse different rules just because they share a class name
- let matched stylesheet edits fall back to inline styles
- let CDP blindly replace the matched rule set
- use cross-realm `instanceof` checks on iframe DOM/CSSOM objects

## Practical Rule Of Thumb

If Chrome DevTools would still show two distinct rules after the edit, our inspector must also keep two distinct rules.

If Chrome would only mark one declaration overridden, our inspector must not wash out the whole block.

That is the behavior to preserve.
