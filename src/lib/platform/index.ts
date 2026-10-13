export { browserEnv, canDownloadDirectly, isCoarsePointer, isWeChat, supportsPointerLock, type PlatformEnv } from "./capabilities";
export { releasePointerLock, tryPointerLock } from "./pointer-lock";
export { saveFile, type SaveResult } from "./save-file";
export { IOS_CANVAS_LIMITS, rasterSize, type RasterLimits } from "./canvas-limits";
export { onPageHide, type PageHidePhase } from "./page-lifecycle";
