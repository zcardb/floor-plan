import { lazy } from "react";

/**
 * 工作台里按需打开的弹窗与侧栏：只在真正打开时才下载对应模块，不进首屏包。
 * 统一导出 lazy 组件，Workbench 与测试引用的是同一个引用。
 */
export const WallSplitDialog = lazy(() => import("./WallSplitDialog").then((m) => ({ default: m.WallSplitDialog })));
export const DimensionEditDialog = lazy(() => import("./DimensionEditDialog").then((m) => ({ default: m.DimensionEditDialog })));
export const CustomFurnitureDialog = lazy(() => import("./CustomFurnitureDialog").then((m) => ({ default: m.CustomFurnitureDialog })));
export const AiRoomDialog = lazy(() => import("./AiRoomDialog").then((m) => ({ default: m.AiRoomDialog })));
export const AiChatPanel = lazy(() => import("./AiChatPanel").then((m) => ({ default: m.AiChatPanel })));
export const AiCreateProjectDialog = lazy(() => import("./AiCreateProjectDialog").then((m) => ({ default: m.AiCreateProjectDialog })));
/** 方案报告正文（报告模型 + 平面图）：弹窗外壳常驻，打开后才下载这部分。 */
export const ReportContent = lazy(() => import("./ReportContent").then((m) => ({ default: m.ReportContent })));
