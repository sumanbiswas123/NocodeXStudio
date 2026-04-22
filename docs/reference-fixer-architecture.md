# Reference Fixer Architecture

This document defines the ownership boundaries for the guided reference fixer.

## Goal

Turn PDF/client reference comments into safe, reviewable config updates without forcing developers to manually renumber references and superscripts.

## Ownership

- `app/helpers/referenceConfigModel.ts`
  Parses Veeva config, normalizes alias keys, and serializes canonical reference keys back to config draft state.

- `app/helpers/referenceRegistry.ts`
  Builds stable in-memory IDs for master reference, footnote, and abbreviation entries.

- `app/helpers/referenceUsageGraph.ts`
  Scans config mappings and HTML superscripts into a shared usage graph.

- `app/helpers/referenceRenderer.ts`
  Rebuilds `data-reftarget` and visible superscript labels from stable targets.

- `app/helpers/referenceImpact.ts`
  Computes blast radius and affected slide/file summaries.

- `app/helpers/referenceOperations.ts`
  Applies safe graph operations such as local remove or global remove and produces patch previews.

- `app/helpers/referenceCandidates.ts`
  Converts PDF annotation records into reference-change candidates with multiple resolution options when needed.

- `app/hooks/workflow/useReferenceOpsWorkflow.ts`
  Orchestrates workspace construction, candidate selection, option selection, and plan application.

- `app/ui/ReferenceOpsPanel.tsx`
  Presents audit issues, review queue, resolution options, and patch previews.

- `components/ConfigEditorModal.tsx`
  Hosts the `Reference Ops` section and remains the single place that applies config draft updates before save.

## Data Flow

1. `ConfigEditorModal` parses config into `configDraft`.
2. `useReferenceOpsWorkflow` converts `configDraft + files + annotationRecords` into:
   - normalized reference model
   - registry
   - usage graph
   - audit issues
   - candidate plans
3. `ReferenceOpsPanel` lets the developer choose a candidate and an operation.
4. Applying a plan updates only the config draft immediately.
5. HTML changes are emitted as review suggestions, not written automatically in v1.

## Safety Rules

- Never infer a global delete when a local page-only explanation is still plausible.
- Keep config as the canonical source of truth.
- Treat superscripts as rendered consumers, not primary state.
- Apply only config edits automatically in v1.
- Emit ambiguity as UI choices, not silent behavior.
