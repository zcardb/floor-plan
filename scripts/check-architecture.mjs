import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inspectImport } from './architecture-rules.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
// 测试、类型声明与平台生成的代码（Supabase 客户端、shadcn 组件、i18n 脚手架）不参与检查。
const excluded = /(^|\/)(__tests__|integrations|i18n|components\/ui)(\/|$)|\.(test|testing)\.[cm]?[jt]sx?$|\.d\.ts$/;
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    if (excluded.test(path.relative(src, name))) return [];
    return entry.isDirectory() ? files(name) : /\.[cm]?[jt]sx?$/.test(name) ? [name] : [];
  });
}
const config = ts.readConfigFile(path.join(root, 'tsconfig.app.json'), ts.sys.readFile).config;
const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root);
const findings = [];
const graph = new Map();
const sourceFiles = files(src);
for (const file of sourceFiles) {
  const relative = path.relative(src, file);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const edges = new Set();
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  function add(specifier, node, typeOnly = false) {
    const rule = inspectImport(relative, specifier);
    if (rule) findings.push({ file: relative, line: line(node), specifier, rule });
    if (typeOnly) return;
    const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule?.resolvedFileName;
    if (resolved?.startsWith(src + '/') && /\.[cm]?[jt]sx?$/.test(resolved) && !excluded.test(path.relative(src, resolved))) edges.add(resolved);
  }
  function scan(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypes = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((item) => item.isTypeOnly));
      add(node.moduleSpecifier.text, node, onlyTypes);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      if (!node.exportClause && !node.isTypeOnly) findings.push({ file: relative, line: line(node), specifier: node.moduleSpecifier.text, rule: 'no-export-star' });
      const onlyTypes = node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every((item) => item.isTypeOnly));
      add(node.moduleSpecifier.text, node, onlyTypes);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) add(node.argument.literal.text, node, true);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) add(node.arguments[0].text, node);
    ts.forEachChild(node, scan);
  }
  scan(source);
  graph.set(file, edges);
}

const visited = new Set();
const active = new Set();
function visit(file, chain = []) {
  if (active.has(file)) {
    findings.push({ file: path.relative(src, file), rule: 'runtime-import-cycle', chain: [...chain.slice(chain.indexOf(file)), file].map((name) => path.relative(src, name)) });
    return;
  }
  if (visited.has(file)) return;
  visited.add(file); active.add(file);
  for (const target of graph.get(file) ?? []) visit(target, [...chain, file]);
  active.delete(file);
}
sourceFiles.forEach((file) => visit(file));
if (findings.length) {
  console.error(JSON.stringify(findings, null, 2));
  process.exitCode = 1;
} else console.log(`架构检查通过：${sourceFiles.length} 个源码文件，无跨 Feature 私有导入、共享层越界、SDK owner 越界或运行时循环。`);
