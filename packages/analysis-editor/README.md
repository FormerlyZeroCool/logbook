# @logbook/analysis-editor

Reusable browser TypeScript editor infrastructure for Logbook analysis authoring.

The package owns Monaco loading, editor and TypeScript workers, strict compiler configuration, generated-wrapper handling, source-body extraction, diagnostics, keyboard actions, shared SDK declarations, and editor styling. It has no dependency on frontend pages, routes, APIs, TanStack Query, event-type state, persistence, or chart components.

## Public components

- `AnalysisTypeScriptEditor`: generic generated-document body editor.
- `AnalysisProgramEditor`: analysis-program adapter with typed input aliases and reusable-function bindings.
- `AnalysisFunctionEditor`: reusable-function adapter with a signature selected by function kind.

The consuming frontend supplies source bodies and callbacks for Run, Save, and diagnostics. It remains responsible for API calls and application state.
