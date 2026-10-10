# 原木之家：承重墙还原 + 游客默认选中原木之家

## Context
- 模板生成时会执行「清空分割」（`mergeAllSplits`），把同一直线上的墙段一拉到底合并。合并规则 `chainBase`（`wallBulk.ts` 第 58 行）是「任一段承重则整面墙承重」，于是原木之家角落那几小段承重墙把整面外墙都带成了承重墙，整圈标红。
- 模板原始数据（`templates.ts` 的 `walls` 数组，`"b"` 标记的角落小段）从未改过，只要模板合并时不把承重段和非承重段合在一起，就能还原成之前的样式：只有角落小段是承重墙，门窗仍可沿墙拖动。
- 游客模式下，打开应用时现在会恢复「上次选的模板」；用户要求默认选中原木之家。另外本机已保存的旧原木之家默认方案带着整圈承重墙，需要重置才能看到新样式。

## 方案
1. **`src/features/interior/model/wallBulk.ts`**
   - `collinearWallChains(design, opts?)` 新增可选参数 `{ keepBearingRuns?: boolean }`：开启时，相邻墙段承重状态（`isBearingWall`）不同就断开成两条链。
   - `mergeAllSplits(design, opts?)` 透传该参数。
   - 用户手动点「清空分割」、`splitPointCount` 都不传参数，行为不变。
2. **`src/features/interior/data/templates.ts`**
   - `TEMPLATE_PRESETS` 的 build 改为 `mergeAllSplits(preset.build(), { keepBearingRuns: true }).design`。承重小段保持独立（kind `bearing`），外墙/隔墙/门窗段照常合并。
3. **`src/features/interior/cloud/guestStore.ts`**（游客默认）
   - `readGuestDefault(templateId = 'reference')`：打开应用、退出登录后都默认选中原木之家；删除 `lastGuestTemplate` 与 `LAST_GUEST_TEMPLATE_KEY`（`writeGuestDefault` 不再写它）。各模板各自保存的改动仍保留，切换到哪个模板就读哪个。
   - `GUEST_DEFAULT_KEY` 升级为 `interior-guest-default-v2`，旧的 v1（整圈承重的旧方案）不再读取；在已有的启动清理 `purgeRecoveryCopies` 里顺手删除旧 v1 键和 `interior-guest-template-v1` 键。
   - 不改动：云端项目、本机方案列表（`GUEST_KEY`）里用户自己的项目数据。
4. **测试**
   - `wallBulk.test.ts`：新增「keepBearingRuns 时承重段与外墙段不合并」用例；原有默认合并用例不变。
   - `templateAutoMerge.test.ts`：新增「原木之家只有原始承重小段承重」——`designForTemplate('reference')` 中所有承重墙 `kind === 'bearing'`，没有 `loadBearing: true` 的外墙，承重墙总长等于 `referenceDesign()` 的承重墙总长。
   - `guestStore.test.ts`：「刷新恢复最后选择」改为「刷新默认选中原木之家，各模板改动仍保留」；新增旧 v1 键被清理的断言。

## Implementation checklist
- [ ] `collinearWallChains` 支持 `keepBearingRuns`，承重状态变化处断链
- [ ] `mergeAllSplits` 透传 `keepBearingRuns`，默认行为不变
- [ ] `TEMPLATE_PRESETS` 构建时使用 `{ keepBearingRuns: true }`
- [ ] `readGuestDefault` 默认模板改为 `'reference'`，移除 `lastGuestTemplate` / `LAST_GUEST_TEMPLATE_KEY` 的读写
- [ ] `GUEST_DEFAULT_KEY` 升级为 v2，`purgeRecoveryCopies` 删除旧 v1 默认方案键与上次模板键
- [ ] 补充/更新上述三处测试

## Verification checklist
- [ ] 正向：原木之家预览中只有角落小段为红色承重墙，外墙其余部分为外围墙颜色
- [ ] 正向：原木之家所有门仍可沿墙拖动（现有 `templateAutoMerge` 用例通过）
- [ ] 默认：游客模式刷新后默认打开原木之家；切换到其他模板并编辑后刷新，仍回到原木之家，且其他模板的改动切回时仍在
- [ ] 回归：手动「清空分割」仍把承重段与相邻墙合并为一整面承重墙（现有 wallBulk 用例通过）
- [ ] 边界：其他 5 个模板（无承重墙）合并结果不变
- [ ] 运行 `pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm run build`
