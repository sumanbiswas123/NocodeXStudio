# Architecture Rules

This document is the source of truth for future AI-assisted development in this repository.

## App.tsx Rule

`App.tsx` must remain a thin orchestration layer.

It may:
- own top-level app state when necessary
- compose hooks
- assemble view-model props
- render top-level shell components

It must not become a large feature container again.

Avoid adding to `App.tsx`:
- large JSX sections
- domain-specific business logic
- effect-heavy workflows
- file-system/runtime logic
- preview mutation logic
- editor-specific logic
- utility/helper functions
- long render prop objects when a view-model hook is more appropriate

If a change noticeably grows `App.tsx`, refactor before finalizing.

## Placement Rules

Put code in the correct domain location:

- `app/hooks/preview`
  Preview state, selection, frame bridge, CSS mutation, preview coordination

- `app/hooks/workflow`
  Multi-step flows such as config handling, file actions, gallery flows, PDF workflows

- `app/hooks/layout`
  Panel sizing, stage sizing, layout calculations, viewport behavior

- `app/hooks/editor`
  Code editor and detached editor logic

- `app/hooks/shell`
  App-wide keyboard/shell behavior

- `app/hooks/canvas`
  Canvas editing, canvas history, direct canvas manipulation flows

- `app/hooks/viewModels`
  Hooks that shape grouped props for UI components

- `app/ui`
  UI sections, shells, panels, toolbars, presentational composition

- `app/helpers`
  Pure helpers, parsing, transforms, shared calculations

- `app/runtime`
  Platform integration, bridge/runtime code, filesystem and external wiring

## Feature Development Rules

When adding a new feature:

1. Decide which domain owns it.
2. If it adds meaningful logic, create or extend a hook in that domain.
3. If it adds a sizable UI block, create or extend a UI component.
4. If it builds grouped props for rendering, prefer a view-model hook.
5. If logic is reused, extract a helper instead of duplicating it.

Prefer small focused hooks over one giant hook.

## Design and Styling Rules

For future design and UI work:

- Use standard CSS3 for styling.
- Do not introduce Tailwind for new work.
- Do not generate new Tailwind-style utility-heavy markup as the default approach.
- Prefer:
  - CSS modules, scoped CSS files, or repo-standard CSS organization
  - named classes with meaningful intent
  - reusable variables and tokens
  - readable structure over utility-class density

Important:
- Existing Tailwind-like classes already in the codebase do not need to be rewritten just because they exist.
- But new UI work should be implemented with CSS3-first styling, not Tailwind.

## Code Quality Rules

Before finishing:

- remove stale imports
- remove dead props and unused variables introduced by the change
- keep names domain-specific and explicit
- prefer typed hook inputs/outputs
- keep responsibilities separated
- keep components understandable for the next developer

## Goal

The goal is to keep this codebase modular, readable, and industry-grade:

- `App.tsx` stays orchestration-focused
- hooks stay domain-scoped
- UI stays split into clear components
- helpers stay pure
- styling for future design work uses CSS3, not Tailwind
