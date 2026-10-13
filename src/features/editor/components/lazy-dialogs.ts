import { lazy } from "react";

/**
 * 工作台自己的按需弹窗：只在真正打开时才下载对应模块，不进首屏包。
 * 其他 Feature 的弹窗由各自的公开入口以 lazy 组件导出；Workbench 与测试引用的是同一个引用。
 */
export const WallSplitDialog = lazy(() => import("./wall-split-dialog").then((m) => ({ default: m.WallSplitDialog })));
export const DimensionEditDialog = lazy(() => import("./dimension-edit-dialog").then((m) => ({ default: m.DimensionEditDialog })));
