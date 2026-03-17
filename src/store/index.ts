import { configureStore } from '@reduxjs/toolkit';
import annotationReducer from './annotationSlice';

export const store = configureStore({
  reducer: {
    annotations: annotationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
