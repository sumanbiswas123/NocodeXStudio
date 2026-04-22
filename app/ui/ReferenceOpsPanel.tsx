import React from "react";
import type {
  ReferenceAuditIssue,
  ReferenceChangeCandidate,
  ReferencePatchPlan,
  ReferenceWorkspace,
} from "../helpers/referenceTypes";

interface ReferenceOpsPanelProps {
  theme: "light" | "dark";
  borderColor: string;
  inputBackground: string;
  textMain: string;
  textMuted: string;
  workspace: ReferenceWorkspace | null;
  candidates: ReferenceChangeCandidate[];
  selectedCandidateId: string | null;
  selectedOptionId: string | null;
  selectedCandidate: ReferenceChangeCandidate | null;
  selectedPlan: ReferencePatchPlan | null;
  onSelectCandidate: (id: string) => void;
  onSelectOption: (id: string) => void;
  onApplyPlan: () => void;
}

const severityColor = (
  theme: "light" | "dark",
  severity: ReferenceAuditIssue["severity"],
) => {
  if (severity === "error") {
    return theme === "dark" ? "#fda4af" : "#be123c";
  }
  if (severity === "warn") {
    return theme === "dark" ? "#fcd34d" : "#b45309";
  }
  return theme === "dark" ? "#93c5fd" : "#1d4ed8";
};

const ReferenceOpsPanel: React.FC<ReferenceOpsPanelProps> = ({
  theme,
  borderColor,
  inputBackground,
  textMain,
  textMuted,
  workspace,
  candidates,
  selectedCandidateId,
  selectedOptionId,
  selectedCandidate,
  selectedPlan,
  onSelectCandidate,
  onSelectOption,
  onApplyPlan,
}) => {
  const auditIssues = workspace?.issues || [];
  const totalErrors = auditIssues.filter((issue) => issue.severity === "error").length;
  const totalWarnings = auditIssues.filter((issue) => issue.severity === "warn").length;

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor, backgroundColor: inputBackground }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold">Reference Ops</h3>
          <p className="text-[11px] mt-1" style={{ color: textMuted }}>
            Audit config and superscripts, review PDF-driven reference changes,
            and apply only the safe config-side updates.
          </p>
        </div>
        <div className="text-right text-[11px]" style={{ color: textMuted }}>
          <div>{candidates.length} review items</div>
          <div>{totalErrors} errors / {totalWarnings} warnings</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1fr_1.2fr] gap-4">
        <section className="rounded-xl border overflow-hidden" style={{ borderColor }}>
          <div className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-[0.14em]" style={{ borderColor, color: textMuted }}>
            Audit
          </div>
          <div className="max-h-[24rem] overflow-auto p-3 space-y-2">
            {auditIssues.length > 0 ? auditIssues.slice(0, 16).map((issue) => (
              <div key={issue.id} className="rounded-lg border px-3 py-2" style={{ borderColor }}>
                <div className="text-[11px] font-semibold" style={{ color: severityColor(theme, issue.severity) }}>
                  {issue.title}
                </div>
                <div className="text-[11px] mt-1" style={{ color: textMuted }}>{issue.detail}</div>
                {issue.filePath ? (
                  <div className="text-[10px] mt-1 font-mono break-all" style={{ color: textMuted }}>{issue.filePath}</div>
                ) : null}
              </div>
            )) : (
              <div className="text-sm" style={{ color: textMuted }}>
                No audit issues detected from the current config and superscript scan.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border overflow-hidden" style={{ borderColor }}>
          <div className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-[0.14em]" style={{ borderColor, color: textMuted }}>
            Review Queue
          </div>
          <div className="max-h-[24rem] overflow-auto p-3 space-y-2">
            {candidates.length > 0 ? candidates.map((candidate) => {
              const isActive = candidate.id === selectedCandidateId;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSelectCandidate(candidate.id)}
                  className="w-full text-left rounded-lg border px-3 py-2 transition-colors"
                  style={{
                    borderColor: isActive ? "rgba(99,102,241,0.55)" : borderColor,
                    backgroundColor: isActive
                      ? theme === "dark"
                        ? "rgba(79,70,229,0.16)"
                        : "rgba(79,70,229,0.08)"
                      : "transparent",
                    color: textMain,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold leading-5">{candidate.title}</div>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(14,165,233,0.14)", color: theme === "dark" ? "#67e8f9" : "#0369a1" }}>
                      {candidate.confidence}
                    </span>
                  </div>
                  <div className="text-[11px] mt-1 line-clamp-3" style={{ color: textMuted }}>{candidate.summary}</div>
                  <div className="text-[10px] mt-2" style={{ color: textMuted }}>
                    {candidate.resolutionOptions.length} options • {candidate.matchedStableIds.length} linked refs
                  </div>
                </button>
              );
            }) : (
              <div className="text-sm" style={{ color: textMuted }}>
                No reference-change annotations are ready for guided fixing yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border overflow-hidden" style={{ borderColor }}>
          <div className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-[0.14em]" style={{ borderColor, color: textMuted }}>
            Patch Preview
          </div>
          <div className="max-h-[24rem] overflow-auto p-3 space-y-3">
            {selectedCandidate ? (
              <>
                <div>
                  <div className="text-sm font-semibold">{selectedCandidate.title}</div>
                  <div className="text-[11px] mt-1" style={{ color: textMuted }}>{selectedCandidate.summary}</div>
                </div>

                <div className="space-y-2">
                  {selectedCandidate.resolutionOptions.map((option) => {
                    const isActive = option.id === selectedOptionId;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onSelectOption(option.id)}
                        className="w-full rounded-lg border px-3 py-2 text-left"
                        style={{
                          borderColor: isActive ? "rgba(34,197,94,0.48)" : borderColor,
                          backgroundColor: isActive
                            ? theme === "dark"
                              ? "rgba(34,197,94,0.12)"
                              : "rgba(34,197,94,0.08)"
                            : "transparent",
                          color: textMain,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{option.label}</span>
                          {option.recommended ? (
                            <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(34,197,94,0.16)", color: theme === "dark" ? "#86efac" : "#166534" }}>
                              Recommended
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] mt-1" style={{ color: textMuted }}>{option.description}</div>
                      </button>
                    );
                  })}
                </div>

                {selectedPlan ? (
                  <div className="space-y-3 rounded-lg border p-3" style={{ borderColor }}>
                    <div>
                      <div className="text-sm font-semibold">{selectedPlan.title}</div>
                      <div className="text-[11px] mt-1" style={{ color: textMuted }}>{selectedPlan.summary}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-md border px-2 py-2" style={{ borderColor }}>
                        <div style={{ color: textMuted }}>Scope</div>
                        <div className="font-semibold">{selectedPlan.impact.scopeLabel}</div>
                      </div>
                      <div className="rounded-md border px-2 py-2" style={{ borderColor }}>
                        <div style={{ color: textMuted }}>Affected Slides</div>
                        <div className="font-semibold">{selectedPlan.impact.affectedSlides.length}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold mb-1" style={{ color: textMuted }}>Config changes</div>
                      {selectedPlan.configPatchPreview.length > 0 ? (
                        <div className="space-y-2">
                          {selectedPlan.configPatchPreview.map((patch) => (
                            <div key={patch.key} className="rounded-md border px-2 py-2 text-[11px]" style={{ borderColor }}>
                              <div className="font-semibold">{patch.key}</div>
                              <div className="mt-1 break-all" style={{ color: textMuted }}>Before: {patch.before}</div>
                              <div className="mt-1 break-all">After: {patch.after}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px]" style={{ color: textMuted }}>No config mutation in this option.</div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold mb-1" style={{ color: textMuted }}>HTML suggestions</div>
                      {selectedPlan.htmlSuggestions.length > 0 ? (
                        <div className="space-y-2">
                          {selectedPlan.htmlSuggestions.map((suggestion) => (
                            <div key={suggestion.id} className="rounded-md border px-2 py-2 text-[11px]" style={{ borderColor }}>
                              <div className="font-semibold break-all">{suggestion.filePath}</div>
                              <div className="mt-1" style={{ color: textMuted }}>Selector: {suggestion.selector || "(not resolved)"}</div>
                              <div className="mt-1">{suggestion.oldDataRefTarget || "(empty)"} ? {suggestion.newDataRefTarget || "(empty)"}</div>
                              <div className="mt-1">{suggestion.oldVisibleText || "(empty)"} ? {suggestion.newVisibleText || "(empty)"}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px]" style={{ color: textMuted }}>No HTML review items for this option.</div>
                      )}
                    </div>

                    {selectedPlan.issues.length > 0 ? (
                      <div>
                        <div className="text-[11px] font-semibold mb-1" style={{ color: textMuted }}>Plan issues</div>
                        <div className="space-y-1">
                          {selectedPlan.issues.map((issue) => (
                            <div key={issue.id} className="text-[11px]" style={{ color: severityColor(theme, issue.severity) }}>
                              {issue.title}: <span style={{ color: textMuted }}>{issue.detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={onApplyPlan}
                      className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white"
                      style={{ backgroundColor: "#4f46e5" }}
                    >
                      Apply Plan To Config Draft
                    </button>
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: textMuted }}>
                    This candidate is analysis-only right now. No safe config patch is prebuilt for it.
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm" style={{ color: textMuted }}>
                Select a review item to inspect the blast radius and suggested patch.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ReferenceOpsPanel;
