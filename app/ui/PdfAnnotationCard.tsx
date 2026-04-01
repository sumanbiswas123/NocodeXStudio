import React from "react";
import { PdfAnnotationUiRecord } from "../helpers/pdfAnnotationHelpers";
import "../styles/ui/pdf-annotation-card.css";

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
      className="pdf-annotation-card"
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
      <div className="pdf-annotation-card-header">
        <div className="pdf-annotation-card-header-meta">
          <div className="pdf-annotation-card-page">Page {annotation.annoPdfPage}</div>
          <div className="pdf-annotation-card-label">
            {mappedLabel ? mappedLabel : "Unmapped"}
          </div>
        </div>
        <div className="pdf-annotation-card-actions">
          <select
            title={`Annotation intent for page ${annotation.annoPdfPage}`}
            aria-label={`Annotation intent for page ${annotation.annoPdfPage}`}
            className="pdf-annotation-card-select"
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
              <option
                key={`anno-type-${annotation.annotationId}-${option}`}
                value={option}
              >
                {option}
              </option>
            ))}
          </select>
          <div
            className="pdf-annotation-card-location"
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

      <div className="pdf-annotation-card-content">
        {mainThreadEntry ? (
          <div className="pdf-annotation-card-thread">
            <div>
              <div style={{ fontWeight: 500, lineHeight: "1.5rem" }}>
                {mainThreadEntry.text}
              </div>
              <div className="pdf-annotation-card-author">
                {mainThreadEntry.author}
              </div>
            </div>
            {replyEntries.length > 0 ? (
              <div
                className="pdf-annotation-card-discussion"
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
                <div className="pdf-annotation-card-discussion-label">
                  Discussion
                </div>
                {replyEntries.map((entry, index) => (
                  <div
                    key={`${annotation.annotationId}-reply-${index}`}
                    className="pdf-annotation-card-reply"
                    style={{
                      borderColor:
                        theme === "dark"
                          ? "rgba(34,211,238,0.24)"
                          : "rgba(14,165,233,0.18)",
                    }}
                  >
                    <div style={{ lineHeight: "1.5rem" }}>{entry.text}</div>
                    <div className="pdf-annotation-card-author">
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

      <div className="pdf-annotation-card-target-status">
        <span
          className="pdf-annotation-card-target-dot"
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

      <div className="pdf-annotation-card-footer">
        {annotation.popupInvocation?.popupId && (
          <div
            className="pdf-annotation-card-popup-id"
            title={`Resolved Popup ID: ${annotation.popupInvocation.popupId}`}
          >
            PID: {annotation.popupInvocation.popupId.slice(0, 8)}...
          </div>
        )}
        {annotation.mappedFilePath ? (
          <button
            type="button"
            className="pdf-annotation-card-open-button"
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
