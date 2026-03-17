import React, { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { setTypeOverrides, setViewMode, setTypeFilter } from '../store/annotationSlice';
import { PdfAnnotationUiRecord } from '../../app/pdfAnnotationHelpers';

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
}

const PdfAnnotationsOverlay: React.FC<PdfAnnotationsOverlayProps> = ({ 
  currentPreviewSlideId, 
  theme,
  onJumpToAnnotation
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
      return records.filter(r => r.mappedSlideId && r.mappedSlideId === currentPreviewSlideId);
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

  if (!isOpen) return null;

  return (
    <div
      className={`fixed right-0 top-20 bottom-20 w-[380px] flex flex-col rounded-l-[40px] border-l border-y transition-all duration-700 z-[100] overflow-hidden ${
        theme === 'dark'
          ? 'bg-slate-900/10 border-slate-700/15 shadow-[-20px_0_100px_rgba(0,0,0,0.3)]'
          : 'bg-white/10 border-slate-200/20 shadow-[-20px_0_100px_rgba(0,0,0,0.05)]'
      } backdrop-blur-2xl`}
    >
      <div className={`px-4 py-3 border-b flex items-center justify-between ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className={`text-xs font-semibold tracking-wider uppercase ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          Notes ({filteredAnnotations.length})
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex bg-slate-500/10 rounded-lg p-0.5">
          <button
            onClick={() => dispatch(setViewMode('perSlide'))}
            className={`px-2 py-1 text-[9px] rounded-md transition-all font-bold uppercase tracking-tighter ${
              viewMode === 'perSlide' 
                ? (theme === 'dark' ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/20' : 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20')
                : (theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
            }`}
          >
            Per Slide
          </button>
          <button
            onClick={() => dispatch(setViewMode('all'))}
            className={`px-2 py-1 text-[9px] rounded-md transition-all font-bold uppercase tracking-tighter ${
              viewMode === 'all' 
                ? (theme === 'dark' ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/20' : 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20')
                : (theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
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
                  ? (theme === 'dark' ? 'bg-violet-500 text-slate-900 shadow-lg shadow-violet-500/20' : 'bg-violet-500 text-white shadow-lg shadow-violet-500/20')
                  : (theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
              }`}
            >
              Slide
            </button>
            <button
              onClick={() => dispatch(setTypeFilter("popup"))}
              className={`px-2 py-1 text-[9px] rounded-md transition-all font-bold uppercase tracking-tighter ${
                typeFilter === "popup"
                  ? (theme === 'dark' ? 'bg-violet-500 text-slate-900 shadow-lg shadow-violet-500/20' : 'bg-violet-500 text-white shadow-lg shadow-violet-500/20')
                  : (theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
              }`}
            >
              Popup
            </button>
            <button
              onClick={() => dispatch(setTypeFilter("all"))}
              className={`px-2 py-1 text-[9px] rounded-md transition-all font-bold uppercase tracking-tighter ${
                typeFilter === "all"
                  ? (theme === 'dark' ? 'bg-violet-500 text-slate-900 shadow-lg shadow-violet-500/20' : 'bg-violet-500 text-white shadow-lg shadow-violet-500/20')
                  : (theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-3 space-y-3 custom-scrollbar">
        {filteredAnnotations.length === 0 ? (
          <div className={`text-center py-10 text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
            {isLoading ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-7 h-7">
                  <div className={`absolute inset-0 rounded-full border-2 ${theme === 'dark' ? 'border-slate-700' : 'border-slate-200'}`} />
                  <div className={`absolute inset-0 rounded-full border-2 border-t-transparent animate-spin ${theme === 'dark' ? 'border-cyan-400' : 'border-cyan-500'}`} />
                </div>
                <div className={`text-[12px] ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {processingLogs[processingLogs.length - 1]?.message || 'Building annotations…'}
                </div>
                <div className={`text-[10px] uppercase tracking-widest animate-pulse ${theme === 'dark' ? 'text-cyan-300/80' : 'text-cyan-600/80'}`}>
                  Working…
                </div>
              </div>
            ) : error ? (
              <div className="text-rose-400 text-[12px]">{error}</div>
            ) : (
              'No annotations for this view.'
            )}
          </div>
        ) : (
          filteredAnnotations.map(annotation => {
            const isFocused = focusedAnnotation?.annotationId === annotation.annotationId;
            const mainThreadEntry = annotation.threadEntries.find((entry) => entry.role === "comment") || annotation.threadEntries[0] || null;
            const effectiveType = typeOverrides[annotation.annotationId] || (ANNOTATION_INTENT_OPTIONS.includes(annotation.annotationType) ? annotation.annotationType : "notFound");
            const isCurrentSlideMatch = annotation.mappedSlideId === currentPreviewSlideId;

            return (
              <div 
                key={annotation.annotationId}
                onClick={() => onJumpToAnnotation?.(annotation)}
                className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                  isFocused 
                    ? (theme === 'dark' ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-cyan-400 bg-cyan-50')
                    : isCurrentSlideMatch
                      ? (theme === 'dark' ? 'border-cyan-800/50 bg-cyan-900/10' : 'border-cyan-200 bg-cyan-50/50')
                      : (theme === 'dark' ? 'border-slate-800 bg-slate-800/30 hover:bg-slate-800/50' : 'border-slate-200 bg-white hover:bg-slate-50')
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
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                    value={effectiveType}
                    onClick={e => e.stopPropagation()}
                    onChange={(e) => dispatch(setTypeOverrides({
                      ...typeOverrides,
                      [annotation.annotationId]: e.target.value
                    }))}
                  >
                    {ANNOTATION_INTENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>

                <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {mainThreadEntry ? mainThreadEntry.text : annotation.annotationText}
                </div>

                {annotation.pdfPageImage && (
                  <div className="mt-3 relative h-24 w-full rounded-lg overflow-hidden border border-slate-700/30 bg-black/20 group-hover:border-cyan-500/30 transition-colors">
                    <img 
                      src={annotation.pdfPageImage} 
                      alt={`Context Page ${annotation.annoPdfPage}`} 
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
                  </div>
                )}

                {annotation.pdfContextText && (
                  <div className={`mt-2 p-2 rounded-lg text-xs italic border-l-2 break-words whitespace-pre-wrap ${
                    theme === 'dark' ? 'bg-slate-800/50 border-slate-600 text-slate-400' : 'bg-slate-50 border-slate-300 text-slate-500'
                  }`}>
                    "{annotation.pdfContextText}"
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PdfAnnotationsOverlay;
