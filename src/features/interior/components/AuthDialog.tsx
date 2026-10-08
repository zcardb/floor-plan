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
import { Input } from "@/components/ui/input";
import { Mail, LockKeyhole, Cloud, Loader2 } from "lucide-react";
const authInput =
  "h-auto border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-xs max-[700px]:text-base";
export function AuthDialog({
  open,
  onOpenChange,
  intent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  intent?: "cloud" | null;
}) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const saving = intent === "cloud";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="auth-dialog">
        <div className="dialog-emblem">
          <Cloud size={24} />
        </div>
        <DialogHeader>
          <DialogTitle>
            {signup
              ? saving
                ? "注册并保存你的设计"
                : "创建你的设计账号"
              : saving
                ? "登录后保存到云端"
                : "让设计，随处可见"}
          </DialogTitle>
          <DialogDescription>
            {saving
              ? "注册或登录后，当前的设计会保存成你的云端项目。游客模式依旧可以免费编辑和下载。"
              : "登录后保存多个云端项目。游客模式始终可以免费编辑和下载。"}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setMessage("");
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
            if (!result.data.session) {
              setMessage(
                saving
                  ? "注册成功，请查收验证邮件。完成验证后登录，当前的设计会自动保存到云端。"
                  : "注册成功，请查收验证邮件。完成验证后登录进入工作室。",
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
              <Input
                className={authInput}
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
              <Input
                className={authInput}
                name="password"
                type="password"
                placeholder="至少 6 位密码"
                minLength={6}
                required
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </div>
          </label>
          {message && (
            <p role="status" className="muted-note">
              {message}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button className="auth-submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {signup ? (saving ? "注册并保存到云端" : "注册并继续") : "登录"}
          </Button>
        </form>
        <button
          className="auth-toggle"
          onClick={() => {
            setSignup(!signup);
            setError("");
            setMessage("");
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
