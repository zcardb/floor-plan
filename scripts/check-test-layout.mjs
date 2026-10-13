import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 测试统一用 Vitest，并放在所属模块的 __tests__/ 目录里；__tests__/ 之外不得出现测试文件。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isTest = (name) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}
const findings = [];
let count = 0;
for (const dir of ['src', 'scripts']) {
  for (const file of files(path.join(root, dir))) {
    const relative = path.relative(root, file);
    if (!isTest(file)) continue;
    count++;
    if (!relative.split(path.sep).includes('__tests__')) findings.push({ file: relative, rule: 'tests-in-__tests__' });
    if (/from\s+['"](node:test|@jest\/globals|jest)['"]/.test(fs.readFileSync(file, 'utf8'))) findings.push({ file: relative, rule: 'vitest-only' });
  }
}
if (findings.length) {
  console.error(JSON.stringify(findings, null, 2));
  process.exitCode = 1;
} else console.log(`测试目录检查通过：${count} 个测试文件都在 __tests__/ 里且使用 Vitest。`);
