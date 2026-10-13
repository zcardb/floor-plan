# account · 登录与注册

## 职责

邮箱 + 密码的登录 / 注册弹窗（`components/auth-dialog.tsx`）。登录态本身由 `projects` 的 `useProjects` 维护；账号头像是共享组件 `components/account-avatar`。

## 公开入口

`AuthDialog`（lazy，首次打开时才下载）。

## 规则

- 登录请求经 `@/lib/backend` 的 `backend()` 发出，不直接导入 Supabase 客户端。
