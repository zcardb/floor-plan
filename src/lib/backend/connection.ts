/**
 * 按需加载的 Supabase 客户端：首屏与组件测试不必在模块顶层创建客户端（它在模块加载时就读 localStorage）。
 * 需要访问后端的地方统一 `const supabase = await backend()`。
 */
export const backend = async () => (await import("@/integrations/supabase/client")).supabase;

/** 当前登录用户的 id；未登录时抛错（写入账号数据之前调用）。 */
export async function requireUserId(): Promise<string> {
  const { data: { session } } = await (await backend()).auth.getSession();
  if (!session) throw new Error("请先登录");
  return session.user.id;
}
