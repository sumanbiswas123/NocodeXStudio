import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PdfAnnotationUiRecord } from '../../app/helpers/pdfAnnotationHelpers';

interface AnnotationState {
  records: PdfAnnotationUiRecord[];
  fileName: string;
  sourcePath: string | null;
  error: string | null;
  isOpen: boolean;
  isLoading: boolean;
  focusedAnnotation: PdfAnnotationUiRecord | null;
  viewMode: 'all' | 'perSlide';
  typeOverrides: Record<string, string>;
  classifierMetrics: {
    precision: number;
    recall: number;
    f1: number;
    support: number;
  } | null;
  processingLogs: {
    id: string;
    timestamp: string;
    message: string;
    level: 'info' | 'warn' | 'error';
  }[];
  typeFilter: 'all' | 'slide' | 'popup';
}

const initialState: AnnotationState = {
  records: [],
  fileName: '',
  sourcePath: null,
  error: null,
  isOpen: false,
  isLoading: false,
  focusedAnnotation: null,
  viewMode: 'all',
  typeOverrides: {},
  classifierMetrics: null,
  processingLogs: [],
  typeFilter: 'all',
};

export const annotationSlice = createSlice({
  name: 'annotations',
  initialState,
  reducers: {
    setRecords: (state, action: PayloadAction<PdfAnnotationUiRecord[]>) => {
      state.records = action.payload;
    },
    setFileName: (state, action: PayloadAction<string>) => {
      state.fileName = action.payload;
    },
    setSourcePath: (state, action: PayloadAction<string | null>) => {
      state.sourcePath = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setIsOpen: (state, action: PayloadAction<boolean>) => {
      state.isOpen = action.payload;
    },
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setFocusedAnnotation: (state, action: PayloadAction<PdfAnnotationUiRecord | null>) => {
      state.focusedAnnotation = action.payload;
    },
    setViewMode: (state, action: PayloadAction<'all' | 'perSlide'>) => {
      state.viewMode = action.payload;
    },
    setTypeOverrides: (state, action: PayloadAction<Record<string, string>>) => {
      state.typeOverrides = action.payload;
    },
    setClassifierMetrics: (state, action: PayloadAction<AnnotationState['classifierMetrics']>) => {
      state.classifierMetrics = action.payload;
    },
    addProcessingLog: (
      state,
      action: PayloadAction<{
        id: string;
        timestamp: string;
        message: string;
        level: 'info' | 'warn' | 'error';
      }>,
    ) => {
      state.processingLogs.push(action.payload);
      if (state.processingLogs.length > 200) {
        state.processingLogs.shift();
      }
    },
    clearProcessingLogs: (state) => {
      state.processingLogs = [];
    },
    setTypeFilter: (state, action: PayloadAction<'all' | 'slide' | 'popup'>) => {
      state.typeFilter = action.payload;
    },
    resetState: () => initialState,
  },
});

export const {
  setRecords,
  setFileName,
  setSourcePath,
  setError,
  setIsOpen,
  setIsLoading,
  setFocusedAnnotation,
  setViewMode,
  setTypeOverrides,
  setClassifierMetrics,
  addProcessingLog,
  clearProcessingLogs,
  setTypeFilter,
  resetState,
} = annotationSlice.actions;

export default annotationSlice.reducer;
