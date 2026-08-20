import { create } from "zustand";

export const useDiagnosisStore = create((set) => ({
  /** Scan currently rendered in the right-hand panel. */
  activeScanId: null,
  /** Local X-ray File chosen in the upload zone, before it is sent. */
  pendingFile: null,
  /** Segmentation mask JSON staged alongside it. Required until the
   *  segmentation model can produce one. */
  pendingMask: null,
  /** Whether the segmentation mask overlay is drawn on the X-ray. */
  showMask: true,
  /** Who the AI output is written for. Shared, so the report, the Q&A and the
   *  overlay explanations all speak in the same register. */
  audience: "patient",
  /** Whether the assistant dock on the right is open. */
  askOpen: false,
  /** Developer path: supply the mask by hand instead of letting the model
   *  generate it. Mutually exclusive with automatic segmentation. */
  devMode: false,

  setActiveScanId: (activeScanId) => set({ activeScanId }),
  setPendingFile: (pendingFile) => set({ pendingFile }),
  setPendingMask: (pendingMask) => set({ pendingMask }),
  clearPendingMask: () => set({ pendingMask: null }),
  // Clearing the X-ray drops the mask too — a mask belongs to one image.
  clearPendingFile: () => set({ pendingFile: null, pendingMask: null }),
  setAudience: (audience) => set({ audience }),
  // Leaving developer mode drops any staged mask — the model will make its own.
  toggleDevMode: () =>
    set((state) => ({
      devMode: !state.devMode,
      pendingMask: state.devMode ? null : state.pendingMask,
    })),
  toggleAsk: () => set((state) => ({ askOpen: !state.askOpen })),
  closeAsk: () => set({ askOpen: false }),
  toggleMask: () => set((state) => ({ showMask: !state.showMask })),
}));
