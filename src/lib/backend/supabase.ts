/**
 * 同步的 Supabase 客户端：模块一加载就创建客户端（会读 localStorage），并随首屏一起下载。
 * 只给启动时就要订阅登录态、维护会话的项目会话（features/projects 的 useProjects）使用；
 * 其余后端访问一律用 `backend()` 按需加载，组件测试也不必创建客户端。
 */
export { supabase } from "@/integrations/supabase/client";
