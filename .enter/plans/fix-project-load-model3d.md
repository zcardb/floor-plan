# 修复「一层」打不开（项目数据不完整）

## Context
打开云端项目「一层」时报「项目数据不完整，请导入备份 / 方案格式不正确或数据超出允许范围」。

已查明原因（用只读查询加本地诊断脚本确认）：
- 数据库里这个项目的数据**本身是完整、合法的**：23 件家具、5 个房间、14 面墙、10 个门窗都在。
- 出问题的是「升降桌」的 AI 3D 模型（`model3d`）。数据库存 JSON 时会把字段**重新排序**（例如 `{d,h,w,x,y,z,kind,color}`、`{parts,version}`）。
- `validModel3d`（`src/features/interior/model/furniture3d.ts`）用 `JSON.stringify(整理后) === JSON.stringify(原值)` 判断，**字段顺序不同就判为不合法**，于是整个项目被拒绝加载。数值其实完全一致。
- 诊断：只把这项检查改成不看字段顺序，这份数据就能通过 `validateDesign`，所有内容原样保留。

所以**不改数据库里的任何数据**，布局、家具、房间都不会动；只修校验逻辑。

## 方案
在 `src/features/interior/model/furniture3d.ts` 里：
- 新增一个小工具，把对象按键名排序后再序列化（递归处理对象和数组）。
- `validModel3d` 改为比较两边按键排序后的序列化结果。数值、部件数量、取值范围等规则不变，仍然严格；只是不再在意字段顺序。

不改 `validation.ts`、`useProjects.ts`，也不改界面。

## Implementation checklist
- [ ] `furniture3d.ts`：新增按键排序的序列化函数（只在本文件内使用）
- [ ] `furniture3d.ts`：`validModel3d` 改用该函数比较整理前后的模型
- [ ] `furniture3d.test.ts`：新增用例——字段顺序被打乱（模拟数据库返回）的合法模型仍判为合法
- [ ] 确认已有用例「多一位小数即判为不合法」仍然成立（规则没有放宽）

## Verification checklist
- [ ] 正向：打乱字段顺序的模型 → `validModel3d` 返回 `true`；含该模型的方案能通过 `validateDesign`
- [ ] 负向：数值被改（如 `x: 0.0001`）、颜色非法、部件越界 → 仍返回 `false`
- [ ] 默认：没有 `model3d` 的家具不受影响
- [ ] 运行 `pnpm test`（`src/features/interior` 全部用例）与 `pnpm exec tsc --noEmit`、`pnpm lint`
- [ ] 在预览里打开「一层」，不再弹出错误，布局与之前缩略图一致
