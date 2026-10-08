import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, LockKeyhole, Cloud, Loader2 } from "lucide-react";
export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="auth-dialog">
        <div className="dialog-emblem">
          <Cloud size={24} />
        </div>
        <DialogHeader>
          <DialogTitle>
            {signup ? "创建你的设计账号" : "让设计，随处可见"}
          </DialogTitle>
          <DialogDescription>
            登录后保存多个云端项目。游客模式始终可以免费编辑和下载。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            const form = new FormData(e.currentTarget),
              email = String(form.get("email")),
              password = String(form.get("password"));
            const result = signup
              ? await supabase.auth.signUp({
                  email,
                  password,
                  options: { emailRedirectTo: window.location.origin + "/" },
                })
              : await supabase.auth.signInWithPassword({ email, password });
            setBusy(false);
            if (result.error) {
              setError(
                result.error.message.includes("Invalid login")
                  ? "邮箱或密码不正确，请重试。"
                  : result.error.message,
              );
              return;
            }
            onOpenChange(false);
          }}
        >
          <label className="auth-field">
            <span>邮箱</span>
            <div>
              <Mail size={17} />
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
          </label>
          <label className="auth-field">
            <span>密码</span>
            <div>
              <LockKeyhole size={17} />
              <input
                name="password"
                type="password"
                placeholder="至少 6 位密码"
                minLength={6}
                required
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </div>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button className="auth-submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {signup ? "注册并继续" : "登录"}
          </Button>
        </form>
        <button
          className="auth-toggle"
          onClick={() => {
            setSignup(!signup);
            setError("");
          }}
        >
          {signup ? "已有账号？前往登录" : "还没有账号？注册一个"}
        </button>
        <button className="muted-note" onClick={() => onOpenChange(false)}>
          暂不登录，继续游客设计
        </button>
      </DialogContent>
    </Dialog>
  );
}
