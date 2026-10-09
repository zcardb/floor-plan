export { browserEnv, canDownloadDirectly, isCoarsePointer, isWeChat, supportsPointerLock, type PlatformEnv } from "./capabilities";
export { releasePointerLock, tryPointerLock } from "./pointerLock";
export { saveFile, type SaveResult } from "./saveFile";
export { IOS_CANVAS_LIMITS, rasterSize, type RasterLimits } from "./canvasLimits";
export { onPageHide, type PageHidePhase } from "./pageLifecycle";
