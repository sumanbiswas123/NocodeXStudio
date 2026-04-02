import React, { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { setTypeOverrides, setViewMode, setTypeFilter } from '../store/annotationSlice';
import { PdfAnnotationUiRecord } from '../../app/helpers/pdfAnnotationHelpers';

const ANNOTATION_INTENT_OPTIONS = [
  "stylingChange",
  "textualChange",
  "textInImage",
  "notFound",
  "referenceChange",
  "assetChange",
  "flowChange",
  "piChange",
  "siChange",
];

interface PdfAnnotationsOverlayProps {
  currentPreviewSlideId: string | null;
  theme: 'light' | 'dark';
  onJumpToAnnotation?: (annotation: PdfAnnotationUiRecord) => void;
  embedded?: boolean;
  footer?: React.ReactNode;
}

const PdfAnnotationsOverlay: React.FC<PdfAnnotationsOverlayProps> = ({
  currentPreviewSlideId,
  theme,
  onJumpToAnnotation,
  embedded = false,
  footer,
}) => {
  const dispatch = useDispatch();
  const {
    records,
    isOpen,
    focusedAnnotation,
    typeOverrides,
    viewMode,
    typeFilter,
    isLoading,
    error,
    processingLogs,
  } = useSelector((state: RootState) => state.annotations);

  const visibleAnnotations = useMemo(() => {
    if (viewMode === 'perSlide') {
      return records.filter(
        (record) =>
          record.mappedSlideId && record.mappedSlideId === currentPreviewSlideId,
      );
    }
    return records;
  }, [records, viewMode, currentPreviewSlideId]);

  const filteredAnnotations = useMemo(() => {
    if (typeFilter === "all") return visibleAnnotations;
    return visibleAnnotations.filter((annotation) => {
      const isPopup =
        annotation.annotationStatus === "Popup" ||
        annotation.subtype === "Popup" ||
        annotation.detectedSubtype === "Popup";
      return typeFilter === "popup" ? isPopup : !isPopup;
    });
  }, [visibleAnnotations, typeFilter]);

  const recentProcessingLogs = useMemo(
    () => processingLogs.slice(-8).reverse(),
    [processingLogs],
  );

  if (!isOpen) return null;

  return (
    <div
      className={
        embedded
          ? `h-full flex flex-col overflow-hidden ${
              theme === 'dark' ? 'bg-slate-900/5' : 'bg-white/5'
            }`
          : `fixed right-0 top-20 bottom-20 w-[380px] flex flex-col rounded-l-[40px] border-l border-y transition-all duration-700 z-[100] overflow-hidden ${
              theme === 'dark'
                ? 'bg-slate-900/10 border-slate-700/15 shadow-[-20px_0_100px_rgba(0,0,0,0.3)]'
                : 'bg-white/10 border-slate-200/20 shadow-[-20px_0_100px_rgba(0,0,0,0.05)]'
            } backdrop-blur-2xl`
      }
    >
      <div className={`px-4 py-3 border-b flex items-center justify-between ${theme === 'dark' ? 'border-slate-800/80' : 'border-slate-200/80'}`}>
        <div className={`text-xs font-semibold tracking-wider uppercase ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          Notes ({filteredAnnotations.length})
        </div>
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-end gap-1">
            <div className="flex bg-slate-500/10 rounded-lg p-0.5">
              <button
                onClick={() => dispatch(setViewMode('perSlide'))}
                className={`px-2 py-1 text-[9px] rounded-md transition-all font-bold uppercase tracking-tighter ${
                  viewMode === 'perSlide'
                    ? (theme === 'dark'
                        ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/20'
                        : 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20')
                    : (theme === 'dark'
                        ? 'text-slate-500 hover:text-slate-300'
                        : 'text-slate-400 hover:text-slate-600')
                }`}
              >
                Per Slide
              </button>
              <button
                onClick={() => dispatch(setViewMode('all'))}
                className={`px-2 py-1 text-[9px] rounded-md transition-all font-bold uppercase tracking-tighter ${
                  viewMode === 'all'
                    ? (theme === 'dark'
                        ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/20'
                        : 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20')
                    : (theme === 'dark'
                        ? 'text-slate-500 hover:text-slate-300'
                        : 'text-slate-400 hover:text-slate-600')
                }`}
              >
                All
              </button>
            </div>
            <div className="flex bg-slate-500/10 rounded-lg p-0.5">
              <button
                onClick={() => dispatch(setTypeFilter("slide"))}
                className={`px-2 py-1 text-[9px] rounded-md transition-all font-bold uppercase tracking-tighter ${
                  typeFilter === "slide"
                    ? (theme === 'dark'
                        ? 'bg-violet-500 text-slate-900 shadow-lg shadow-violet-500/20'
                        : 'bg-violet-500 text-white shadow-lg shadow-violet-500/20')
                    : (theme === 'dark'
                        ? 'text-slate-500 hover:text-slate-300'
                        : 'text-slate-400 hover:text-slate-600')
                }`}
              >
                Slide
              </button>
              <button
                onClick={() => dispatch(setTypeFilter("popup"))}
                className={`px-2 py-1 text-[9px] rounded-md transition-all font-bold uppercase tracking-tighter ${
                  typeFilter === "popup"
                    ? (theme === 'dark'
                        ? 'bg-violet-500 text-slate-900 shadow-lg shadow-violet-500/20'
                        : 'bg-violet-500 text-white shadow-lg shadow-violet-500/20')
                    : (theme === 'dark'
                        ? 'text-slate-500 hover:text-slate-300'
                        : 'text-slate-400 hover:text-slate-600')
                }`}
              >
                Popup
              </button>
              <button
                onClick={() => dispatch(setTypeFilter("all"))}
                className={`px-2 py-1 text-[9px] rounded-md transition-all font-bold uppercase tracking-tighter ${
                  typeFilter === "all"
                    ? (theme === 'dark'
                        ? 'bg-violet-500 text-slate-900 shadow-lg shadow-violet-500/20'
                        : 'bg-violet-500 text-white shadow-lg shadow-violet-500/20')
                    : (theme === 'dark'
                        ? 'text-slate-500 hover:text-slate-300'
                        : 'text-slate-400 hover:text-slate-600')
                }`}
              >
                All
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-0 py-0 custom-scrollbar">
        {filteredAnnotations.length === 0 ? (
          <div className={`px-4 py-10 text-center text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
            {isLoading ? (
              <div className="flex flex-col gap-4 text-left">
                <div className="flex items-center justify-center gap-3 min-w-0">
                  <div className="relative w-7 h-7">
                    <div className={`absolute inset-0 rounded-full border-2 ${theme === 'dark' ? 'border-slate-700' : 'border-slate-200'}`} />
                    <div className={`absolute inset-0 rounded-full border-2 border-t-transparent animate-spin ${theme === 'dark' ? 'border-cyan-400' : 'border-cyan-500'}`} />
                  </div>
                  <div className={`min-w-0 flex-1 text-[12px] leading-5 break-words [overflow-wrap:anywhere] ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                    {processingLogs[processingLogs.length - 1]?.message || 'Building annotations...'}
                  </div>
                </div>
                <div className={`text-center text-[10px] uppercase tracking-widest animate-pulse ${theme === 'dark' ? 'text-cyan-300/80' : 'text-cyan-600/80'}`}>
                  Working...
                </div>
                {recentProcessingLogs.length > 0 ? (
                  <div
                    className={`rounded-xl border px-3 py-3 ${
                      theme === 'dark'
                        ? 'border-slate-800 bg-slate-900/40'
                        : 'border-slate-200 bg-white/70'
                    }`}
                  >
                    <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                      Processing Log
                    </div>
                    <div className="mt-2 max-h-40 overflow-auto no-scrollbar space-y-2">
                      {recentProcessingLogs.map((entry) => (
                        <div key={entry.id} className="flex items-start gap-2 text-[11px] leading-5">
                          <span
                            className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                              entry.level === 'error'
                                ? 'bg-rose-500'
                                : entry.level === 'warn'
                                  ? 'bg-amber-500'
                                  : 'bg-cyan-500'
                            }`}
                          />
                          <div className={`min-w-0 flex-1 break-words [overflow-wrap:anywhere] ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                            {entry.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : error ? (
              <div className="text-rose-400 text-[12px]">{error}</div>
            ) : (
              'No annotations for this view.'
            )}
          </div>
        ) : (
          <div className="space-y-3 px-3 py-3">
            {filteredAnnotations.map((annotation) => {
            const isFocused = focusedAnnotation?.annotationId === annotation.annotationId;
            const mainThreadEntry =
              annotation.threadEntries.find((entry) => entry.role === "comment") ||
              annotation.threadEntries[0] ||
              null;
            const effectiveType =
              typeOverrides[annotation.annotationId] ||
              (ANNOTATION_INTENT_OPTIONS.includes(annotation.annotationType)
                ? annotation.annotationType
                : "notFound");
            const isCurrentSlideMatch =
              annotation.mappedSlideId === currentPreviewSlideId;

            return (
              <div
                key={annotation.annotationId}
                onClick={() => onJumpToAnnotation?.(annotation)}
                className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                  isFocused
                    ? (theme === 'dark'
                        ? 'border-cyan-500/50 bg-cyan-900/20'
                        : 'border-cyan-400 bg-cyan-50')
                    : isCurrentSlideMatch
                      ? (theme === 'dark'
                          ? 'border-cyan-800/50 bg-cyan-900/10'
                          : 'border-cyan-200 bg-cyan-50/50')
                      : (theme === 'dark'
                          ? 'border-slate-800 bg-slate-800/30 hover:bg-slate-800/50'
                          : 'border-slate-200 bg-white hover:bg-slate-50')
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      Page {annotation.annoPdfPage}
                    </span>
                    {annotation.subtype === 'Popup' && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-400 font-semibold uppercase">
                        Popup
                      </span>
                    )}
                  </div>
                  <select
                    className={`text-[9px] rounded-md px-1 py-0.5 border uppercase font-semibold ${
                      theme === 'dark'
                        ? 'bg-slate-800 border-slate-700 text-slate-300'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                    value={effectiveType}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      dispatch(
                        setTypeOverrides({
                          ...typeOverrides,
                          [annotation.annotationId]: event.target.value,
                        }),
                      )
                    }
                  >
                    {ANNOTATION_INTENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {mainThreadEntry ? mainThreadEntry.text : annotation.annotationText}
                </div>

                {annotation.pdfPageImage ? (
                  <div className="mt-3 relative h-24 w-full rounded-lg overflow-hidden border border-slate-700/30 bg-black/20 group-hover:border-cyan-500/30 transition-colors">
                    <img
                      src={annotation.pdfPageImage}
                      alt={`Context Page ${annotation.annoPdfPage}`}
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                  </div>
                ) : null}

                {annotation.pdfContextText ? (
                  <div className={`mt-2 p-2 rounded-lg text-xs italic border-l-2 break-words whitespace-pre-wrap ${
                    theme === 'dark'
                      ? 'bg-slate-800/50 border-slate-600 text-slate-400'
                      : 'bg-slate-50 border-slate-300 text-slate-500'
                  }`}>
                    "{annotation.pdfContextText}"
                  </div>
                ) : null}
              </div>
            );
          })}
          </div>
        )}
      </div>

      {footer ? (
        <div className={`shrink-0 border-t min-h-0 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
          {footer}
        </div>
      ) : null}
    </div>
  );
};

export default PdfAnnotationsOverlay;
