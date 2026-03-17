import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { setIsOpen, setFocusedAnnotation } from '../store/annotationSlice';
import { LoaderCircle, FileText, Upload, X, FileDown } from 'lucide-react';

interface PdfSelectorProps {
  onSelectPdf: () => void;
  onRefreshPdf: () => void;
  onExportEditablePdf: () => void;
  isExporting: boolean;
  showExportEditablePdf: boolean;
  projectPath: string | null;
  theme: 'light' | 'dark';
}

const PdfSelector: React.FC<PdfSelectorProps> = ({ onSelectPdf, onRefreshPdf, onExportEditablePdf, isExporting, showExportEditablePdf, projectPath, theme }) => {
  const dispatch = useDispatch();
  const { records, isLoading, fileName, isOpen } = useSelector((state: RootState) => state.annotations);

  const hasRecords = records.length > 0;

  return (
    <div className={`absolute top-4 right-4 z-50 flex items-center gap-2 p-1.5 rounded-2xl border shadow-lg backdrop-blur-xl ${theme === 'dark' ? 'bg-slate-900/80 border-slate-700/50' : 'bg-white/80 border-slate-200/50'}`}>
      
      {hasRecords && (
        <div className="flex flex-col justify-center px-3 max-w-[150px]">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate">PDF Notes</span>
          <span className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
            {fileName || 'Annotations Loaded'}
          </span>
        </div>
      )}

      {hasRecords && (
        <div className="h-6 w-px bg-slate-500/20 mx-1"></div>
      )}

      <button
        type="button"
        className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${
           hasRecords 
            ? 'bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20' 
            : theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
        }`}
        onClick={hasRecords && !isOpen ? () => dispatch(setIsOpen(true)) : onSelectPdf}
        disabled={!projectPath || isLoading}
        title={projectPath ? (hasRecords ? "Show PDF Annotations" : "Load annotated PDF") : "Open a presentation first"}
      >
        {isLoading ? (
          <LoaderCircle size={18} className="animate-spin" />
        ) : (
          <FileText size={18} />
        )}
      </button>

      {hasRecords && (
        <button
          type="button"
          className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
          onClick={onRefreshPdf}
          disabled={!projectPath || isLoading}
          title="Upload annotated PDF"
        >
          <Upload size={16} />
        </button>
      )}

      {showExportEditablePdf && (
        <button
          type="button"
          className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${
            theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
          onClick={onExportEditablePdf}
          disabled={!projectPath || isExporting}
          title={projectPath ? 'Export editable PDF' : 'Open a presentation first'}
        >
          {isExporting ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <FileDown size={16} />
          )}
        </button>
      )}

      {hasRecords && isOpen && (
         <button
         type="button"
         className={`flex items-center justify-center h-9 w-9 rounded-xl transition-all ${theme === 'dark' ? 'text-red-400 hover:bg-red-400/10' : 'text-red-500 hover:bg-red-500/10'}`}
         onClick={() => {
           dispatch(setIsOpen(false));
           dispatch(setFocusedAnnotation(null));
         }}
         title="Close PDF Annotations"
       >
         <X size={18} />
       </button>
      )}

    </div>
  );
};

export default PdfSelector;
