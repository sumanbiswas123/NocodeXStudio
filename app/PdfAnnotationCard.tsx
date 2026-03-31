import React from "react";
import { PdfAnnotationUiRecord } from "./pdfAnnotationHelpers";

type PdfAnnotationCardProps = {
  annotation: PdfAnnotationUiRecord;
  currentPreviewSlideId: string | null;
  focusedAnnotationId: string | null;
  annotationTypeOverrides: Record<string, string>;
  annotationIntentOptions: string[];
  theme: "dark" | "light";
  resolveMappedLabelShort: (annotation: PdfAnnotationUiRecord) => string;
  onJumpToAnnotation: (annotation: PdfAnnotationUiRecord) => void;
  onTypeOverrideChange: (annotationId: string, value: string) => void;
};

const PdfAnnotationCard: React.FC<PdfAnnotationCardProps> = ({
  annotation,
  currentPreviewSlideId,
  focusedAnnotationId,
  annotationTypeOverrides,
  annotationIntentOptions,
  theme,
  resolveMappedLabelShort,
  onJumpToAnnotation,
  onTypeOverrideChange,
}) => {
  const isCurrentSlideMatch = annotation.mappedSlideId === currentPreviewSlideId;
  const isFocused = focusedAnnotationId === annotation.annotationId;
  const mainThreadEntry =
    annotation.threadEntries.find((entry) => entry.role === "comment") ||
    annotation.threadEntries[0] ||
    null;
  const replyEntries = annotation.threadEntries.filter(
    (entry) => entry !== mainThreadEntry,
  );
  const mappedLabel = resolveMappedLabelShort(annotation);
  const effectiveType =
    annotationTypeOverrides[annotation.annotationId] ||
    (annotationIntentOptions.includes(annotation.annotationType)
      ? annotation.annotationType
      : "notFound");
  const hasResolvableTarget = Boolean(
    annotation.foundSelector ||
      annotation.mappedFilePath ||
      annotation.status === "Mapped" ||
      annotation.popupInvocation?.triggerSelector ||
      annotation.popupInvocation?.containerSelector ||
      (annotation.subtype === "Popup" && annotation.mappedFilePath) ||
      (annotation.subtype === "Popup" &&
        annotation.pdfContextText &&
        annotation.pdfContextText.length > 5),
  );

  return (
    <div
      className="rounded-[22px] border px-4 py-4"
      style={{
        borderColor: isFocused
          ? "rgba(34,211,238,0.55)"
          : theme === "dark"
            ? "rgba(148,163,184,0.18)"
            : "rgba(15,23,42,0.08)",
        background: isCurrentSlideMatch
          ? theme === "dark"
            ? "rgba(8,145,178,0.16)"
            : "rgba(14,165,233,0.1)"
          : theme === "dark"
            ? "rgba(15,23,42,0.54)"
            : "rgba(255,255,255,0.8)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Page {annotation.annoPdfPage}</div>
          <div
            className="mt-1 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--text-muted)" }}
          >
            {mappedLabel ? mappedLabel : "Unmapped"}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <select
            title={`Annotation intent for page ${annotation.annoPdfPage}`}
            aria-label={`Annotation intent for page ${annotation.annoPdfPage}`}
            className="rounded-full border bg-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              borderColor:
                theme === "dark"
                  ? "rgba(34,211,238,0.4)"
                  : "rgba(14,165,233,0.35)",
              color: "var(--text-main)",
            }}
            value={effectiveType}
            onChange={(event) =>
              onTypeOverrideChange(annotation.annotationId, event.target.value)
            }
          >
            {annotationIntentOptions.map((option) => (
              <option key={`anno-type-${annotation.annotationId}-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
          <div
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              background:
                theme === "dark"
                  ? "rgba(148,163,184,0.18)"
                  : "rgba(15,23,42,0.1)",
              color: "var(--text-main)",
            }}
          >
            {annotation.annotationLocationType}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[13px] leading-6 break-words">
        {mainThreadEntry ? (
          <div className="space-y-3">
            <div>
              <div className="font-medium leading-6">{mainThreadEntry.text}</div>
              <div
                className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--text-muted)" }}
              >
                {mainThreadEntry.author}
              </div>
            </div>
            {replyEntries.length > 0 ? (
              <div
                className="rounded-2xl border px-3 py-3 space-y-3"
                style={{
                  borderColor:
                    theme === "dark"
                      ? "rgba(148,163,184,0.14)"
                      : "rgba(15,23,42,0.08)",
                  background:
                    theme === "dark"
                      ? "rgba(2,6,23,0.24)"
                      : "rgba(248,250,252,0.9)",
                }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Discussion
                </div>
                {replyEntries.map((entry, index) => (
                  <div
                    key={`${annotation.annotationId}-reply-${index}`}
                    className="pl-3 border-l space-y-1"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(34,211,238,0.24)"
                          : "rgba(14,165,233,0.18)",
                    }}
                  >
                    <div className="leading-6">{entry.text}</div>
                    <div
                      className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {entry.author}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          annotation.annotationText
        )}
      </div>

      <div
        className="mt-3 flex items-center gap-2 text-[11px]"
        style={{ color: "var(--text-muted)" }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{
            background: hasResolvableTarget
              ? "rgba(34,197,94,0.9)"
              : "rgba(248,113,113,0.9)",
          }}
        />
        {hasResolvableTarget
          ? "Target mapped in preview"
          : "Target not mapped to preview"}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {annotation.popupInvocation?.popupId && (
          <div
            className="px-2 py-1 rounded text-[10px] font-mono opacity-60 hover:opacity-100 transition-opacity cursor-help"
            title={`Resolved Popup ID: ${annotation.popupInvocation.popupId}`}
            style={{ background: "rgba(0,0,0,0.1)" }}
          >
            PID: {annotation.popupInvocation.popupId.slice(0, 8)}...
          </div>
        )}
        {annotation.mappedFilePath ? (
          <button
            type="button"
            className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors"
            style={{
              borderColor:
                theme === "dark"
                  ? "rgba(34,211,238,0.34)"
                  : "rgba(14,165,233,0.28)",
              color: theme === "dark" ? "#67e8f9" : "#0f766e",
            }}
            onClick={() => onJumpToAnnotation(annotation)}
          >
            Open In Slide
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default PdfAnnotationCard;
