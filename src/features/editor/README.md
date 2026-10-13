# editor · 工作台

## 职责

户型编辑的主界面与全部编辑操作：2D 画布（墙、门窗、房间、分隔线、家具、楼梯、尺寸标注、对齐辅助线）、选中对象的浮动工具条、右侧侧栏（家具库 / 方案与成本 / 户型 / 风格 / AI / 布局整理）、画布竖条、撤销与尺寸事务、2D / 3D 切换、保存与导出菜单。它也是其余 Feature 的装配点：项目菜单、成本、风格、AI、报告、3D、导入都经各自公开入口接进来。

## 公开入口

`Workbench`（工作室页面 `app/pages/studio-page.tsx` 使用）。

## 目录

| 目录 | 内容 |
| --- | --- |
| `components/` | `workbench.tsx`（装配与顶栏）、`plan-canvas.tsx`（2D 画布）、`selection-editor.tsx`（浮动工具条）、`side-panel.tsx`、`canvas-rail.tsx` / `rail-tools.tsx`、`library.tsx`（家具库侧栏）、`layout-panel.tsx`（布局整理）、`export-menu.tsx` / `save-file-dialog.tsx`、各类编辑器小部件；`lazy-dialogs.ts` 是本 Feature 的按需弹窗（拆墙、尺寸编辑） |
| `hooks/` | `use-design.ts`（方案状态与撤销栈）、`use-wall-drawing.ts` / `use-segment-drawing.ts` / `use-separator-drawing.ts`（画墙与分隔线）、`use-editor-drag.ts`、`use-scene-lifecycle.ts`（3D 打开 / 失败状态） |
| `model/` | 只服务编辑器的操作：墙的移动 / 转换 / 自动拆分 / 接触、门窗拖动与吸附、家具对齐 / 跟随 / 缩放 / 图层、尺寸事务、选区编辑、空白户型外框等 |
| `__tests__/` | 组件与操作测试；`room-enclosure.ts` 是断言用的测试辅助 |

多个 Feature 共用的户型规则（几何、墙与房间推导、成本、素材目录）在 `lib/floor-plan`；导出文件生成在 `lib/drawing`（点击导出时按需加载）。

## 规则

- 对象编辑能力只加在浮动工具条（`SelectionEditor`）里；方案与成本、户型、风格、家具库、AI 这类全局内容放在 `SidePanel`，入口在 `CanvasRail`（详见根目录 `AGENTS.md` §2）。
- 3D 场景、报告正文与 PDF、AI 弹窗、自定义家具弹窗都经对应 Feature 的公开入口按需加载，不进首屏包（报告弹窗只有轻量外壳随工作台常驻）。
- 楼梯的数据、图样与规范提示见 `docs/features/stairs.md`。
