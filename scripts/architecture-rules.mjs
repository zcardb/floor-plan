import path from 'node:path';

/**
 * 目录分层规则（路径均相对 src/）：
 * - app/：入口、路由、页面装配；只经公开入口使用 Feature。
 * - features/<名>/：业务用例；跨 Feature 只走对方的 index，内部不绕回自己的 index。
 * - components/、contexts/、lib/、hooks/、utils/：共享层，不依赖 features/ 与 app/。
 * - 第三方 / 平台 SDK 由唯一的模块持有：three 只在 features/scene-3d，Supabase 只在 lib/backend；
 *   启动时就创建的同步客户端（lib/backend/supabase）只给登录会话 useProjects，其余一律用按需加载的 backend()。
 */
const SHARED = /^(components|contexts|lib|hooks|utils)\//;

function appTarget(from, specifier) {
  if (specifier.startsWith('@/')) return specifier.slice(2);
  if (specifier.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  return null;
}

/** 返回这条导入违反的规则名；合规返回 null。from 为导入方相对 src/ 的路径。 */
export function inspectImport(from, specifier) {
  const target = appTarget(from, specifier);
  const feature = target?.match(/^features\/([^/]+)(?:\/(.*))?$/);
  if (feature) {
    if (SHARED.test(from)) return 'feature-owned-business';
    const owner = from.match(/^features\/([^/]+)\//)?.[1];
    const entry = feature[2]?.replace(/\.[cm]?[jt]sx?$/, '') ?? '';
    const isEntry = entry === '' || entry === 'index';
    if (owner !== feature[1] && !isEntry) return 'feature-public-entry';
    if (owner === feature[1] && isEntry && !/^features\/[^/]+\/index\.[cm]?[jt]sx?$/.test(from)) return 'feature-self-entry';
  }
  if (target?.startsWith('app/') && !from.startsWith('app/') && from !== 'main.tsx') return 'app-owned-routing';
  const isPackage = (name) => specifier === name || specifier.startsWith(name + '/');
  if (isPackage('three') && !from.startsWith('features/scene-3d/')) return 'three-owner';
  if (target?.startsWith('integrations/supabase/') && !from.startsWith('lib/backend/')) return 'backend-owner';
  if (target?.replace(/\.[cm]?[jt]sx?$/, '') === 'lib/backend/supabase' && from !== 'features/projects/hooks/use-projects.ts') return 'session-client-owner';
  return null;
}
